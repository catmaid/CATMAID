import json
from datetime import timedelta, datetime, date

from django.http import HttpResponse
from django.db.models import Count
from django.db import connection
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats(request, project_id=None):
    qs = Treenode.objects.filter(project=project_id)
    qs = qs.values('user__username').annotate(count=Count('user__username'))
    result = {'users': [],
              'values': []}
    for d in qs:
        result['values'].append(d['count'])
        user_name = '%s (%d)' % (d['user__username'], d['count'])
        result['users'].append(user_name)
    return HttpResponse(json.dumps(result), mimetype='text/json')

def _process(query, minus1name):
    cursor = connection.cursor()
    cursor.execute(query)
    result = {'users': [],
              'values': []}
    for row in cursor.fetchall():
        result['values'].append(row[1])
        s = row if "AnonymousUser" != row[0] else (minus1name, row[1])
        result['users'].append('%s (%d)' % s)
    return HttpResponse(json.dumps(result), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_reviewer(request, project_id=None):
    # Can't reuse stats function with 'reviewer_username' because the Treenode
    # class doesn't contain a revier as a model of a User, but directly a reviewer_id
    # given that it can be -1, meaning no one rather than the anonymous user.
    # In any case the direct SQL command is arguably clearer.
    return _process('''
    SELECT username, count(reviewer_id) FROM treenode, auth_user WHERE project_id=%s AND reviewer_id=auth_user.id GROUP BY username
    ''' % int(project_id), "*unreviewed*")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_editor(request, project_id=None):
    return _process('''
    SELECT username, count(editor_id)
    FROM treenode, auth_user
    WHERE project_id=%s
      AND editor_id != user_id
      AND editor_id=auth_user.id
    GROUP BY username
    ''' % int(project_id), "*unedited*")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_summary(request, project_id=None):
    startdate = datetime.today()
    result = {
        'treenodes_created': Treenode.objects.filter(
            project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day).count(),
        'connectors_created': Connector.objects.filter(project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day
            ).count(),
    }
    for key, class_name in [
        ('skeletons_created', 'skeleton')
        ]:
        result[key] = ClassInstance.objects.filter(
            project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day,
            class_column__class_name=class_name).count()
    return HttpResponse(json.dumps(result), mimetype='text/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_history(request, project_id=None):
    # Get the start and end dates for the query, defaulting to the last 30 days.
    start_date = request.GET.get('start_date', datetime.now() - timedelta(30))
    end_date = request.GET.get('end_date', datetime.now())
    
    # Look up all tree nodes for the project in the given date range.
    # Also add a computed field which is just the day of the last edited date/time.
    tree_nodes = Treenode.objects.filter(
        project = project_id, 
        edition_time__range = (start_date, end_date)).extra(select={ 'date' : 'to_char("treenode"."edition_time", \'YYYYMMDD\')' }).order_by('user', 'date')
    
    # Get the count of tree nodes for each user/day combination.
    stats = tree_nodes.values('user__username', 'date').annotate(count = Count('id'))
    
    # Change the 'user__username' field name to just 'name'.
    # (If <https://code.djangoproject.com/ticket/12222> ever gets implemented then this wouldn't be necessary.)
    stats = [{'name':stat['user__username'], 'date':stat['date'], 'count':stat['count']} for stat in stats]
    
    return HttpResponse(json.dumps(stats), mimetype='text/json')
    
def stats_user_history(request, project_id=None):

    relation_map = get_relation_to_id_map(project_id)
    last_x_days = 10
    # Get the start and end dates for the query, defaulting to the last 30 days.
    # start_date = request.GET.get('start_date', datetime.now() - timedelta(last_x_days))
    # end_date = request.GET.get('end_date', datetime.now())
    start_date = datetime.now() - timedelta(last_x_days)
    end_date = datetime.now()
    all_users = User.objects.filter().values('username', 'id')
    map_userid_to_name = {}
    for user in all_users:
        map_userid_to_name[user['id']] = user['username']
    days = []
    daysformatted = []
    for i in range(last_x_days+1):
        tmp_date = start_date + timedelta(days=i)
        days.append( tmp_date.strftime("%Y%m%d") )
        daysformatted.append( tmp_date.strftime("%a %d, %h %Y") )
    stats_table = {}
    for userid in map_userid_to_name.keys():
        if userid == -1:
            continue
        stats_table[ map_userid_to_name[userid] ] = {}
        for i in range(last_x_days+1):
            tmp_date = start_date + timedelta(days=i)
            stats_table[ map_userid_to_name[userid] ][ tmp_date.strftime("%Y%m%d") ] = {}

    # Look up all tree nodes for the project in the given date range.
    # Also add a computed field which is just the day of the last edited date/time.
    tree_nodes = Treenode.objects.filter(
        project = project_id, 
        edition_time__range = (start_date, end_date)).extra(select={ 'date' : 'to_char("treenode"."edition_time", \'YYYYMMDD\')' }).order_by('user', 'date')
    # Get the count of tree nodes for each user/day combination.
    treenode_stats = tree_nodes.values('user__username', 'date', 'user__id').annotate(count = Count('id'))
    # Change the 'user__username' field name to just 'name'.
    # (If <https://code.djangoproject.com/ticket/12222> ever gets implemented then this wouldn't be necessary.)
    treenode_stats = [{'username':stat['user__username'], 'userid': stat['user__id'], 'date':stat['date'], 'count':stat['count']} for stat in treenode_stats]
    
    connector_nodes = Connector.objects.filter(
    project = project_id, 
    edition_time__range = (start_date, end_date)).extra(select={ 'date' : 'to_char("connector"."edition_time", \'YYYYMMDD\')' }).order_by('user', 'date')
    connector_stats = connector_nodes.values('user__username', 'date', 'user__id').annotate(count = Count('id'))
    connector_stats = [{'username':stat['user__username'], 'userid': stat['user__id'], 'date':stat['date'], 'count':stat['count']} for stat in connector_stats]

    tree_reviewed_nodes = Treenode.objects.filter(
        project = project_id,
        edition_time__range = (start_date, end_date)).exclude(reviewer_id=-1).extra(select={ 'date' : 'to_char("treenode"."review_time", \'YYYYMMDD\')' }).order_by('user', 'date')
    treenode_reviewed_stats = tree_reviewed_nodes.values('reviewer_id', 'date').annotate(count = Count('id'))
    treenode_reviewed_stats = [{'userid':stat['reviewer_id'], 'date':stat['date'], 'count':stat['count']} for stat in treenode_reviewed_stats]
    
    labeled_nodes = TreenodeClassInstance.objects.filter(
        project = project_id,
        relation = relation_map['labeled_as'],
        edition_time__range = (start_date, end_date)).extra(select={ 'date' : 'to_char("treenode_class_instance"."edition_time", \'YYYYMMDD\')' }).order_by('user', 'date')
    labeled_nodes_stats = labeled_nodes.values('user__username', 'user__id', 'date').annotate(count = Count('id'))
    labeled_nodes_stats = [{'username':stat['user__username'], 'userid':stat['user__id'], 'date':stat['date'], 'count':stat['count']} for stat in labeled_nodes_stats]

    for di in treenode_stats:
        stats_table[ di['username'] ][ di['date'] ]['new_treenodes'] = di['count']

    for di in connector_stats:
        stats_table[ di['username'] ][ di['date'] ]['new_connectors'] = di['count']

    for di in treenode_reviewed_stats:
        stats_table[ map_userid_to_name[di['userid']] ][ di['date'] ]['new_reviewed_nodes'] = di['count']

    for di in labeled_nodes_stats:
        stats_table[ di['username'] ][ di['date'] ]['new_tags'] = di['count']

    return HttpResponse(json.dumps({ 'stats_table': stats_table, 'days': days, 'daysformatted': daysformatted}), mimetype='text/json')
    
