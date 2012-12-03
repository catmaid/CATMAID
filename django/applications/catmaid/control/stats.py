import json
from datetime import timedelta, datetime, date

from django.http import HttpResponse
from django.db.models import Count

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
    