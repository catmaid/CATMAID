import json

from string import upper
from itertools import imap
from datetime import datetime, timedelta

from django.db import connection
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.http import HttpResponse

from catmaid.fields import Double3D
from catmaid.models import Project, Stack, ProjectStack, Connector, \
        ConnectorClassInstance, Treenode, TreenodeConnector, UserRole
from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.common import cursor_fetch_dictionary, \
        get_relation_to_id_map

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def graphedge_list(request, project_id=None):
    """ Assumes that first element of skeletonlist is pre, and second is post """
    skeletonlist = request.POST.getlist('skeletonlist[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    edge = {}
    connectordata = {}

    qs_tc = TreenodeConnector.objects.filter(
        project=p,
        skeleton__in=skeletonlist ).select_related('relation__relation_name', 'connector__user', 'connector')

    for q in qs_tc:
        # Only look at synapse connectors
        if q.relation.relation_name not in ('presynaptic_to', 'postsynaptic_to'):
            continue
        if not q.connector_id in edge:
            # has to be a list, not a set, because we need matching treenode id
            edge[ q.connector_id ] = {'pre': [], 'post': [], 'pretreenode': [], 'posttreenode': []}
            connectordata[ q.connector_id ] = {
                'connector_id': q.connector_id,
                'x': q.connector.location_x,
                'y': q.connector.location_y,
                'z': q.connector.location_z,
                'user': q.connector.user.username }

        if q.relation.relation_name == 'presynaptic_to':
            edge[ q.connector_id ]['pre'].append( q.skeleton_id )
            edge[ q.connector_id ]['pretreenode'].append( q.treenode_id )
        elif q.relation.relation_name == 'postsynaptic_to':
            edge[ q.connector_id ]['post'].append( q.skeleton_id )
            edge[ q.connector_id ]['posttreenode'].append( q.treenode_id )

    result = []
    for k,v in edge.items():
        if skeletonlist[0] in v['pre'] and skeletonlist[1] in v['post']:
            connectordata[k]['pretreenode'] = v['pretreenode'][ v['pre'].index( skeletonlist[0] ) ]
            connectordata[k]['posttreenode'] = v['posttreenode'][ v['post'].index( skeletonlist[1] ) ]
            result.append(connectordata[k])

    return HttpResponse(json.dumps( result ), content_type='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def one_to_many_synapses(request, project_id=None):
    """ Return the list of synapses of a specific kind between one skeleton and a list of other skeletons. """
    if 'skid' not in request.POST:
        raise ValueError("No skeleton ID for 'one' provided")
    skid = int(request.POST.get('skid'));

    skids = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids['))
    if not skids:
        raise ValueError("No skeleton IDs for 'many' provided")

    relation_name = request.POST.get('relation') # expecting presynaptic_to or postsynaptic_to

    rows = _many_to_many_synapses([skid], skids, relation_name)
    return HttpResponse(json.dumps(rows))


@requires_user_role(UserRole.Browse)
def many_to_many_synapses(request, project_id=None):
    """
    Return the list of synapses of a specific kind between one list of
    skeletons and a list of other skeletons.
    """
    skids1 = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids1['))
    if not skids1:
        raise ValueError("No skeleton IDs for first list of 'many' provided")
    skids2 = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids2['))
    if not skids2:
        raise ValueError("No skeleton IDs for second list 'many' provided")

    relation_name = request.POST.get('relation') # expecting presynaptic_to or postsynaptic_to

    rows = _many_to_many_synapses(skids1, skids2, relation_name)
    return HttpResponse(json.dumps(rows))


def _many_to_many_synapses(skids1, skids2, relation_name):
    """
    Return all rows that connect skeletons of one set with another set with a
    specific relation.
    """
    if relation_name not in ('postsynaptic_to', 'presynaptic_to'):
        raise Exception("Cannot accept a relation named '%s'" % relation_name)

    cursor = connection.cursor()
    cursor.execute('''
    SELECT tc1.connector_id, c.location_x, c.location_y, c.location_z,
           tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
           t1.location_x, t1.location_y, t1.location_z,
           tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
           t2.location_x, t2.location_y, t2.location_z
    FROM treenode_connector tc1,
         treenode_connector tc2,
         treenode t1,
         treenode t2,
         relation r1,
         connector c
    WHERE tc1.skeleton_id IN (%s)
      AND tc1.connector_id = c.id
      AND tc2.skeleton_id IN (%s)
      AND tc1.connector_id = tc2.connector_id
      AND tc1.relation_id = r1.id
      AND r1.relation_name = '%s'
      AND tc1.relation_id != tc2.relation_id
      AND tc1.treenode_id = t1.id
      AND tc2.treenode_id = t2.id
    ''' % (','.join(map(str, skids1)),
           ','.join(map(str, skids2)),
           relation_name))

    return tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_connector(request, project_id=None):
    stack_id = request.POST.get('stack_id', None)
    skeleton_id = request.POST.get('skeleton_id', None)

    def empty_result():
        return HttpResponse(json.dumps({
            'iTotalRecords': 0,
            'iTotalDisplayRecords': 0,
            'aaData': []}))

    if not skeleton_id:
        return empty_result()
    else:
        skeleton_id = int(skeleton_id)

    relation_type = int(request.POST.get('relation_type', 0))  # 0: Presyn, 1 Postsyn
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', 0))
    sorting_column = int(request.POST.get('iSortCol_0', 0))
    sort_descending = upper(request.POST.get('sSortDir_0', 'DESC')) != 'ASC'

    response_on_error = ''
    try:
        cursor = connection.cursor()
        response_on_error = 'Could not fetch relations.'
        relation_map = get_relation_to_id_map(project_id, cursor=cursor)
        for rel in ['presynaptic_to', 'postsynaptic_to', 'element_of', 'labeled_as']:
            if rel not in relation_map:
                raise Exception('Failed to find the required relation %s' % rel)

        if relation_type == 1:
            relation_type_id = relation_map['presynaptic_to']
            inverse_relation_type_id = relation_map['postsynaptic_to']
        else:
            relation_type_id = relation_map['postsynaptic_to']
            inverse_relation_type_id = relation_map['presynaptic_to']

        response_on_error = 'Failed to select connectors.'
        cursor.execute(
            '''
            SELECT
            connector.id AS connector_id,
            tn_other.user_id AS connector_user_id,
            treenode_user.username AS connector_username,
            connector.location_x AS connector_x,
            connector.location_y AS connector_y,
            connector.location_z AS connector_z,
            tn_other.id AS other_treenode_id,
            tn_other.location_x AS other_treenode_x,
            tn_other.location_y AS other_treenode_y,
            tn_other.location_z AS other_treenode_z,
            tn_other.skeleton_id AS other_skeleton_id,
            tn_this.location_x AS this_treenode_x,
            tn_this.location_y AS this_treenode_y,
            tn_this.location_z AS this_treenode_z,
            tn_this.id AS this_treenode_id,
            tc_this.relation_id AS this_to_connector_relation_id,
            tc_other.relation_id AS connector_to_other_relation_id,
            tc_other.confidence AS confidence,
            to_char(connector.edition_time, 'DD-MM-YYYY HH24:MI') AS last_modified
            FROM
            treenode tn_other,
            treenode_connector tc_other,
            connector,
            "auth_user" treenode_user,
            treenode_connector tc_this,
            treenode tn_this
            WHERE
            treenode_user.id = tn_other.user_id AND
            tn_other.id = tc_other.treenode_id AND
            tc_other.connector_id = connector.id AND
            tc_other.relation_id = %s AND
            tc_this.connector_id = connector.id AND
            tn_this.id = tc_this.treenode_id AND
            tn_this.skeleton_id = %s AND
            tc_this.relation_id = %s
            ORDER BY
            connector_id, other_treenode_id, this_treenode_id
            ''',  [inverse_relation_type_id, skeleton_id, relation_type_id])

        connectors = cursor_fetch_dictionary(cursor)
        connected_skeletons = map(lambda con: con['other_skeleton_id'], connectors)
        connector_ids = map(lambda con: con['connector_id'], connectors)

        response_on_error = 'Failed to find counts of treenodes in skeletons.'
        skel_tn_count = Treenode.objects.filter(skeleton__in=connected_skeletons)\
        .values('skeleton').annotate(treenode_count=Count('skeleton'))
        # .values to group by skeleton_id. See http://tinyurl.com/dj-values-annotate

        skeleton_to_treenode_count = {}
        for s in skel_tn_count:
            skeleton_to_treenode_count[s['skeleton']] = s['treenode_count']

        # Rather than do a LEFT OUTER JOIN to also include the connectors
        # with no partners, just do another query to find the connectors
        # without the conditions:

        response_on_error = 'Failed to select all connectors.'
        cursor.execute(
            '''
            SELECT
            connector.id AS connector_id,
            connector.user_id AS connector_user_id,
            connector_user.username AS connector_username,
            connector.location_x AS connector_x,
            connector.location_y AS connector_y,
            connector.location_z AS connector_z,
            tn_this.id AS this_treenode_id,
            tc_this.relation_id AS this_to_connector_relation_id,
            tc_this.confidence AS confidence,
            to_char(connector.edition_time, 'DD-MM-YYYY HH24:MI') AS last_modified
            FROM
            connector,
            "auth_user" connector_user,
            treenode_connector tc_this,
            treenode tn_this
            WHERE
            connector_user.id = connector.user_id AND
            tc_this.connector_id = connector.id AND
            tn_this.id = tc_this.treenode_id AND
            tn_this.skeleton_id = %s AND
            tc_this.relation_id = %s
            ORDER BY
            connector_id, this_treenode_id
            ''',  [skeleton_id, relation_type_id])
        for row in cursor_fetch_dictionary(cursor):
            connector_id = row['connector_id']
            if connector_id not in connector_ids:
                connectors.append(row)
                connector_ids.append(connector_id)

        # For each of the connectors, find all of its labels:
        response_on_error = 'Failed to find the labels for connectors'
        if (connector_ids > 0):
            connector_labels = ConnectorClassInstance.objects.filter(
                project=project_id,
                connector__in=connector_ids,
                relation=relation_map['labeled_as']).values(
                'connector',
                'class_instance__name')

            labels_by_connector = {}  # Key: Connector ID, Value: List of labels.
            for label in connector_labels:
                if label['connector'] not in labels_by_connector:
                    labels_by_connector[label['connector']] = [label['class_instance__name']]
                else:
                    labels_by_connector[label['connector']].append(label['class_instance__name'])
                # Sort labels by name
            for labels in labels_by_connector.values():
                labels.sort(key=upper)

        total_result_count = len(connectors)

        if 0 == total_result_count:
            return empty_result()

        # Paging
        if display_length == 0:
            connectors = connectors[display_start:]
            connector_ids = connector_ids[display_start:]
        else:
            connectors = connectors[display_start:display_start + display_length]
            connector_ids = connector_ids[display_start:display_start + display_length]

        response_on_error = 'Could not retrieve resolution and translation parameters for project.'
        if stack_id:
            resolution = get_object_or_404(Stack, id=int(stack_id)).resolution
            translation = get_object_or_404(ProjectStack, stack=int(stack_id), project=project_id).translation
        else:
            resolution = Double3D(1.0, 1.0, 1.0)
            translation = Double3D(0.0, 0.0, 0.0)

        # Format output
        aaData_output = []
        for c in connectors:
            response_on_error = 'Failed to format output for connector with ID %s.' % c['connector_id']
            if 'other_skeleton_id' in c:
                connected_skeleton_treenode_count = skeleton_to_treenode_count[c['other_skeleton_id']]
            else:
                c['other_skeleton_id'] = ''
                c['other_treenode_id'] = ''
                c['other_treenode_x'] = c['connector_x']
                c['other_treenode_y'] = c['connector_y']
                c['other_treenode_z'] = c['connector_z']
                connected_skeleton_treenode_count = 0

            if c['connector_id'] in labels_by_connector:
                labels = ', '.join(map(str, labels_by_connector[c['connector_id']]))
            else:
                labels = ''

            row = []
            row.append(c['connector_id'])
            row.append(c['other_skeleton_id'])
            row.append(c['other_treenode_x']) #('%.2f' % )
            row.append(c['other_treenode_y'])
            z = c['other_treenode_z']
            row.append(z)
            # FIXME: This is the only place we need a stack nad this can be
            # done in the client as well. So we really want to keep this and
            # have a more complicated API?
            row.append(int((z - translation.z) / resolution.z))
            row.append(c['confidence'])
            row.append(labels)
            row.append(connected_skeleton_treenode_count)
            row.append(c['connector_username'])
            row.append(c['other_treenode_id'])
            row.append(c['last_modified'])
            aaData_output.append(row)

        # Sort output
        def fetch_value_for_sorting(row):
            value = row[sorting_column]
            if isinstance(value, str) or isinstance(value, unicode):
                return upper(value)
            return value
        aaData_output.sort(key=fetch_value_for_sorting)

        # Fix excessive decimal precision in coordinates
        for row in aaData_output:
            row[2] = float('%.2f' % row[2])
            row[3] = float('%.2f' % row[3])
            row[4] = float('%.2f' % row[4])

        if sort_descending:
            aaData_output.reverse()

        return HttpResponse(json.dumps({
            'iTotalRecords': total_result_count,
            'iTotalDisplayRecords': total_result_count,
            'aaData': aaData_output}))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

def _connector_skeletons(connector_ids, project_id):
    """ Return a dictionary of connector ID as keys and a dictionary as value
    containing two entries: 'presynaptic_to' with a skeleton ID of None,
    and 'postsynaptic_to' with a list of skeleton IDs (maybe empty). """
    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    PRE = relations['presynaptic_to']
    POST = relations['postsynaptic_to']

    cursor.execute('''
    SELECT connector_id, relation_id, skeleton_id, treenode_id
    FROM treenode_connector
    WHERE connector_id IN (%s)
      AND (relation_id = %s OR relation_id = %s)
    ''' % (",".join(map(str, connector_ids)), PRE, POST))

    cs = {}
    for row in cursor.fetchall():
        c = cs.get(row[0])
        if not c:
            # Ensure each connector has the two entries at their minimum
            c = {'presynaptic_to': None, 'postsynaptic_to': [],
                 'presynaptic_to_node': None, 'postsynaptic_to_node': []}
            cs[row[0]] = c
        if POST == row[1]:
            c['postsynaptic_to'].append(row[2])
            c['postsynaptic_to_node'].append(row[3])
        elif PRE == row[1]:
            c['presynaptic_to'] = row[2]
            c['presynaptic_to_node'] = row[3]

    return cs

@requires_user_role([UserRole.Browse, UserRole.Annotate])
def connector_skeletons(request, project_id=None):
    """ See _connector_skeletons """
    connector_ids = set(int(v) for k,v in request.POST.iteritems() if k.startswith('connector_ids['))
    cs = tuple(_connector_skeletons(connector_ids, project_id).iteritems())
    return HttpResponse(json.dumps(cs))


def _connector_associated_edgetimes(connector_ids, project_id):
    """ Return a dictionary of connector ID as keys and a dictionary as value
    containing two entries: 'presynaptic_to' with a skeleton ID of None,
    and 'postsynaptic_to' with a list of skeleton IDs (maybe empty) including
    the timestamp of the edge. """
    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    PRE = relations['presynaptic_to']
    POST = relations['postsynaptic_to']

    cursor.execute('''
    SELECT connector_id, relation_id, skeleton_id, treenode_id, creation_time
    FROM treenode_connector
    WHERE connector_id IN (%s)
      AND (relation_id = %s OR relation_id = %s)
    ''' % (",".join(map(str, connector_ids), PRE, POST)))

    cs = {}
    for row in cursor.fetchall():
        c = cs.get(row[0])
        if not c:
            # Ensure each connector has the two entries at their minimum
            c = {'presynaptic_to': None, 'postsynaptic_to': []}
            cs[row[0]] = c
        if POST == row[1]:
            c['postsynaptic_to'].append( (row[2], row[3], row[4]) )
        elif PRE == row[1]:
            c['presynaptic_to'] = (row[2], row[3], row[4])

    return cs

@requires_user_role([UserRole.Browse, UserRole.Annotate])
def connector_associated_edgetimes(request, project_id=None):
    """ See _connector_associated_edgetimes """
    connector_ids = set(int(v) for k,v in request.POST.iteritems() if k.startswith('connector_ids['))

    def default(obj):
        """Default JSON serializer."""
        import calendar, datetime

        if isinstance(obj, datetime.datetime):
            if obj.utcoffset() is not None:
                obj = obj - obj.utcoffset()
            millis = int(
                calendar.timegm(obj.timetuple()) * 1000 +
                obj.microsecond / 1000
            )
        return millis

    return HttpResponse(json.dumps(_connector_associated_edgetimes(connector_ids, project_id), default=default))

@requires_user_role(UserRole.Annotate)
def create_connector(request, project_id=None):
    query_parameters = {}
    default_values = {'x': 0, 'y': 0, 'z': 0, 'confidence': 5}
    for p in default_values.keys():
        query_parameters[p] = request.POST.get(p, default_values[p])

    parsed_confidence = int(query_parameters['confidence'])
    if parsed_confidence < 1 or parsed_confidence > 5:
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))

    new_connector = Connector(
        user=request.user,
        editor=request.user,
        project=Project.objects.get(id=project_id),
        location_x=float(query_parameters['x']),
        location_y=float(query_parameters['y']),
        location_z=float(query_parameters['z']),
        confidence=parsed_confidence)
    new_connector.save()

    return HttpResponse(json.dumps({'connector_id': new_connector.id}))


@requires_user_role(UserRole.Annotate)
def delete_connector(request, project_id=None):
    connector_id = int(request.POST.get("connector_id", 0))
    can_edit_or_fail(request.user, connector_id, 'connector')
    Connector.objects.filter(id=connector_id).delete()
    return HttpResponse(json.dumps({
        'message': 'Removed connector and class_instances',
        'connector_id': connector_id}))


@requires_user_role(UserRole.Browse)
def list_completed(request, project_id):
    completed_by = request.GET.get('completed_by', None)
    from_date = request.GET.get('from', None)
    to_date = request.GET.get('to', None)

    # Sanitize
    if completed_by:
        completed_by = int(completed_by)
    if from_date:
        from_date = datetime.strptime(from_date, '%Y%m%d')
    if to_date:
        to_date = datetime.strptime(to_date, '%Y%m%d')

    response = _list_completed(project_id, completed_by, from_date, to_date)
    return HttpResponse(json.dumps(response), content_type="text/json")


def _list_completed(project_id, completed_by=None, from_date=None, to_date=None):
    """ Get a list of connector links that can be optionally constrained to be
    completed by a certain user in a given time frame. The returned connector
    links are by default only constrained by both sides having different
    relations and the first link was created before the second one.
    """
    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    params = [project_id, pre, post, pre, post]
    query = '''
        SELECT tc2.connector_id, c.location_x, c.location_y, c.location_z,
            tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
            t2.location_x, t2.location_y, t2.location_z,
            tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
            t1.location_x, t1.location_y, t1.location_z
        FROM treenode_connector tc1
        JOIN treenode_connector tc2 ON tc1.connector_id = tc2.connector_id
        JOIN connector c ON tc1.connector_id = c.id
        JOIN treenode t1 ON t1.id = tc1.treenode_id
        JOIN treenode t2 ON t2.id = tc2.treenode_id
        WHERE t1.project_id=%s
        AND tc1.relation_id <> tc2.relation_id
        AND tc1.creation_time > tc2.creation_time
        AND (tc1.relation_id = %s OR tc1.relation_id = %s)
        AND (tc2.relation_id = %s OR tc2.relation_id = %s)'''

    if completed_by:
        params.append(completed_by)
        query += " AND tc1.user_id=%s"
    if from_date:
        params.append(from_date.isoformat())
        query += " AND tc1.creation_time >= %s"
    if to_date:
        to_date =  to_date + timedelta(days=1)
        params.append(to_date.isoformat())
        query += " AND tc1.creation_time < %s"

    cursor.execute(query, params)

    return tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())


@requires_user_role(UserRole.Browse)
def connectors_info(request, project_id):
    """
    Given a list of connectors, a list of presynaptic skeletons and a list of postsynatic skeletons,
    return a list of rows, one per synaptic connection, in the same format as one_to_many_synapses.
    The list of connectors is optional.
    """

    cids = tuple(str(int(v)) for k,v in request.POST.iteritems() if k.startswith('cids['))
    skids_pre = tuple(str(int(v)) for k,v in request.POST.iteritems() if k.startswith('pre['))
    skids_post = tuple(str(int(v)) for k,v in request.POST.iteritems() if k.startswith('post['))

    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    cursor.execute('''
    SELECT DISTINCT
           tc1.connector_id, c.location_x, c.location_y, c.location_z,
           tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
           t1.location_x, t1.location_y, t1.location_z,
           tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
           t2.location_x, t2.location_y, t2.location_z
    FROM treenode_connector tc1,
         treenode_connector tc2,
         treenode t1,
         treenode t2,
         connector c
    WHERE %s
          tc1.connector_id = c.id
      AND tc1.connector_id = tc2.connector_id
      AND tc1.skeleton_id IN (%s)
      AND tc2.skeleton_id IN (%s)
      AND tc1.relation_id = %s
      AND tc2.relation_id = %s
      AND tc1.id != tc2.id
      AND tc1.treenode_id = t1.id
      AND tc2.treenode_id = t2.id
    ORDER BY tc2.skeleton_id
    ''' % ("c.id IN (%s) AND" % ",".join(cids) if cids else "",
           ",".join(skids_pre),
           ",".join(skids_post),
           pre,
           post))

    rows = tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())

    return HttpResponse(json.dumps(rows))

@requires_user_role([UserRole.Browse])
def connector_user_info(request, project_id):
    """ Return information on a treenode connector edge.

    This function is called often (every connector mouseover) and should
    therefore be as fast as possible. Analogous to user_info for treenodes and
    connectors.
    """
    treenode_id = int(request.GET.get('treenode_id'))
    connector_id = int(request.GET.get('connector_id'))
    cursor = connection.cursor()
    relation_names = ('presynaptic_to', 'postsynaptic_to', 'abutting')
    relations = get_relation_to_id_map(project_id, relation_names, cursor)
    relation_id = relations[request.GET.get('relation_name')]
    cursor.execute('''
        SELECT tc.id, tc.user_id, tc.creation_time, tc.edition_time
        FROM treenode_connector tc
        WHERE tc.treenode_id = %s
          AND tc.connector_id = %s
          AND tc.relation_id = %s
                   ''', (treenode_id, connector_id, relation_id))

    # We expect at least one result node.
    if not cursor.rowcount:
        return HttpResponse(json.dumps({
            'error': 'No treenode connector exists for treenode %s, connector %s, relation %s' %
            (treenode_id, connector_id, relation_id)}))

    # Build result. Because there is no uniqueness restriction on treenode
    # connector edges, even with the same relation, the response must handle
    # multiple rows.
    return HttpResponse(json.dumps([{
        'user': info[1],
        'creation_time': str(info[2].isoformat()),
        'edition_time': str(info[3].isoformat()),
    } for info in cursor.fetchall()]))
