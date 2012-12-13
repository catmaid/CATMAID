import json

from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

@login_required
def user_list(request):
    result = {}
    for u in User.objects.all().order_by('last_name', 'first_name'):
        result[str(u.id)] = {
            "id": u.id,
            "name": u.username,
            "longname": u.get_full_name()}
    return HttpResponse(json.dumps(result), mimetype='text/json')
