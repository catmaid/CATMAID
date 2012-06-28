from collections import defaultdict
from django.db import transaction, connection
from django.http import HttpResponse, Http404
from django.db.models import Count
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Class, ClassInstance,\
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode,\
    Connector, User, Textlabel
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_optional,\
    catmaid_login_required
import json

@catmaid_login_required
def user_list(request, logged_in_user=None):
    result = {}
    for u in User.objects.all().order_by('longname'):
        result[str(u.id)] = {
            "id": u.id,
            "name": u.name,
            "longname": u.longname}
    return HttpResponse(json.dumps(result), mimetype='text/json')
