import json

from django.http import HttpResponse
from django.db.models import Count

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

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
