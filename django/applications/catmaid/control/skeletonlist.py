from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

import sys


@login_required
@transaction.commit_on_success
def save_skeletonlist(request, project_id=None):

    shortname = request.POST.get('shortname', None)
    description = request.POST.get('description', "")
    skeletonlist = request.POST.getlist('skeletonlist[]')

    p = get_object_or_404(Project, pk=project_id)

    if shortname is None or skeletonlist is None:
        return HttpResponse(json.dumps({'error':'No shortname given'}), mimetype="text/plain")

    skellist = [int(v) for v in skeletonlist]

    try:
        response_on_error = 'Storing the skeleton list failed'
        SkeletonlistDashboard(
            user = request.user,
            project = p,
            shortname = shortname,
            description = description,
            skeleton_list = skellist
        ).save()

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error + ':' + str(e))

    return HttpResponse(json.dumps({'success': '1'}))

@login_required
def load_skeletonlist(request, project_id=None):

    shortname = request.POST.get('shortname', None)

    p = get_object_or_404(Project, pk=project_id)

    if shortname is None:
        return HttpResponse(json.dumps({'error':'No shortname given'}), mimetype="text/plain")

    skellist = SkeletonlistDashboard.objects.filter(
        project = p,
        shortname = shortname,
    )
    if len(skellist) == 0:
        return HttpResponse(json.dumps({'error': 'No skeleton list found for this short name.'}))

    return HttpResponse(json.dumps({'skeletonlist': skellist[0].skeleton_list}))