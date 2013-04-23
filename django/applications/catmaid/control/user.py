import json
import md5

from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

def _compute_rgb( user_id, normalize = True ):
	if user_id == -1:
		return [1.0, 0.0, 0.0]
	user_color = md5.new()
	user_color.update(str(user_id))
	user_color = user_color.hexdigest()
	if normalize:
		return [int(user_color[:1],16)/255.,
				int(user_color[2:4],16)/255.,
				int(user_color[4:6],16)/255. ]
	else:
		return [int(user_color[:1],16),
				int(user_color[2:4],16),
				int(user_color[4:6],16) ]

@login_required
def user_list(request):
    result = {}
    for u in User.objects.all().order_by('last_name', 'first_name'):
        result[str(u.id)] = {
            "id": u.id,
            "name": u.username,
            "longname": u.get_full_name(),
            "user_color_normalize": _compute_rgb( u.id ),
            "user_color": _compute_rgb( u.id, False ) }
    return HttpResponse(json.dumps(result), mimetype='text/json')
