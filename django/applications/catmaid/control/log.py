import json
from string import upper

from django.http import HttpResponse

from catmaid.models import UserRole, Log
from catmaid.control.authentication import requires_user_role 


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_logs(request, project_id=None):
    user_id = int(request.POST.get('user_id', -1))  # We can see logs for different users
    operation_type = request.POST.get('operation_type', "-1")
    search_freetext = request.POST.get('search_freetext', "")
    
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    should_sort = request.POST.get('iSortCol_0', False)
    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC') for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '', sorting_directions)

        fields = ['user', 'operation_type', 'creation_time', 'x', 'y', 'z', 'freetext']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d)) for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

    log_query = Log.objects.for_user(request.user).filter(project=project_id)
    if user_id not in [-1, 0]:
        log_query = log_query.filter(user=user_id)
    if not operation_type == "-1":
        log_query = log_query.filter(operation_type=operation_type)
    if not search_freetext == "":
        log_query = log_query.filter(freetext__contains=search_freetext)

    log_query = log_query.extra(tables=['auth_user'], where=['"log"."user_id" = "auth_user"."id"'], select={
        'x': '("log"."location")."x"',
        'y': '("log"."location")."y"',
        'z': '("log"."location")."z"',
        'username': '"auth_user"."username"',
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
