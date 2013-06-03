import json
import colorsys
from random import random

from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

@login_required
def user_list(request):
    result = []
    for u in User.objects.all().order_by('last_name', 'first_name'):
        up = u.userprofile
        result.append({
            "id": u.id,
            "login": u.username,
            "full_name": u.get_full_name(),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "color": (up.color.r, up.color.g, up.color.b) })
    
    return HttpResponse(json.dumps(result), mimetype='text/json')


initial_colors = [(1, 0, 0, 1), 
                  (0, 1, 0, 1), 
                  (0, 0, 1, 1), 
                  (1, 0, 1, 1), 
                  (0, 1, 1, 1), 
                  (1, 1, 0, 1), 
                  (1, 1, 1, 1), 
                  (1, 0.5, 0, 1), 
                  (1, 0, 0.5, 1), 
                  (0.5, 1, 0, 1), 
                  (0, 1, 0.5, 1), 
                  (0.5, 0, 1, 1), 
                  (0, 0.5, 1, 1)];


def distinct_user_color():
    users = User.objects.exclude(id__exact=-1).order_by('id')
    
    if len(users) < len(initial_colors):
        distinct_color = initial_colors[len(users)]
    else:
        distinct_color = colorsys.hsv_to_rgb(random(), random(), 1.0) + (1,)
    
    return distinct_color
