from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.neuron import _delete_if_empty
from catmaid.control.neuron_annotations import create_annotation_query
from catmaid.control.neuron_annotations import _annotate_entities
from catmaid.control.neuron_annotations import _update_neuron_annotations
from catmaid.control.review import get_treenodes_to_reviews, get_review_status
from catmaid.control.treenode import _create_interpolated_treenode
from collections import defaultdict

import decimal
import json

from operator import itemgetter
import networkx as nx
from tree_util import reroot, edge_count_to_root


def get_skeleton_permissions(request, project_id, skeleton_id):
    """ Tests editing permissions of a user on a skeleton and returns the
    result as JSON object."""
    try:
        nn = _get_neuronname_from_skeletonid( project_id, skeleton_id )
        can_edit = can_edit_class_instance_or_fail(request.user,
                nn['neuronid'])
    except:
        can_edit = False

    permissions = {
      'can_edit': can_edit,
    }

    return HttpResponse(json.dumps(permissions))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def last_openleaf(request, project_id=None, skeleton_id=None):
    """ Return the ID of the nearest node (or itself), and its location string;
    or two nulls if none found. """
    tnid = int(request.POST['tnid'])
    cursor = connection.cursor()

    cursor.execute("SELECT id FROM relation WHERE project_id=%s AND relation_name='labeled_as'" % int(project_id))
    labeled_as = cursor.fetchone()[0]

    # Select all nodes and their tags
    cursor.execute('''
    SELECT t.id, t.parent_id, t.location_x, t.location_y, t.location_z, ci.name
    FROM treenode t LEFT OUTER JOIN (treenode_class_instance tci INNER JOIN class_instance ci ON tci.class_instance_id = ci.id AND tci.relation_id = %s) ON t.id = tci.treenode_id
    WHERE t.skeleton_id = %s
    ''' % (labeled_as, int(skeleton_id)))

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
        tree.node[nodeID]['loc'] = (row[2], row[3], row[4])
        if row[5]:
            props = tree.node[nodeID]
            tags = props.get('tags')
            if tags:
                tags.append(row[5])
            else:
                props['tags'] = [row[5]]

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

# Will fail if skeleton_id does not exist
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def contributor_statistics(request, project_id=None, skeleton_id=None):
    contributors = defaultdict(int)
    n_nodes = 0
    # Count the total number of 60-second intervals with at least one treenode in them
    minutes = set()
    epoch = datetime.utcfromtimestamp(0)

    for row in Treenode.objects.filter(skeleton_id=skeleton_id).values_list('id', 'parent_id', 'user_id', 'creation_time'):
        n_nodes += 1
        contributors[row[2]] += 1
        minutes.add(int((row[3] - epoch).total_seconds() / 60))

    relations = {row[0]: row[1] for row in Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id')}

    synapses = {}
    synapses[relations['presynaptic_to']] = defaultdict(int)
    synapses[relations['postsynaptic_to']] = defaultdict(int)

    for row in TreenodeConnector.objects.filter(skeleton_id=skeleton_id).values_list('user_id', 'relation_id'):
        synapses[row[1]][row[0]] += 1

    cq = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project_id=project_id,
            class_instance_a=int(skeleton_id)).select_related('class_instance_b')
    neuron_name = cq[0].class_instance_b.name

    return HttpResponse(json.dumps({
        'name': neuron_name,
        'construction_minutes': len(minutes),
        'n_nodes': n_nodes,
        'node_contributors': contributors,
        'n_pre': sum(synapses[relations['presynaptic_to']].values()),
        'n_post': sum(synapses[relations['postsynaptic_to']].values()),
        'pre_contributors': synapses[relations['presynaptic_to']],
        'post_contributors': synapses[relations['postsynaptic_to']]}))


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
    try:
        return {'neuronname': qs[0].class_instance_b.name,
            'neuronid': qs[0].class_instance_b.id }
    except IndexError:
        raise Exception("Couldn't find a neuron linking to a skeleton with " \
                "ID %s" % skeleton_id)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronname(request, project_id=None, skeleton_id=None):
    return HttpResponse(json.dumps(_get_neuronname_from_skeletonid(project_id, skeleton_id)), mimetype='text/json')

def _neuronnames(skeleton_ids, project_id):
    qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=project_id,
            class_instance_a__in=skeleton_ids).select_related("class_instance_b").values_list("class_instance_a", "class_instance_b__name")
    return dict(qs)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronnames(request, project_id=None):
    """ Returns a JSON object with skeleton IDs as keys and neuron names as values. """
    skeleton_ids = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids['))
    return HttpResponse(json.dumps(_neuronnames(skeleton_ids, project_id)))

def check_annotations_on_split(project_id, skeleton_id, over_annotation_set,
        under_annotation_set):
    """ With respect to annotations, a split is only correct if one part keeps
    the whole set of annotations.
    """
    # Get current annotation set
    annotation_query = create_annotation_query(project_id,
        {'skeleton_id': skeleton_id})

    # Check if current set is equal to under or over set
    current_annotation_set = frozenset(a.name for a in annotation_query)
    if not current_annotation_set.difference(over_annotation_set):
      return True
    if not current_annotation_set.difference(under_annotation_set):
      return True

    return False

def check_new_annotations(project_id, user, entity_id, annotation_set):
    """ With respect to annotations, the new annotation set is only valid if the
    user doesn't remove annotations for which (s)he has no permissions.
    """
    # Get current annotation links
    annotation_links = ClassInstanceClassInstance.objects.filter(
            project_id=project_id,
            class_instance_b__class_column__class_name='annotation',
            relation__relation_name='annotated_with',
            class_instance_a_id=entity_id).values_list(
                    'class_instance_b__name', 'id', 'user')

    # Build annotation name indexed dict to the link's id and user
    annotations = {l[0]:(l[1], l[2]) for l in annotation_links}
    current_annotation_set = frozenset(annotations.keys())

    # If the current annotation set is not included completely in the new
    # set, we have to check if the user has permissions to edit the missing
    # annotations.
    removed_annotations = current_annotation_set - annotation_set
    for rl in removed_annotations:
        try:
            can_edit_or_fail(user, annotations[rl][0],
                        'class_instance_class_instance')
        except:
            return False

    # Otherwise, everything is fine
    return True


def check_annotations_on_join(project_id, user, from_neuron_id, to_neuron_id,
        ann_set):
    """ With respect to annotations, a join is only correct if the user doesn't
    remove annotations for which (s)he has no permissions.
    """
    return check_new_annotations(project_id, user, from_neuron_id, ann_set) and \
           check_new_annotations(project_id, user, to_neuron_id, ann_set)

@requires_user_role(UserRole.Annotate)
def split_skeleton(request, project_id=None):
    """ The split is only possible if the neuron is not locked or if it is
    locked by the current user or if the current user belongs to the group
    of the user who locked it. Of course, the split is also possible if
    the current user is a super-user. Also, all reviews of the treenodes in the
    new neuron are updated to refer to the new skeleton.
    """
    treenode_id = int(request.POST['treenode_id'])
    treenode = Treenode.objects.get(pk=treenode_id)
    skeleton_id = treenode.skeleton_id
    upstream_annotation_map = json.loads(request.POST.get('upstream_annotation_map'))
    downstream_annotation_map = json.loads(request.POST.get('downstream_annotation_map'))
    cursor = connection.cursor()

    # Check if the treenode is root!
    if not treenode.parent:
        return HttpResponse(json.dumps({'error': 'Can\'t split at the root node: it doesn\'t have a parent.'}))

    # Check if annotations are valid
    if not check_annotations_on_split(project_id, skeleton_id,
            frozenset(upstream_annotation_map.keys()),
            frozenset(downstream_annotation_map.keys())):
        raise Exception("Annotation distribution is not valid for splitting. " \
          "One part has to keep the whole set of annotations!")

    skeleton = ClassInstance.objects.select_related('user').get(pk=skeleton_id)
    project_id=int(project_id)

    # retrieve neuron of this skeleton
    neuron = ClassInstance.objects.get(
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a_id=skeleton_id)

    # Make sure the user has permissions to edit
    can_edit_class_instance_or_fail(request.user, neuron.id, 'neuron')

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
    # Create new neuron
    new_neuron = ClassInstance()
    new_neuron.name = 'Neuron'
    new_neuron.project_id = project_id
    new_neuron.user = skeleton.user
    new_neuron.class_column = Class.objects.get(class_name='neuron',
            project_id=project_id)
    new_neuron.save()
    new_neuron.name = 'Neuron %s' % str(new_neuron.id)
    new_neuron.save()
    # Assign the skeleton to new neuron
    cici = ClassInstanceClassInstance()
    cici.class_instance_a = new_skeleton
    cici.class_instance_b = new_neuron
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

    # Update annotations of existing neuron to have only over set
    _update_neuron_annotations(project_id, request.user, neuron.id,
            upstream_annotation_map)

    # Update all reviews of the treenodes that are moved to a new neuron to
    # refer to the new skeleton.
    Review.objects.filter(treenode_id__in=change_list).update(skeleton=new_skeleton)

    # Update annotations of under skeleton
    _annotate_entities(project_id, [new_neuron.id], downstream_annotation_map)

    # Log the location of the node at which the split was done
    location = (treenode.location_x, treenode.location_y, treenode.location_z)
    insert_into_log(project_id, request.user.id, "split_skeleton", location,
                    "Split skeleton with ID {0} (neuron: {1})".format( skeleton_id, neuron.name ) )

    return HttpResponse(json.dumps({}), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def root_for_skeleton(request, project_id=None, skeleton_id=None):
    tn = Treenode.objects.get(
        project=project_id,
        parent__isnull=True,
        skeleton_id=skeleton_id)
    return HttpResponse(json.dumps({
        'root_id': tn.id,
        'x': tn.location_x,
        'y': tn.location_y,
        'z': tn.location_z}),
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
            self.union_reviewed = 0 # total number reviewed nodes
            self.reviewed = {} # number of reviewed nodes per reviewer
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
    ''' % (','.join(map(str, skeleton_ids)), int(relation_id_1), int(relation_id_2)))

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
    skids_string = ','.join(map(str, partners.iterkeys()))

    # Count nodes of each partner skeleton
    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM treenode
    WHERE skeleton_id IN (%s)
    GROUP BY skeleton_id
    ''' % skids_string) # no need to sanitize
    for row in cursor.fetchall():
        partners[row[0]].num_nodes = row[1]

    # Count nodes that have been reviewed by each user in each partner skeleton
    cursor.execute('''
    SELECT skeleton_id, reviewer_id, count(*)
    FROM review
    WHERE skeleton_id IN (%s)
    GROUP BY reviewer_id, skeleton_id
    ''' % skids_string) # no need to sanitize
    for row in cursor.fetchall():
        partner = partners[row[0]]
        partner.reviewed[row[1]] = row[2]

    # Count total number of reviewed nodes per skeleton
    cursor.execute('''
    SELECT skeleton_id, count(*)
    FROM (SELECT skeleton_id, treenode_id
          FROM review
          WHERE skeleton_id IN (%s)
          GROUP BY skeleton_id, treenode_id) AS sub
    GROUP BY skeleton_id
    ''' % skids_string) # no need to sanitize
    for row in cursor.fetchall():
        partner = partners[row[0]]
        partner.union_reviewed = row[1]

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
        partners[row[0]].name = row[1]

    return partners

def _skeleton_info_raw(project_id, skeletons, op):
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

    def prepare(partners):
        for partnerID in partners.keys():
            partner = partners[partnerID]
            skids = partner.skids
            # jsonize: swap class instance by its dict of members vs values
            if partner.skids or partner.reviewed:
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
    op = request.POST.get('boolean_op') # values: AND, OR
    op = {'AND': 'AND', 'OR': 'OR'}[op[6:]] # sanitize

    incoming, outgoing = _skeleton_info_raw(project_id, skeletons, op)

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

@requires_user_role([UserRole.Browse, UserRole.Annotate])
def review_status(request, project_id=None):
    """ Return the review status for each skeleton in the request
    as a value between 0 and 100 (integers). """
    skeleton_ids = set(int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_ids['))
    user_ids = set(int(v) for k,v in request.POST.iteritems() if k.startswith('user_ids['))
    status = get_review_status(skeleton_ids, user_ids)

    return HttpResponse(json.dumps(status))


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
            location = (treenode.location_x, treenode.location_y, treenode.location_z)
            insert_into_log(project_id, request.user.id, 'reroot_skeleton',
                            location, 'Rerooted skeleton for '
                            'treenode with ID %s' % treenode.id)
            return HttpResponse(json.dumps({'newroot': treenode.id}))
        # Else, already root
        return HttpResponse(json.dumps({'error': 'Node #%s is already '
                                                 'root!' % treenode_id}))
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

@requires_user_role(UserRole.Annotate)
def join_skeleton(request, project_id=None):
    """ An user with an Annotate role can join two skeletons if the neurons
    modeled by these skeletons are not locked by another user or if the current
    user belongs to the group of the user who locked the neurons. A super-user
    can join any skeletons.
    """
    response_on_error = 'Failed to join'
    try:
        from_treenode_id = int(request.POST.get('from_id', None))
        to_treenode_id = int(request.POST.get('to_id', None))
        annotation_set = json.loads(request.POST.get('annotation_set'))

        _join_skeleton(request.user, from_treenode_id, to_treenode_id,
                project_id, annotation_set)

        response_on_error = 'Could not log actions.'

        return HttpResponse(json.dumps({
            'message': 'success',
            'fromid': from_treenode_id,
            'toid': to_treenode_id}))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _join_skeleton(user, from_treenode_id, to_treenode_id, project_id,
        annotation_map):
    """ Take the IDs of two nodes, each belonging to a different skeleton, and
    make to_treenode be a child of from_treenode, and join the nodes of the
    skeleton of to_treenode into the skeleton of from_treenode, and delete the
    former skeleton of to_treenode. All annotations in annotation_set will be
    linked to the skeleton of to_treenode. It is expected that <annotation_map>
    is a dictionary, mapping an annotation to an annotator ID. Also, all
    reviews of the skeleton that changes ID are changed to refer to the new
    skeleton ID.
    """
    if from_treenode_id is None or to_treenode_id is None:
        raise Exception('Missing arguments to _join_skeleton')

    response_on_error = ''
    try:
        from_treenode_id = int(from_treenode_id)
        to_treenode_id = int(to_treenode_id)

        try:
            from_treenode = Treenode.objects.get(pk=from_treenode_id)
        except Treenode.DoesNotExist:
            raise Exception("Could not find a skeleton for treenode #%s" % from_treenode_id)

        try:
            to_treenode = Treenode.objects.get(pk=to_treenode_id)
        except Treenode.DoesNotExist:
            raise Exception("Could not find a skeleton for treenode #%s" % to_treenode_id)

        from_skid = from_treenode.skeleton_id
        from_neuron = _get_neuronname_from_skeletonid( project_id, from_skid )

        to_skid = to_treenode.skeleton_id
        to_neuron = _get_neuronname_from_skeletonid( project_id, to_skid )

        # Make sure the user has permissions to edit both neurons
        can_edit_class_instance_or_fail(
                user, from_neuron['neuronid'], 'neuron')
        can_edit_class_instance_or_fail(
                user, to_neuron['neuronid'], 'neuron')

        # Check if annotations are valid
        if not check_annotations_on_join(project_id, user,
                from_neuron['neuronid'], to_neuron['neuronid'],
                frozenset(annotation_map.keys())):
            raise Exception("Annotation distribution is not valid for joining. " \
              "Annotations for which you don't have permissions have to be kept!")

        if from_skid == to_skid:
            raise Exception('Cannot join treenodes of the same skeleton, this would introduce a loop.')

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

        # Update reviews from 'losing' neuron to now belong to the new neuron
        response_on_error = 'Couldn not update reviews with new skeleton IDs for joined treenodes.'
        Review.objects.filter(skeleton_id=to_skid).update(skeleton=from_skid)

        # Remove skeleton of to_id (deletes cicic part_of to neuron by cascade,
        # leaving the parent neuron dangling in the object tree).
        response_on_error = 'Could not delete skeleton with ID %s.' % to_skid
        ClassInstance.objects.filter(pk=to_skid).delete()

        # Remove the 'losing' neuron if it is empty
        _delete_if_empty(to_neuron['neuronid'])

        # Update the parent of to_treenode.
        response_on_error = 'Could not update parent of treenode with ID %s' % to_treenode_id
        Treenode.objects.filter(id=to_treenode_id).update(parent=from_treenode_id, editor=user)

        # Update linked annotations of neuron
        response_on_error = 'Could not update annotations of neuron ' \
                'with ID %s' % from_neuron['neuronid']
        _update_neuron_annotations(project_id, user, from_neuron['neuronid'],
                annotation_map)

        from_location = (from_treenode.location_x, from_treenode.location_y,
                         from_treenode.location_z)
        insert_into_log(project_id, user.id, 'join_skeleton',
                from_location, 'Joined skeleton with ID %s (neuron: ' \
                '%s) into skeleton with ID %s (neuron: %s, annotations: %s)' % \
                (to_skid, to_neuron['neuronname'], from_skid,
                        from_neuron['neuronname'], ', '.join(annotation_map.keys())))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

@requires_user_role(UserRole.Annotate)
def join_skeletons_interpolated(request, project_id=None):
    """ Join two skeletons, adding nodes in between the two nodes to join
    if they are separated by more than one section in the Z axis."""
    # Parse parameters
    decimal_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'resx': 0,
            'resy': 0,
            'resz': 0,
            'stack_translation_z': 0,
            'radius': -1}
    int_values = {
            'from_id': 0,
            'to_id': 0,
            'stack_id': 0,
            'confidence': 5}
    params = {}
    for p in decimal_values.keys():
        params[p] = decimal.Decimal(request.POST.get(p, decimal_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))
    # Copy of the id for _create_interpolated_treenode
    params['parent_id'] = params['from_id']
    params['skeleton_id'] = Treenode.objects.get(pk=params['from_id']).skeleton_id

    # Create interpolate nodes skipping the last one
    last_treenode_id, skeleton_id = _create_interpolated_treenode(request, params, project_id, True)

    # Get set of annoations the combinet skeleton should have
    annotation_map = json.loads(request.POST.get('annotation_set'))

    # Link last_treenode_id to to_id
    _join_skeleton(request.user, last_treenode_id, params['to_id'], project_id,
            annotation_map)

    return HttpResponse(json.dumps({'treenode_id': params['to_id']}))


@requires_user_role(UserRole.Annotate)
def reset_own_reviewer_ids(request, project_id=None, skeleton_id=None):
    """ Remove all reviews done by the requsting user in the skeleten with ID
    <skeleton_id>.
    """
    skeleton_id = int(skeleton_id) # sanitize
    Review.objects.filter(skeleton_id=skeleton_id, reviewer=request.user).delete();
    return HttpResponse(json.dumps({'status': 'success'}), mimetype='text/json')


@requires_user_role(UserRole.Annotate)
def fetch_treenodes(request, project_id=None, skeleton_id=None, with_reviewers=None):
    """ Fetch the topology only, optionally with the reviewer IDs. """
    skeleton_id = int(skeleton_id)

    cursor = connection.cursor()
    cursor.execute('''
    SELECT id, parent_id
    FROM treenode
    WHERE skeleton_id = %s
    ''' % skeleton_id)

    if with_reviewers:
        reviews = get_treenodes_to_reviews(skeleton_ids=[skeleton_id])
        treenode_data = tuple([r[0], r[1], reviews.get(r[0], [])] \
                for r in cursor.fetchall())
    else:
        treenode_data = tuple(cursor.fetchall())

    return HttpResponse(json.dumps(treenode_data))


@requires_user_role(UserRole.Browse)
def annotation_list(request, project_id=None):
    """ Returns a JSON serialized object that contains information about the
    given skeletons.
    """
    skeleton_ids = [v for k,v in request.POST.iteritems()
            if k.startswith('skeleton_ids[')]
    annotations = bool(int(request.POST.get("annotations", 0)))
    metaannotations = bool(int(request.POST.get("metaannotations", 0)))
    neuronnames = bool(int(request.POST.get("neuronnames", 0)))

    if not skeleton_ids:
        raise ValueError("No skeleton IDs provided")

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    cursor = connection.cursor()

    # Create a map of skeleton IDs to neuron IDs
    cursor.execute("""
        SELECT cici.class_instance_a, cici.class_instance_b
        FROM class_instance_class_instance cici
        WHERE cici.project_id = %s AND
              cici.relation_id = %s AND
              cici.class_instance_a IN (%s)
    """ % (project_id, relations['model_of'],
           ','.join(map(str, skeleton_ids))))
    n_to_sk_ids = {n:s for s,n in cursor.fetchall()}
    neuron_ids = n_to_sk_ids.keys()

    # Query for annotations of the given skeletons, specifically
    # neuron_id, auid, aid and aname.
    cursor.execute("""
        SELECT cici.class_instance_a AS neuron_id, cici.user_id AS auid,
               cici.class_instance_b AS aid, ci.name AS aname
        FROM class_instance_class_instance cici INNER JOIN
             class_instance ci ON cici.class_instance_b = ci.id
        WHERE cici.relation_id = %s AND
              cici.class_instance_a IN (%s) AND
              ci.class_id = %s
    """ % (relations['annotated_with'],
           ','.join(map(str, neuron_ids)),
           classes['annotation']))

    # Build result dictionaries: one that maps annotation IDs to annotation
    # names and another one that lists annotation IDs and annotator IDs for
    # each skeleton ID.
    annotations = {}
    skeletons = {}
    for row in cursor.fetchall():
        skid, auid, aid, aname = n_to_sk_ids[row[0]], row[1], row[2], row[3]
        if aid not in annotations:
            annotations[aid] = aname
        skeleton = skeletons.get(skid)
        if not skeleton:
            skeleton = {'annotations': []}
            skeletons[skid] = skeleton
        skeleton['annotations'].append({
            'uid': auid,
            'id': aid,
        })

    # Assemble response
    response = {
        'annotations': annotations,
        'skeletons': skeletons,
    }

    # If wanted, get the neuron name of each skeleton
    if neuronnames:
        cursor.execute("""
            SELECT ci.id, ci.name
            FROM class_instance ci
            WHERE ci.id IN (%s)
        """ % (','.join(map(str, neuron_ids))))
        response['neuronnames'] = {n_to_sk_ids[n]:name for n,name in cursor.fetchall()}

    # If wanted, get the meta annotations for each annotation
    if metaannotations:
        # Request only ID of annotated annotations, annotator ID, meta
        # annotation ID, meta annotation Name
        cursor.execute("""
            SELECT cici.class_instance_a AS aid, cici.user_id AS auid,
                   cici.class_instance_b AS maid, ci.name AS maname
            FROM class_instance_class_instance cici INNER JOIN
                 class_instance ci ON cici.class_instance_b = ci.id
            WHERE cici.project_id = %s AND
                  cici.relation_id = %s AND
                  cici.class_instance_a IN (%s) AND
                  ci.class_id = %s
        """ % (project_id, relations['annotated_with'],
               ','.join(map(str, annotations.keys())),
               classes['annotation']))

        # Add this to the response
        metaannotations = {}
        for row in cursor.fetchall():
            aaid, auid, maid, maname = row[0], row[1], row[2], row[3]
            if maid not in annotations:
                annotations[maid] = maname
            annotation = metaannotations.get(aaid)
            if not annotation:
                annotation = {'annotations': []}
                metaannotations[aaid] = annotation
            annotation['annotations'].append({
                'uid': auid,
                'id': maid,
            })
        response['metaannotations'] = metaannotations

    return HttpResponse(json.dumps(response), mimetype="text/json")
