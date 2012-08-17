
def insert_into_log(project_id, user_id, op_type, location=None, freetext=None):
    # valid operation types
    operation_type_array = [
        "rename_root",
        "create_neuron",
        "rename_neuron",
        "remove_neuron",
        "move_neuron",

        "create_group",
        "rename_group",
        "remove_group",
        "move_group",

        "create_skeleton",
        "rename_skeleton",
        "remove_skeleton",
        "move_skeleton",

        "split_skeleton",
        "join_skeleton",
        "reroot_skeleton",

        "change_confidence"
    ]

    if not op_type in operation_type_array:
        return {'error': 'Operation type {0} not valid'.format(op_type)}

    new_log = Log()
    new_log.user_id = user_id
    new_log.project_id = project_id
    new_log.operation_type = op_type
    if not location is None:
        new_log.location = location
    if not freetext is None:
        new_log.freetext = freetext

    new_log.save()

    # $q = $db->insertIntoId('log', $data );
    # echo json_encode( array ( 'error' => "Failed to insert operation $op_type for user $uid in project %pid." ) );


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
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '', sorting_directions)

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
