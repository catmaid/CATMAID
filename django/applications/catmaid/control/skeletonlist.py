from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

import sys


@requires_user_role(UserRole.Annotate)
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

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

    return HttpResponse(json.dumps({'success': '1'}))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
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

    qs = ClassInstanceClassInstance.objects.filter(
                relation__relation_name='model_of',
                project=p,
                class_instance_a__in=skellist[0].skeleton_list).select_related("class_instance_b")

    skellist = [q.class_instance_a.id for q in qs]
    skelneuronname = [q.class_instance_b.name + ' (Skeleton ID: ' + str(q.class_instance_a.id) + ')' for q in qs]

    return HttpResponse(json.dumps({'skeletonlist': skellist, 'neuronname': skelneuronname}))