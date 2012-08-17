import json

from django.http import HttpResponse

from catmaid.models import User
from catmaid.control.authentication import catmaid_login_required

@catmaid_login_required
def user_list(request, logged_in_user=None):
    result = {}
    for u in User.objects.all().order_by('longname'):
        result[str(u.id)] = {
            "id": u.id,
            "name": u.name,
            "longname": u.longname}
    return HttpResponse(json.dumps(result), mimetype='text/json')
