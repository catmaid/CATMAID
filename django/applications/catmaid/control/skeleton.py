from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.node import _fetch_location
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.neuron import _in_isolated_synaptic_terminals, _delete_if_empty
import sys
from collections import defaultdict
import json
from operator import itemgetter
import networkx as nx
from tree_util import reroot, edge_count_to_root

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def last_openleaf(request, project_id=None, skeleton_id=None):
    """ Return the ID of the nearest node (or itself), and its location string;
    or two nulls if none found. """
    tnid = int(request.POST['tnid'])
    cursor = connection.cursor()

    # Select all nodes and their tags
    cursor.execute('''
    SELECT t.id, t.parent_id, t.location, ci.name
    FROM treenode t LEFT OUTER JOIN (treenode_class_instance tci INNER JOIN class_instance ci ON tci.class_instance_id = ci.id) ON t.id = tci.treenode_id
    WHERE t.skeleton_id = %s
    ''' % int(skeleton_id))

    # Some entries repeated, when a node has more than one tag
    # Create a graph with edges from parent to child, and accumulate parents
    tree = nx.DiGraph()
    for row in cursor.fetchall():
        nodeID = row[0]
        if row[1]:
            # It is ok to add edges that already exist: DiGraph doesn't keep duplicates
            tree.add_edge(row[1], nodeID)
        else:
            tree.add_node(nodeID)
        tree.node[nodeID]['loc'] = row[2]
        if row[3]:
            props = tree.node[nodeID]
            tags = props.get('tags')
            if tags:
                tags.append(row[3])
            else:
                props['tags'] = [row[3]]

    if tnid not in tree:
        raise Exception("Could not find %s in skeleton %s" % (tnid, int(skeleton_id)))

    reroot(tree, tnid)
    distances = edge_count_to_root(tree, root_node=tnid)

    # Iterate end nodes, find closest
    nearest = None
    distance = tree.number_of_nodes() + 1
    loc = None
    other_tags = set(('uncertain continuation', 'not a branch', 'soma'))

    for nodeID, out_degree in tree.out_degree_iter():
        if 0 == out_degree:
            # Found an end node
            props = tree.node[nodeID]
            # Check if not tagged with a tag containing 'end'
            if not 'tags' in props and not [s for s in props if 'end' in s or s in other_tags]:
                # Found an open end
                d = distances[nodeID]
                if d < distance:
                    nearest = nodeID
                    distance = d
                    loc = props['loc']

    return HttpResponse(json.dumps((nearest, loc)))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_statistics(request, project_id=None, skeleton_id=None):
    p = get_object_or_404(Project, pk=project_id)
    skel = Skeleton( skeleton_id = skeleton_id, project_id = project_id )
    const_time = skel.measure_construction_time()
    construction_time = '{0} minutes {1} seconds'.format( const_time / 60, const_time % 60)
    return HttpResponse(json.dumps({
        'node_count': skel.node_count(),
        'input_count': skel.input_count(),
        'output_count': skel.output_count(),
        'presynaptic_sites': skel.presynaptic_sites_count(),
        'postsynaptic_sites': skel.postsynaptic_sites_count(),
        'cable_length': int(skel.cable_length()),
        'measure_construction_time': construction_time,
        'percentage_reviewed': "%.2f" % skel.percentage_reviewed() }), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_count(request, project_id=None, skeleton_id=None, treenode_id=None):
    # Works with either the skeleton_id or the treenode_id
    p = get_object_or_404(Project, pk=project_id)
    if not skeleton_id:
        skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id
    return HttpResponse(json.dumps({
        'count': Treenode.objects.filter(skeleton_id=skeleton_id).count(),
        'skeleton_id': skeleton_id}), mimetype='text/json')

def _get_neuronname_from_skeletonid( project_id, skeleton_id ):
    p = get_object_or_404(Project, pk=project_id)
    qs = ClassInstanceClassInstance.objects.filter(
                relation__relation_name='model_of',
                project=p,
                class_instance_a=int(skeleton_id)).select_related("class_instance_b")
    return {'neuronname': qs[0].class_instance_b.name,
        'neuronid': qs[0].class_instance_b.id }

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronname(request, project_id=None, skeleton_id=None):
    return HttpResponse(json.dumps(_get_neuronname_from_skeletonid(project_id, skeleton_id)), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronnames(request, project_id=None):
    """ Returns a JSON object with skeleton IDs as keys and neuron names as values. """
    skeleton_ids = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids['))
    qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=project_id,
            class_instance_a__in=skeleton_ids).select_related("class_instance_b").values_list("class_instance_a", "class_instance_b__name")
    return HttpResponse(json.dumps(dict(qs)))

@requires_user_role(UserRole.Annotate)
def split_skeleton(request, project_id=None):
    """ The split is only possible if the user owns the treenode or the skeleton, or is superuser, or the skeleton is under Fragments.
    """
    treenode_id = int(request.POST['treenode_id'])
    treenode = Treenode.objects.get(pk=treenode_id)
    skeleton_id = treenode.skeleton_id
    cursor = connection.cursor()

    # Check if the treenode is root!
    if not treenode.parent:
        return HttpResponse(json.dumps({'error': 'Can\'t split at the root node: it doesn\'t have a parent.'}))

    # The split is only possible if the user owns the treenode or the skeleton
    # or the skeleton is under fragments or in the user's staging area
    # Ordered from cheap to expensive query
    try:
        # Check if user can edit the skeleton
        can_edit_or_fail(request.user, skeleton_id, "class_instance")
    except:
        try:
            # Check if user can edit the treenode
            can_edit_or_fail(request.user, treenode_id, "treenode")
        except:
            if not _under_fragments(skeleton_id):
                # Check skeleton under user's staging area (indirect ownership)
                if not _under_staging_area(request.user, skeleton_id):
                    raise Exception("User '%s' can't edit skeleton #%s at node #%s:\nThe user doesn't own the skeleton or the node;\nthe skeleton is not under fragments;\nand the skeleton is not under the user's staging group." % (request.user.username, skeleton_id, treenode_id))

    skeleton = ClassInstance.objects.select_related('user').get(pk=skeleton_id)
    project_id=int(project_id)

    # retrieve neuron of this skeleton
    neuron = ClassInstance.objects.get(
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a_id=skeleton_id)
    # retrieve the id, parent_id of all nodes in the skeleton
    # with minimal ceremony
    cursor.execute('''
    SELECT id, parent_id FROM treenode WHERE skeleton_id=%s
    ''' % skeleton_id) # no need to sanitize
    # build the networkx graph from it
    graph = nx.DiGraph()
    for row in cursor.fetchall():
        graph.add_node( row[0] )
        if row[1]:
            # edge from parent_id to id
            graph.add_edge( row[1], row[0] )
    # find downstream nodes starting from target treenode_id
    # and generate the list of IDs to change, starting at treenode_id (inclusive)
    change_list = nx.bfs_tree(graph, treenode_id).nodes()
    if not change_list:
        # When splitting an end node, the bfs_tree doesn't return any nodes,
        # which is surprising, because when the splitted tree has 2 or more nodes
        # the node at which the split is made is included in the list.
        change_list.append(treenode_id)
    # create a new skeleton
    new_skeleton = ClassInstance()
    new_skeleton.name = 'Skeleton'
    new_skeleton.project_id = project_id
    new_skeleton.user = skeleton.user # The same user that owned the skeleton to split
    new_skeleton.class_column = Class.objects.get(class_name='skeleton', project_id=project_id)
    new_skeleton.save()
    new_skeleton.name = 'Skeleton {0}'.format( new_skeleton.id ) # This could be done with a trigger in the database
    new_skeleton.save()
    # Assign the skeleton to the same neuron
    cici = ClassInstanceClassInstance()
    cici.class_instance_a = new_skeleton
    cici.class_instance_b = neuron
    cici.relation = Relation.objects.get(relation_name='model_of', project_id=project_id)
    cici.user = skeleton.user # The same user that owned the skeleton to split
    cici.project_id = project_id
    cici.save()
    # update skeleton_id of list in treenode table
    # This creates a lazy QuerySet that, upon calling update, returns a new QuerySet
    # that is then executed. It does NOT create an update SQL query for every treenode.
    tns = Treenode.objects.filter(id__in=change_list).update(skeleton=new_skeleton)
    # update the skeleton_id value of the treenode_connector table
    tc = TreenodeConnector.objects.filter(
        relation__relation_name__endswith = 'synaptic_to',
        treenode__in=change_list,
    ).update(skeleton=new_skeleton)
    # setting new root treenode's parent to null
    Treenode.objects.filter(id=treenode_id).update(parent=None, editor=request.user)
    # Log the location of the node at which the split was done
    insert_into_log( project_id, request.user.id, "split_skeleton", treenode.location, "Split skeleton with ID {0} (neuron: {1})".format( skeleton_id, neuron.name ) )
    return HttpResponse(json.dumps({}), mimetype='text/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def root_for_skeleton(request, project_id=None, skeleton_id=None):
    tn = Treenode.objects.get(
        project=project_id,
        parent__isnull=True,
        skeleton_id=skeleton_id)
    return HttpResponse(json.dumps({
        'root_id': tn.id,
        'x': tn.location.x,
        'y': tn.location.y,
        'z': tn.location.z}),
        mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_ancestry(request, project_id=None):
    # All of the values() things in this function can be replaced by
    # prefetch_related when we upgrade to Django 1.4 or above
    skeleton_id = int(request.POST.get('skeleton_id', None))
    if skeleton_id is None:
        raise Exception('A skeleton id has not been provided!')

    relation_map = get_relation_to_id_map(project_id)
    for rel in ['model_of', 'part_of']:
        if rel not in relation_map:
            raise Exception(' => "Failed to find the required relation %s' % rel)

    response_on_error = ''
    try:
        response_on_error = 'The search query failed.'
        neuron_rows = ClassInstanceClassInstance.objects.filter(
            class_instance_a=skeleton_id,
            relation=relation_map['model_of']).values(
            'class_instance_b',
            'class_instance_b__name')
        neuron_count = neuron_rows.count()
        if neuron_count == 0:
            raise Exception('No neuron was found that the skeleton %s models' % skeleton_id)
        elif neuron_count > 1:
            raise Exception('More than one neuron was found that the skeleton %s models' % skeleton_id)

        parent_neuron = neuron_rows[0]
        ancestry = []
        ancestry.append({
            'name': parent_neuron['class_instance_b__name'],
            'id': parent_neuron['class_instance_b'],
            'class': 'neuron'})

        # Doing this query in a loop is horrible, but it should be very rare
        # for the hierarchy to be more than 4 deep or so.  (This is a classic
        # problem of not being able to do recursive joins in pure SQL.)
        # Detects erroneous cyclic hierarchy.
        current_ci = parent_neuron['class_instance_b']
        seen = set([current_ci])
        while True:
            response_on_error = 'Could not retrieve parent of class instance %s' % current_ci
            parents = ClassInstanceClassInstance.objects.filter(
                class_instance_a=current_ci,
                relation=relation_map['part_of']).values(
                'class_instance_b__name',
                'class_instance_b',
                'class_instance_b__class_column__class_name')
            parent_count = parents.count()
            if parent_count == 0:
                break  # We've reached the top of the hierarchy.
            elif parent_count > 1:
                raise Exception('More than one class_instance was found that the class_instance %s is part_of.' % current_ci)
            else:
                parent = parents[0]
                ancestry.append({
                    'name': parent['class_instance_b__name'],
                    'id': parent['class_instance_b'],
                    'class': parent['class_instance_b__class_column__class_name']
                })
                current_ci = parent['class_instance_b']
                if current_ci in seen:
                    raise Exception('Cyclic hierarchy detected for skeleton #%s' % skeleton_id)

        return HttpResponse(json.dumps(ancestry))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

def _connected_skeletons(skeleton_ids, op, relation_id_1, relation_id_2, model_of_id, cursor):
    class Partner:
        def __init__(self):
            self.name = None
            self.num_nodes = 0
            self.reviewed = 0 # percentage reviewed
            self.skids = defaultdict(int) # skid vs synapse count

    # Dictionary of partner skeleton ID vs Partner
    def newPartner():
        return Partner()
    partners = defaultdict(newPartner)

    # Obtain the synapses made by all skeleton_ids considering the desired direction of the synapse, as specified by relation_id_1 and relation_id_2:
    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id
    FROM treenode_connector t1,
         treenode_connector t2
    WHERE t1.skeleton_id IN (%s)
      AND t1.relation_id = %s
      AND t1.connector_id = t2.connector_id
      AND t2.relation_id = %s
    ''' % (','.join(str(skid) for skid in skeleton_ids), int(relation_id_1), int(relation_id_2)))

    # Sum the number of synapses
    for srcID, partnerID in cursor.fetchall():
        partners[partnerID].skids[srcID] += 1

    # There may not be any synapses
    if not partners:
        return partners

    # If op is AND, discard entries where only one of the skids has synapses
    if len(skeleton_ids) > 1 and 'AND' == op:
        for partnerID in partners.keys(): # keys() is a copy of the keys
            if 1 == len(partners[partnerID].skids):
                del partners[partnerID]

    # With AND it is possible that no common partners exist
    if not partners:
        return partners

    # Obtain a string with unique skeletons
    skids_string = ','.join(str(x) for x in partners.iterkeys())

    # Count nodes of each partner skeleton
    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM treenode
    WHERE skeleton_id IN (%s)
    GROUP BY skeleton_id
    ''' % skids_string) # no need to sanitize
    for row in cursor.fetchall():
        partners[row[0]].num_nodes = row[1]

    # Count reviewed nodes of each skeleton
    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM treenode
    WHERE skeleton_id IN (%s)
      AND reviewer_id=-1
    GROUP BY skeleton_id
    ''' % skids_string) # no need to sanitize
    seen = set()
    for row in cursor.fetchall():
        seen.add(row[0])
        partner = partners[row[0]]
        partner.reviewed = int(100.0 * (1 - float(row[1]) / partner.num_nodes))
    # If 100%, it will not be there, so add it
    for partnerID in set(partners.keys()) - seen:
        partner = partners[partnerID]
        if 0 == partner.reviewed:
            partner.reviewed = 100

    # Obtain name of each skeleton's neuron
    cursor.execute('''
    SELECT class_instance_class_instance.class_instance_a,
           class_instance.name
    FROM class_instance_class_instance,
         class_instance
    WHERE class_instance_class_instance.relation_id=%s
      AND class_instance_class_instance.class_instance_a IN (%s)
      AND class_instance.id=class_instance_class_instance.class_instance_b
    ''' % (model_of_id, skids_string)) # No need to sanitize, and would quote skids_string
    for row in cursor.fetchall():
        partners[row[0]].name = '%s / skeleton %s' % (row[1], row[0])

    return partners

def _skeleton_info_raw(project_id, skeletons, synaptic_count_high_pass, op):
    cursor = connection.cursor()

    # Obtain the IDs of the 'presynaptic_to', 'postsynaptic_to' and 'model_of' relations
    cursor.execute('''
    SELECT relation_name,
           id
    FROM relation
    WHERE project_id=%s
      AND (relation_name='presynaptic_to'
        OR relation_name='postsynaptic_to'
        OR relation_name='model_of')''' % project_id)
    relation_ids = dict(cursor.fetchall())

    # Obtain partner skeletons and their info
    incoming = _connected_skeletons(skeletons, op, relation_ids['postsynaptic_to'], relation_ids['presynaptic_to'], relation_ids['model_of'], cursor)
    outgoing = _connected_skeletons(skeletons, op, relation_ids['presynaptic_to'], relation_ids['postsynaptic_to'], relation_ids['model_of'], cursor)

    # TODO this filtering should be done in the client
    # Remove skeleton IDs under synaptic_count_high_pass and jsonize class instances
    def prepare(partners):
        for partnerID in partners.keys():
            partner = partners[partnerID]
            skids = partner.skids
            for skid in skids.keys():
                if skids[skid] < synaptic_count_high_pass:
                    del skids[skid]
            # jsonize: swap class instance by its dict of members vs values
            if skids:
                partners[partnerID] = partner.__dict__
            else:
                del partners[partnerID]

    prepare(incoming)
    prepare(outgoing)

    return incoming, outgoing

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_info_raw(request, project_id=None):
    # sanitize arguments
    project_id = int(project_id)
    skeletons = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('source['))
    synaptic_count_high_pass = int( request.POST.get( 'threshold', 0 ) )
    op = request.POST.get('boolean_op') # values: AND, OR
    op = {'AND': 'AND', 'OR': 'OR'}[op[6:]] # sanitize

    incoming, outgoing = _skeleton_info_raw(project_id, skeletons, synaptic_count_high_pass, op)

    return HttpResponse(json.dumps({'incoming': incoming, 'outgoing': outgoing}), mimetype='text/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_info(request, project_id=None, skeleton_id=None):
    # This function can take as much as 15 seconds for a mid-sized arbor
    # Problems in the generated SQL:
    # 1. Many repetitions of the query: SELECT ...  FROM "relation" WHERE "relation"."project_id" = 4. Originates in one call per connected skeleton, in Skeleton._fetch_upstream_skeletons and _fetch_downstream_skeletons
    # 2. Usage of WHERE project_id = 4, despite IDs being unique. Everywhere.
    # 3. Lots of calls to queries similar to: SELECT ...  FROM "class_instance" WHERE "class_instance"."id" = 17054183


    p = get_object_or_404(Project, pk=project_id)

    synaptic_count_high_pass = int( request.POST.get( 'threshold', 10 ) )


    skeleton = Skeleton( skeleton_id, project_id )

    data = {
        'incoming': {},
        'outgoing': {}
    }

    for skeleton_id_upstream, synaptic_count in skeleton.upstream_skeletons.items():
        if synaptic_count >= synaptic_count_high_pass:
            tmp_skeleton = Skeleton( skeleton_id_upstream )
            data['incoming'][skeleton_id_upstream] = {
                'synaptic_count': synaptic_count,
                'skeleton_id': skeleton_id_upstream,
                'percentage_reviewed': '%i' % tmp_skeleton.percentage_reviewed(),
                'node_count': tmp_skeleton.node_count(),
                'name': '{0} / skeleton {1}'.format( tmp_skeleton.neuron.name, skeleton_id_upstream)
            }

    for skeleton_id_downstream, synaptic_count in skeleton.downstream_skeletons.items():
        if synaptic_count >= synaptic_count_high_pass:
            tmp_skeleton = Skeleton( skeleton_id_downstream )
            data['outgoing'][skeleton_id_downstream] = {
                'synaptic_count': synaptic_count,
                'skeleton_id': skeleton_id_downstream,
                'percentage_reviewed': '%i' % tmp_skeleton.percentage_reviewed(),
                'node_count': tmp_skeleton.node_count(),
                'name': '{0} / skeleton {1}'.format( tmp_skeleton.neuron.name, skeleton_id_downstream)
            }

    result = {
        'incoming': list(reversed(sorted(data['incoming'].values(), key=itemgetter('synaptic_count')))),
        'outgoing': list(reversed(sorted(data['outgoing'].values(), key=itemgetter('synaptic_count'))))
    }
    json_return = json.dumps(result, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')


@requires_user_role(UserRole.Annotate)
def reroot_skeleton(request, project_id=None):
    """ Any user with an Annotate role can reroot any skeleton.
    """
    treenode_id = request.POST.get('treenode_id', None)
    treenode = _reroot_skeleton(treenode_id, project_id)
    response_on_error = ''
    try:
        if treenode:
            response_on_error = 'Failed to log reroot.'
            insert_into_log(project_id, request.user.id, 'reroot_skeleton', treenode.location, 'Rerooted skeleton for treenode with ID %s' % treenode.id)
            return HttpResponse(json.dumps({'newroot': treenode.id}))
        # Else, already root
        return HttpResponse(json.dumps({'error': 'Node #%s is already root!' % treenode_id}))
    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _reroot_skeleton(treenode_id, project_id):
    """ Returns the treenode instance that is now root,
    or False if the treenode was root already. """
    if treenode_id is None:
        raise Exception('A treenode id has not been provided!')

    response_on_error = ''
    try:
        response_on_error = 'Failed to select treenode with id %s.' % treenode_id
        q_treenode = Treenode.objects.filter(
            id=treenode_id,
            project=project_id)

        # Obtain the treenode from the response
        response_on_error = 'An error occured while rerooting. No valid query result.'
        treenode = q_treenode[0]
        first_parent = treenode.parent

        # If no parent found it is assumed this node is already root
        if first_parent is None:
            return False

        # Traverse up the chain of parents, reversing the parent relationships so
        # that the selected treenode (with ID treenode_id) becomes the root.
        new_parent = treenode
        new_confidence = treenode.confidence
        node = first_parent

        while True:
            response_on_error = 'Failed to update treenode with id %s to have new parent %s' % (node.id, new_parent.id)

            # Store current values to be used in next iteration
            parent = node.parent
            confidence = node.confidence

            # Set new values
            node.parent = new_parent
            node.confidence = new_confidence
            node.save()

            if parent is None:
                # Root has been reached
                break
            else:
                # Prepare next iteration
                new_parent = node
                new_confidence = confidence
                node = parent

        # Finally make treenode root
        response_on_error = 'Failed to set treenode with ID %s as root.' % treenode.id
        treenode.parent = None
        treenode.confidence = 5 # reset to maximum confidence, now it is root.
        treenode.save()

        return treenode

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _root_as_parent(oid):
    """ Returns True if the parent group of the given element ID is the root group. """
    cursor = connection.cursor()
    # Try to select the parent group of the parent group;
    # if none, then the parent group is the root group.
    cursor.execute('''
    SELECT count(*)
    FROM class_instance_class_instance cici1,
         class_instance_class_instance cici2,
         relation r
    WHERE cici1.class_instance_a = %s
      AND cici1.class_instance_b = cici2.class_instance_a
      AND cici1.relation_id = r.id
      AND r.relation_name = 'part_of'
      AND cici2.class_instance_a = cici1.class_instance_b
      AND cici2.relation_id = r.id
    ''' % int(oid))
    return 0 == cursor.fetchone()[0]

def _staging_as_parent(oid):
    """ Returns True if the parent is named Staging and its parent is the root group. """
    cursor = connection.cursor()
    cursor.execute('''
    SELECT count(*)
    FROM class_instance_class_instance cici1,
         class_instance_class_instance cici2,
         class_instance ci1,
         class_instance ci2,
         relation r,
         class c
    WHERE cici1.class_instance_a = %s
      AND cici1.class_instance_b = ci1.id
      AND ci1.name = 'Staging'
      AND cici1.relation_id = r.id
      AND r.relation_name = 'part_of'
      AND cici2.class_instance_a = cici1.class_instance_b
      AND cici2.class_instance_b = ci2.id
      AND cici2.relation_id = r.id
      AND ci2.class_id = c.id
      AND c.class_name = 'root'
    ''' % int(oid))
    return 1 == cursor.fetchone()[0]

def _under_fragments(skeleton_id):
    """ Returns True if the skeleton_id is a model_of a neuron that is part_of
    a group that is or is within the hierarchy downstream of the "Fragments" group
    or the "Isolated synaptic terminals" group.
    """
    return _under_specific_groups(skeleton_id, set(['Fragments', 'Isolated synaptic terminals']), _root_as_parent)

def _under_staging_area(skeleton_id, user):
    """ Returns true if the skeleton_id is a model_of a neuron that is part_of
    a group that is or is within the hierarchy downstream of the user's staging area,
    defined by ther user.first_name and user.last_name.
    """
    return _under_specific_groups(skeleton_id, set(['%s %s (%s)' % (user.first_name, user.last_name, user.username)]), _staging_as_parent)

def _under_specific_groups(skeleton_id, specific_groups, group_id_test_fn):
    cursor = connection.cursor()
    # Find the ID and name of the group for which the neuron is a part_of,
    # where the skeleton is a model_of that neuron
    cursor.execute('''
    SELECT ci.id, ci.name
    FROM class_instance_class_instance cici1,
         class_instance_class_instance cici2,
         class_instance ci,
         relation r1,
         relation r2
    WHERE cici1.class_instance_a = %s
      AND cici1.relation_id = r1.id
      AND r1.relation_name = 'model_of'
      AND cici1.class_instance_b = cici2.class_instance_a
      AND cici2.relation_id = r2.id
      AND r2.relation_name = 'part_of'
      AND cici2.class_instance_b = ci.id
    ''' % int(skeleton_id))
    group_id, group_name = cursor.fetchone()

    # To prevent issues with similarly named folders, check that
    # the fragment folders are under the root group.
    if group_name in specific_groups and group_id_test_fn(group_id):
        return True

    # Else, check the parent group until reaching the root (a group without parent)
    # or reaching a group that has already been seen (an accidental circular relationship)
    seen = set([group_id])
    while True:
        cursor.execute('''
        SELECT ci.id, ci.name
        FROM class_instance_class_instance cici,
             class_instance ci,
             relation r
        WHERE cici.class_instance_a = %s
          AND cici.class_instance_b = ci.id
          AND cici.relation_id = r.id
          AND r.relation_name = 'part_of'
        ''' % group_id)
        rows = list(cursor.fetchall())
        if not rows:
            # Reached root: no parent group
            return False
        #
        group_id, group_name = rows[0]
        if group_id in seen:
            # Error: circular reference
            raise Exception('Circular reference for group "%s" with id #%s was found when trying to determine if skeleton #%s is part of "Fragments" or "Isolated synaptic terminals"' % (group_name, group_id, skeleton_id))
        #
        if group_name in specific_groups and group_id_test_fn(group_id):
            return True
        # Else, keep climbing up the group relations
        seen.add(group_id)



@requires_user_role(UserRole.Annotate)
def join_skeleton(request, project_id=None):
    """ An user with an Annotate role can join two skeletons if he owns the child
    skeleton. A superuser can join any. Skeletons under the "Fragments" or "Isolated
    Synaptic Terminals" can be joined by anyone. If all nodes fall within the user domain,
    even though the skeleton is owned by someone else, the join is allowed.
    """
    response_on_error = 'Failed to join'
    try:
        from_treenode_id = int(request.POST.get('from_id', None))
        to_treenode_id = int(request.POST.get('to_id', None))
        _join_skeleton(request.user, from_treenode_id, to_treenode_id, project_id)

        response_on_error = 'Could not log actions.'

        return HttpResponse(json.dumps({
            'message': 'success',
            'fromid': from_treenode_id,
            'toid': to_treenode_id}))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _join_skeleton(user, from_treenode_id, to_treenode_id, project_id):
    """ Take the IDs of two nodes, each belonging to a different skeleton,
    and make to_treenode be a child of from_treenode,
    and join the nodes of the skeleton of to_treenode
    into the skeleton of from_treenode,
    and delete the former skeleton of to_treenode."""
    if from_treenode_id is None or to_treenode_id is None:
        raise Exception('Missing arguments to _join_skeleton')

    response_on_error = ''
    try:
        to_treenode_id = int(to_treenode_id)
        cursor = connection.cursor()
        cursor.execute('SELECT skeleton_id FROM treenode WHERE id = %s' % to_treenode_id)
        rows = tuple(cursor.fetchall())
        if not rows:
            raise Exception("Could not find a skeleton for treenode #%s" % to_treenode_id)

        to_skid = rows[0][0]

        # Check if joining is allowed
        if 1 == Treenode.objects.filter(skeleton_id=to_skid).count():
            # Is an isolated node, so it can be joined freely
            pass
        # If the treenode is not isolated, the skeleton must be under fragments, or the user must own the skeleton or be superuser
        else:
            try:
                can_edit_or_fail(user, to_skid, "class_instance")
            except Exception:
                # Else, if the user owns the node (but not the skeleton), the join is possible only if all other nodes are editable by the user (such a situation occurs when the user domain ows both skeletons to join, or when part of a skeleton is split away from a larger one that belongs to someone else)
                can_edit_or_fail(user, to_treenode_id, "treenode")
                if _under_fragments(to_skid) or _under_staging_area(user, to_skid):
                    pass
                if Treenode.objects.filter(skeleton_id=to_skid).exclude(user__in=user_domain(cursor, user.id)).count() > 0:
                    # There are at least some nodes that the user can't edit
                    raise Exception("User %s with id #%s cannot join skeleton #%s, because the user doesn't own the skeleton or the skeleton contains nodes that belong to users outside of the user's domain." % (user.username, user.id, to_skid))

        from_treenode_id = int(from_treenode_id)
        from_treenode = Treenode.objects.get(pk=from_treenode_id)
        from_skid = from_treenode.skeleton_id

        if from_skid == to_skid:
            raise Exception('Cannot join treenodes of the same skeleton, this would introduce a loop.')
        
        from_neuron = _get_neuronname_from_skeletonid( project_id, from_skid )
        to_neuron = _get_neuronname_from_skeletonid( project_id, to_skid )

        # Reroot to_skid at to_treenode if necessary
        response_on_error = 'Could not reroot at treenode %s' % to_treenode_id
        _reroot_skeleton(to_treenode_id, project_id)

        # The target skeleton is removed and its treenode assumes
        # the skeleton id of the from-skeleton.

        response_on_error = 'Could not update Treenode table with new skeleton id for joined treenodes.'
        Treenode.objects.filter(skeleton=to_skid).update(skeleton=from_skid)

        response_on_error = 'Could not update TreenodeConnector table.'
        TreenodeConnector.objects.filter(
            skeleton=to_skid).update(skeleton=from_skid)

        # Determine if the neuron is part_of group 'Isolated synaptic terminals'
        response_on_error = 'Could not find neuron of skeleton #%s.' % to_skid
        neuron_id = _in_isolated_synaptic_terminals(to_skid)

        # Remove skeleton of to_id (deletes cicic part_of to neuron by cascade,
        # leaving the parent neuron dangling in the object tree).
        response_on_error = 'Could not delete skeleton with ID %s.' % to_skid
        ClassInstance.objects.filter(pk=to_skid).delete()

        # Remove the neuron if it belongs to 'Isolated synaptic terminals'
        # It is ok if the request.user doesn't match with the neuron's user_id or is not superuser.
        if neuron_id:
            response_on_error = 'Could not delete neuron with id %s.' % neuron_id
            if _delete_if_empty(neuron_id):
                pass #print >> sys.stderr, "DELETED neuron %s from IST" % neuron_id

        # Update the parent of to_treenode.
        response_on_error = 'Could not update parent of treenode with ID %s' % to_treenode_id
        Treenode.objects.filter(id=to_treenode_id).update(parent=from_treenode_id, editor=user)

        insert_into_log(project_id, user.id, 'join_skeleton', from_treenode.location, 'Joined skeleton with ID %s (neuron: %s) into skeleton with ID %s (neuron: %s)' % (to_skid, to_neuron['neuronname'], from_skid, from_neuron['neuronname']) )

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
def reset_reviewer_ids(request, project_id=None, skeleton_id=None):
    """ Reset the reviewer_id column to -1 for all nodes of the skeleton.
    Only a superuser can do it when all nodes are not own by the user.
    """
    skeleton_id = int(skeleton_id) # sanitize
    if not request.user.is_superuser:
        # Check that the user owns all the treenodes to edit
        cursor = connection.cursor()
        cursor.execute('''
        SELECT treenode.user_id,
               count(treenode.user_id) c,
               "auth_user".username
        FROM treenode,
             "auth_user"
        WHERE skeleton_id=%s
          AND treenode.user_id = "auth_user".id
        GROUP BY user_id, "auth_user".username
        ORDER BY c DESC''' % skeleton_id)
        rows = tuple(cursor.fetchall())
        if rows:
            if 1 == len(rows) and rows[0] == request.user.id:
                pass # All skeleton nodes are owned by the user
            else:
                total = "/" + str(sum(row[1] for row in rows))
                return HttpResponse(json.dumps({"error": "User %s does not own all nodes.\nOnwership: %s" % (request.user.username, {str(row[2]): str(row[1]) + total for row in rows})}))
    # Reset reviewer_id to -1
    Treenode.objects.filter(skeleton_id=skeleton_id).update(reviewer_id=-1)
    return HttpResponse(json.dumps({}), mimetype='text/json')

@requires_user_role(UserRole.Annotate)
def reset_own_reviewer_ids(request, project_id=None, skeleton_id=None):
    """ Reset the reviewer_id column to -1 for all nodes owned by the user.
    """
    skeleton_id = int(skeleton_id) # sanitize
    Treenode.objects.filter(skeleton_id=skeleton_id, user=request.user).update(reviewer_id=-1)
    return HttpResponse(json.dumps({}), mimetype='text/json')

@requires_user_role(UserRole.Annotate)
def reset_other_reviewer_ids(request, project_id=None, skeleton_id=None):
    """ Reset the reviewer_id column to -1 for all nodes not owned by the user.
    """
    skeleton_id = int(skeleton_id) # sanitize
    if not request.user.is_superuser:
        return HttpResponse(json.dumps({"error": "Only a superuser can do that!"}))
    Treenode.objects.filter(skeleton_id=skeleton_id).exclude(reviewer_id=request.user.id).update(reviewer_id=-1)
    return HttpResponse(json.dumps({}), mimetype='text/json')
