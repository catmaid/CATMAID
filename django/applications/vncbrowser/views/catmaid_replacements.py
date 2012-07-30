import json

from collections import defaultdict
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction, connection
from django.db.models import Count
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Class, ClassInstance, \
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode, \
    Connector, User, Textlabel, Location, TreenodeConnector, Double3D, \
    TextlabelLocation, Log, Message
from vncbrowser.transaction import transaction_reportable_commit_on_success
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_optional, \
    catmaid_login_required, my_render_to_response
from common import insert_into_log, makeJSON_legacy_list


@catmaid_login_optional
def projects(request, logged_in_user=None):
    # This is somewhat ridiculous - four queries where one could be
    # used in raw SQL.  The problem here is chiefly that
    # 'select_related' in Django doesn't work through
    # ManyToManyFields.  Development versions of Django have
    # introduced prefetch_related, but this isn't in the stable
    # version that I'm using.  (Another way around this would be to
    # query on ProjectStack, but the legacy CATMAID schema doesn't
    # include a single-column primary key for that table.)

    stacks = dict((x.id, x) for x in Stack.objects.all())

    # Create a dictionary that maps from projects to stacks:
    c = connection.cursor()  # @UndefinedVariable
    c.execute("SELECT project_id, stack_id FROM project_stack")
    project_to_stacks = defaultdict(list)
    for project_id, stack_id in c.fetchall():
        project_to_stacks[project_id].append(stacks[stack_id])

    # Find all the projects, and mark those that are editable from the
    # project_user table:
    if logged_in_user:
        projects = Project.objects.all()
        c.execute("SELECT project_id FROM project_user WHERE user_id = %s",
                  [logged_in_user.id])
        editable_projects = set(x[0] for x in c.fetchall())
    else:
        projects = Project.objects.filter(public=True)
        editable_projects = set([])

    # Find all the projects that are editable:
    catalogueable_projects = set(x.project.id for x in Class.objects.filter(class_name='driver_line').select_related('project'))

    # Create a dictionary with those results that we can output as JSON:
    result = {}
    for p in projects:
        if p.id not in project_to_stacks:
            continue
        stacks_dict = {}
        for s in project_to_stacks[p.id]:
            stacks_dict[s.id] = {
                'title': s.title,
                'comment': s.comment,
                'note': '',
                'action': 'javascript:openProjectStack(%d,%d)' % (p.id, s.id)}
        editable = p.id in editable_projects
        result[p.id] = {
            'title': p.title,
            'public_project': int(p.public),
            'editable': int(editable),
            'catalogue': int(p.id in catalogueable_projects),
            'note': '[ editable ]' if editable else '',
            'action': stacks_dict}
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")


@catmaid_login_required
def labels_all(request, project_id=None, logged_in_user=None):
    qs = ClassInstance.objects.filter(
        class_column__class_name='label',
        project=project_id)
    return HttpResponse(json.dumps(list(x.name for x in qs)), mimetype="text/plain")


@catmaid_login_required
@transaction_reportable_commit_on_success
def labels_for_node(request, project_id=None, ntype=None, location_id=None, logged_in_user=None):
    if ntype == 'treenode':
        qs = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            treenode=location_id,
            project=project_id).select_related('class_instance')
    elif ntype == 'location' or ntype == 'connector':
        qs = ConnectorClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            connector=location_id,
            project=project_id).select_related('class_instance')
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))
    return HttpResponse(json.dumps(list(x.class_instance.name for x in qs)), mimetype="text/plain")


@catmaid_login_required
def labels_for_nodes(request, project_id=None, logged_in_user=None):
    nodes = [int(x, 10) for x in json.loads(request.POST['nods']).keys()]

    qs_treenodes = TreenodeClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        treenode__id__in=nodes,
        project=project_id).select_related('treenode', 'class_instance')

    qs_connectors = ConnectorClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        connector__id__in=nodes,
        project=project_id).select_related('connector', 'class_instance')

    result = defaultdict(list)

    for tci in qs_treenodes:
        result[tci.treenode.id].append(tci.class_instance.name)

    for cci in qs_connectors:
        result[cci.connector.id].append(cci.class_instance.name)

    return HttpResponse(json.dumps(result), mimetype="text/plain")


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def label_update(request, project_id=None, location_id=None, ntype=None, logged_in_user=None):
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')
    p = get_object_or_404(Project, pk=project_id)
    if ntype == 'treenode':
        TreenodeClassInstance.objects.filter(
            treenode__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').delete()
    elif ntype == 'connector' or ntype == 'location':
        ConnectorClassInstance.objects.filter(
            connector__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').delete()
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))
    label_class = Class.objects.get(project=project_id, class_name='label')
    for tag_name in json.loads(request.POST['tags']):
        existing_tags = list(ClassInstance.objects.filter(
            project=p,
            name=tag_name,
            class_column=label_class))
        if len(existing_tags) < 1:
            tag = ClassInstance(
                project=p,
                name=tag_name,
                user=logged_in_user,
                class_column=label_class)
            tag.save()
        else:
            tag = existing_tags[0]
        if ntype == 'treenode':
            tci = TreenodeClassInstance(
                user=logged_in_user,
                project=p,
                relation=labeled_as_relation,
                treenode=Treenode(id=location_id),
                class_instance=tag)
        else:
            tci = ConnectorClassInstance(
                user=logged_in_user,
                project=p,
                relation=labeled_as_relation,
                connector=Connector(id=location_id),
                class_instance=tag)
        tci.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@catmaid_login_required
def user_list(request, logged_in_user=None):
    result = {}
    for u in User.objects.all().order_by('longname'):
        result[str(u.id)] = {
            "id": u.id,
            "name": u.name,
            "longname": u.longname}
    return HttpResponse(json.dumps(result), mimetype='text/json')


@catmaid_login_required
def root_for_skeleton(request, project_id=None, skeleton_id=None, logged_in_user=None):
    tn = Treenode.objects.get(
        project=project_id,
        parent__isnull=True,
        treenodeclassinstance__class_instance__id=skeleton_id)
    return HttpResponse(json.dumps({
                'root_id': tn.id,
                'x': tn.location.x,
                'y': tn.location.y,
                'z': tn.location.z}),
                        mimetype='text/json')


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_connector(request, project_id=None, logged_in_user=None):
    query_parameters = {}
    default_values = {'x': 0, 'y': 0, 'z': 0, 'confidence': 5}
    for p in default_values.keys():
        query_parameters[p] = request.POST.get(p, default_values[p])

    parsed_confidence = int(query_parameters['confidence'])
    if (parsed_confidence not in range(1, 6)):
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))

    location = Double3D(x=float(query_parameters['x']), y=float(query_parameters['y']), z=float(query_parameters['z']))
    new_connector = Connector(
            user=logged_in_user,
            project=Project.objects.get(id=project_id),
            location=location,
            confidence=parsed_confidence)
    new_connector.save()

    return HttpResponse(json.dumps({'connector_id': new_connector.id}))


@catmaid_can_edit_project
@transaction.commit_on_success
def delete_connector(request, project_id=None, logged_in_user=None):
    connector_id = int(request.POST.get("connector_id", 0))
    Connector.objects.filter(id=connector_id).delete()
    return HttpResponse(json.dumps({
        'message': 'Removed connector and class_instances',
        'connector_id': connector_id}))


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_link(request, project_id=None, logged_in_user=None):
    from_id = request.POST.get('from_id', 0)
    to_id = request.POST.get('to_id', 0)
    link_type = request.POST.get('link_type', 'none')

    try:
        project = Project.objects.get(id=project_id)
        relation = Relation.objects.get(project=project, relation_name=link_type)
        from_treenode = Treenode.objects.get(id=from_id)
        to_connector = Connector.objects.get(id=to_id, project=project)
    except ObjectDoesNotExist as e:
        return HttpResponse(json.dumps({'error': e.message}))

    related_skeleton_count = ClassInstance.objects.filter(project=project, id=from_treenode.skeleton.id).count()
    if (related_skeleton_count > 1):
        # I don't see the utility of this check, think it can only happen if
        # treenodes with non-unique IDs exist in DB. Duplicating it from PHP
        # though.
        return HttpResponse(json.dumps({'error': 'Multiple rows for treenode with ID #%s found' % from_id}))
    elif (related_skeleton_count == 0):
        return HttpResponse(json.dumps({'error': 'Failed to retrieve skeleton id of treenode #%s' % from_id}))

    if (link_type == 'presynaptic_to'):
        # Enforce only one presynaptic link
        presyn_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        if (presyn_links.count() != 0):
            return HttpResponse(json.dumps({'error': 'Connector %s does not have zero presynaptic connections.' % to_id}))

    TreenodeConnector(
            user=logged_in_user,
            project=project,
            relation=relation,
            treenode=from_treenode,  # treenode_id = from_id
            skeleton=from_treenode.skeleton,  # treenode.skeleton_id where treenode.id = from_id
            connector=to_connector  # connector_id = to_id
            ).save()

    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_textlabel(request, project_id=None, logged_in_user=None):
    params = {}
    param_defaults = {
            'x': 0,
            'y': 0,
            'z': 0,
            'text': 'Edit this text...',
            'type': 'text',
            'r': 1,
            'g': 0.5,
            'b': 0,
            'a': 1,
            'font_name': False,
            'font_style': False,
            'font_size': False,
            'scaling': False}
    for p in param_defaults.keys():
        params[p] = request.POST.get(p, param_defaults[p])
    if (params['type'] != 'bubble'):
        params['type'] = 'text'

    new_label = Textlabel(
            text=params['text'],
            type=params['type'],
            scaling=params['scaling']
            )
    new_label.project_id = project_id
    if params['font_name']:
        new_label.font_name = params['font_name']
    if params['font_style']:
        new_label.font_style = params['font_style']
    if params['font_size']:
        new_label.font_size = params['font_size']
    new_label.save()

    TextlabelLocation(
            textlabel=new_label,
            location=Double3D(float(params['x']), float(params['y']), float(params['z']))).save()

    return HttpResponse(json.dumps({'tid': new_label.id}))


@catmaid_login_required
def most_recent_treenode(request, project_id=None, logged_in_user=None):
    skeleton_id = request.POST.get('skeleton_id', -1)
    treenode_id = request.POST.get('treenode_id', -1)

    try:
        tn = Treenode.objects\
        .filter(project=project_id,
                skeleton=skeleton_id,
                user=logged_in_user)\
        .extra(select={'most_recent': 'greatest(treenode.creation_time, treenode.edition_time)'})\
        .extra(order_by=['-most_recent'])[0]
    except IndexError:
        # TODO Not sure whether this is correct. This is the only place
        # where the treenode_id is used. Does it really have anything
        # to do with the query? The error message doesn't make much sense
        # either.
        return HttpResponse(json.dumps({'error': 'No skeleton and neuron found for treenode %s' % treenode_id}))

    return HttpResponse(json.dumps({
        'id': tn.id,
        'skeleton_id': tn.skeleton.id,
        'x': int(tn.location.x),
        'y': int(tn.location.y),
        'z': int(tn.location.z),
        # 'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        'type': 'treenode'
        }))


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def delete_link(request, project_id=None, logged_in_user=None):
    connector_id = request.POST.get('connector_id', 0)
    treenode_id = request.POST.get('treenode_id', 0)

    links = TreenodeConnector.objects.filter(
            connector=connector_id,
            treenode=treenode_id)

    if (links.count() == 0):
        return HttpResponse(json.dumps({'error': 'Failed to delete connector #%s from geometry domain.' % connector_id}))

    links.delete()
    return HttpResponse(json.dumps({'result': 'Removed treenode to connector link'}))


@catmaid_login_required
@transaction.commit_on_success
def search(request, project_id=None, logged_in_user=None):
    def format_node_data(node):
        '''
        Formats node data for our json output.

        When we start using Django 1.4, we can use prefetch_related instead of using
        .values('treenode__xxx'), and will then be able to access a proper location
        object.
        '''
        location = Double3D.from_str(node['treenode__location'])
        return {
                'id': node['treenode'],
                'x': int(location.x),
                'y': int(location.y),
                'z': int(location.z),
                'skid': node['treenode__skeleton']}

    search_string = request.GET.get('substring', "")

    row_query = ClassInstance.objects.values('id', 'name', 'class_column__class_name').filter(
            name__icontains=search_string,
            project=project_id).order_by('class_column__class_name', 'name')
    rows = list(row_query)

    relation_map = get_relation_to_id_map(project_id)
    label_rows = {}
    for row in rows:
        # Change key-name of class_column__class_name for json output
        row['class_name'] = row.pop('class_column__class_name')
        # Prepare for retrieving nodes holding text labels
        if row['class_name'] == 'label':
            row['nodes'] = []
            label_rows[row['name']] = row

    node_query = TreenodeClassInstance.objects.filter(
            project=project_id,
            treenode__project=project_id,
            relation=relation_map['labeled_as'],
            class_instance__name__in=label_rows.keys())\
                    .order_by('-treenode__id')\
                    .values('treenode',
                            'treenode__location',
                            'treenode__skeleton',
                            'class_instance__name')
    # Insert nodes into their rows
    for node in node_query:
        row_with_node = label_rows[node['class_instance__name']]
        row_with_node['nodes'].append(format_node_data(node))

    # Delete the nodes property from rows with no nodes
    for row in rows:
        if 'nodes' in row and len(row['nodes']) == 0:
            del row['nodes']

    return HttpResponse(json.dumps(rows))


@catmaid_login_required
@transaction.commit_on_success
def list_logs(request, project_id=None, logged_in_user=None):
    user_id = int(request.POST.get('user_id', -1))  # We can see logs for different users
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 200  # Default number of result rows

    should_sort = request.POST.get('iSortCol_0', False)
    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('iSortDir_%d' % d) for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if d == 'DESC' else '', sorting_directions)

        fields = ['user', 'operation_type', 'creation_time', 'x', 'y', 'z', 'freetext']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d)) for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

    log_query = Log.objects.filter(project=project_id)
    if user_id not in [-1, 0]:
        log_query = log_query.filter(user=user_id)
    log_query = log_query.extra(tables=['user'], where=['"log"."user_id" = "user"."id"'], select={
        'x': '("log"."location")."x"',
        'y': '("log"."location")."y"',
        'z': '("log"."location")."z"',
        'username': '"user"."name"',
        'timestamp': '''to_char("log"."creation_time", 'DD-MM-YYYY HH24:MI')'''
        })
    if should_sort:
        log_query = log_query.extra(order_by=[di + col for (di, col) in zip(sorting_directions, sorting_cols)])

    result = list(log_query[display_start:display_start + display_length])

    response = {'iTotalRecords': len(result), 'iTotalDisplayRecords': len(result), 'aaData': []}
    for log in result:
        response['aaData'] += [[
                log.username,
                log.operation_type,
                log.timestamp,
                log.x,
                log.y,
                log.z,
                log.freetext
                ]]

    return HttpResponse(json.dumps(response))


@catmaid_can_edit_project
@transaction.commit_on_success
def update_confidence(request, project_id=None, logged_in_user=None, node=0):
    new_confidence = request.POST.get('new_confidence', None)
    if (new_confidence == None):
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))
    else:
        parsed_confidence = int(new_confidence)
        if (parsed_confidence not in range(1, 6)):
            return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))

    tnid = int(node)

    if (request.POST.get('to_connector', 'false') == 'true'):
        toUpdate = TreenodeConnector.objects.filter(
                project=project_id,
                treenode=tnid)
    else:
        toUpdate = Treenode.objects.filter(
                project=project_id,
                id=tnid)

    rows_affected = toUpdate.update(confidence=new_confidence)

    if (rows_affected > 0):
        location = Location.objects.filter(project=project_id, id=tnid)[0].location
        insert_into_log(project_id, logged_in_user.id, "change_confidence", location, "Changed to %s" % new_confidence)
    elif (request.POST.get('to_connector', 'false') == 'true'):
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s and connector.' % tnid}))
    else:
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s.' % tnid}))

    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@catmaid_login_required
def unread_messages(request, project_id=None, logged_in_user=None):
    messages = Message.objects.filter(
            user=logged_in_user,
            read=False).extra(select={
                'time_formatted': 'to_char("time", \'YYYY-MM-DD HH24:MI:SS TZ\')'})\
                    .order_by('-time')

    def message_to_dict(message):
        return {
                'id': message.id,
                'title': message.title,
                'action': message.action,
                'text': message.text,
                # time does not correspond exactly to PHP version, lacks
                # timezone postfix. Can't find docs anywhere on how to get it.
                # Doesn't seem to be used though, luckily.
                'time': str(message.time),
                'time_formatted': message.time_formatted
                }

    messages = map(message_to_dict, messages)

    return HttpResponse(json.dumps(makeJSON_legacy_list(messages)))


@catmaid_login_required
@transaction_reportable_commit_on_success
def read_message(request, project_id=None, logged_in_user=None):
    message_id = request.GET.get('id', 0)
    message_on_error = ''
    try:
        message_on_error = 'Could not retrieve message with id %s.' % message_id
        message = Message.objects.filter(user=logged_in_user, id=message_id)[0]
        message_on_error = 'Could not mark message with id %s as read.' % message_id
        message.read = True
        message.save()

        if message.action is not None and message.action != '':
            redirect = 'location.replace(%s)' % message.action
            redir_link = message.action
        else:
            redirect = 'history.back()'
            redir_link = 'history.back()'

        return my_render_to_response(request, 'vncbrowser/read_message.html', {
                    'url': request.build_absolute_uri(),
                    'redirect': redirect,
                    'redir_link': redir_link})

    except Exception as e:
        if message_on_error != '':
            error = message_on_error
        elif e.message != '':
            error = e.message
        else:
            error = 'Unknown error.'
        return my_render_to_response(request, 'vncbrowser/error.html', {'error': error})


@catmaid_login_required
def stats(request, project_id=None, logged_in_user=None):
    qs = Treenode.objects.filter(project=project_id)
    qs = qs.values('user__name').annotate(count=Count('user__name'))
    result = {'users': [],
              'values': []}
    for d in qs:
        result['values'].append(d['count'])
        user_name = '%s (%d)' % (d['user__name'], d['count'])
        result['users'].append(user_name)
    return HttpResponse(json.dumps(result), mimetype='text/json')


@catmaid_login_required
def stats_summary(request, project_id=None, logged_in_user=None):
    result = {
        'proj_users': User.objects.filter(project=project_id).count(),
        'proj_treenodes': Treenode.objects.filter(project=project_id).count(),
        'proj_textlabels': Textlabel.objects.filter(project=project_id).count()}
    for key, class_name in [('proj_neurons', 'neuron'),
                            ('proj_synapses', 'synapse'),
                            ('proj_skeletons', 'skeleton'),
                            ('proj_presyn', 'presynaptic terminal'),
                            ('proj_postsyn', 'postsynaptic terminal'),
                            ('proj_tags', 'label')]:
        result[key] = ClassInstance.objects.filter(
            project=project_id,
            class_column__class_name=class_name).count()
    return HttpResponse(json.dumps(result), mimetype='text/json')


def get_relation_to_id_map(project_id):
    result = {}
    for r in Relation.objects.filter(project=project_id):
        result[r.relation_name] = r.id
    return result


def get_class_to_id_map(project_id):
    result = {}
    for r in Class.objects.filter(project=project_id):
        result[r.class_name] = r.id
    return result


@catmaid_login_required
def node_list(request, project_id=None, logged_in_user=None):
    # FIXME: This function is not uptodate, and needs to be rewritten

    # This is probably the most complex view.  For the moment, I'm
    # just using the same queries as before:
    relation_to_id = get_relation_to_id_map(project_id)
    class_to_id = get_class_to_id_map(project_id)
    presyn_id = relation_to_id['presynaptic_to']
    query_parameters = {}
    for p in ('left', 'width', 'top', 'height', 'z', 'zres'):
        query_parameters[p] = request.GET[p]
    query_parameters['limit'] = 400
    query_parameters['zbound'] = 1.0
    query_parameters['project_id'] = project_id
    c = connection.cursor()
    # Fetch all the treenodes which are in the bounding box:
    c.execute('''
SELECT treenode.id AS id,
       treenode.parent_id AS parentid,
       (treenode.location).x AS x,
       (treenode.location).y AS y,
       (treenode.location).z AS z,
       treenode.confidence AS confidence,
       treenode.user_id AS user_id,
       treenode.radius AS radius,
       ((treenode.location).z - %(z)s) AS z_diff,
       treenode_class_instance.class_instance_id AS skeleton_id,
       'treenode' AS type
   FROM (treenode INNER JOIN relation ON (relation.relation_name = 'element_of' AND relation.project_id = treenode.project_id))
      LEFT OUTER JOIN (treenode_class_instance
         INNER JOIN (class_instance INNER JOIN class ON class_instance.class_id = class.id AND class.class_name = 'skeleton')
         ON treenode_class_instance.class_instance_id = class_instance.id)
      ON (treenode_class_instance.treenode_id = treenode.id AND treenode_class_instance.relation_id = relation.id)
   WHERE treenode.project_id = %(project_id)s
      AND (treenode.location).x >= %(left)s
      AND (treenode.location).x <= (CAST (%(left)s AS double precision) + %(width)s)
      AND (treenode.location).y >= %(top)s
      AND (treenode.location).y <= (CAST (%(top)s AS double precision) + %(height)s)
      AND (treenode.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s
      AND (treenode.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s
      ORDER BY parentid DESC, id, z_diff
      LIMIT %(limit)s
''',
              query_parameters)
    headings = c.description
    treenodes = [dict(zip((column[0] for column in headings), row))
                 for row in c.fetchall()]

    query_parameters['model_of_id'] = relation_to_id['model_of']
    query_parameters['synapse_id'] = class_to_id['synapse']
    # Now find all the connectors in the same region:
    c.execute('''
SELECT connector.id AS id,
       (connector.location).x AS x,
       (connector.location).y AS y,
       (connector.location).z AS z,
       connector.user_id AS user_id,
       ((connector.location).z - %(z)s) AS z_diff,
       treenode_connector.relation_id AS treenode_relation_id,
       treenode_connector.treenode_id AS tnid,
       'connector' AS type
    FROM connector_class_instance AS lci, class_instance AS ci, connector
        LEFT OUTER JOIN treenode_connector ON treenode_connector.connector_id = connector.id
       WHERE connector.project_id = %(project_id)s AND
           (connector.location).x >= %(left)s AND
           (connector.location).x <= CAST (%(left)s AS double precision) + %(width)s AND
           (connector.location).y >= %(top)s AND
           (connector.location).y <= CAST (%(top)s AS double precision) + %(height)s AND
           (connector.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s AND
           (connector.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s AND
           connector.id = lci.connector_id AND
           ci.id = lci.class_instance_id AND
           lci.relation_id = %(model_of_id)s AND
           ci.class_id = %(synapse_id)s
        ORDER BY id, z_diff LIMIT %(limit)s
''',
              query_parameters)
    headings = c.description
    connectors = [dict(zip((column[0] for column in headings), row))
                  for row in c.fetchall()]

    already_seen_connectors = {}
    pushed_treenodes = len(treenodes)

    # FIXME: this is taken directly from the PHP, and could be simplified
    # a great deal.
    for connector in connectors:
        connector_id = connector['id']
        if connector['tnid']:
            tnid = connector['tnid']
            relationship = 'pre' if (connector['treenode_relation_id'] == presyn_id) else 'post'
        else:
            tnid = None
            relationship = None
        reuse = connector_id in already_seen_connectors
        val = connector
        del val['tnid']
        del val['treenode_relation_id']
        if reuse:
            existing_index = already_seen_connectors[connector_id]
            if tnid:
                val = treenodes[existing_index]
            else:
                val = None
        if val:
            if tnid:
                val.setdefault(relationship, [])
                val[relationship].append({'tnid': tnid})
            if reuse:
                treenodes[existing_index] = val
            else:
                treenodes.append(val)
                already_seen_connectors[connector_id] = pushed_treenodes
                pushed_treenodes += 1

    return HttpResponse(json.dumps(treenodes), mimetype='text/json')
