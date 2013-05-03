import json
import colorsys

from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

@login_required
def user_list(request):
    result = []
    users = User.objects.all().order_by('last_name', 'first_name')
    i = 0.0
    for u in users:
        result.append({
            "id": u.id,
            "login": u.username,
            "full_name": u.get_full_name(),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "color": colorsys.hsv_to_rgb(i / len(users) + 90.0 / 360.0, 1.0 if len(users) <= 6 else 1.0 - (i % 2) * 0.5, 1) })
        i = i + 1.0
    
    # Rational behind color algorithm:
    #  * The hue of each color is evenly spaced around the color map starting at green.
    #  * If there are more than six users then the saturation of each color toggles between 1 and 0.5 so that neighboring colors are easier to distinguish.
    #  * The value is held at 1.0 to maximize the range of shading that can be done.
    
    return HttpResponse(json.dumps(result), mimetype='text/json')
