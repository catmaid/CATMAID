import json

from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@catmaid_login_required
def unread_messages(request, project_id=None, logged_in_user=None):
    messages = Message.objects.filter(
        user=logged_in_user,
        read=False).extra(select={
        'time_formatted': 'to_char("time", \'YYYY-MM-DD HH24:MI:SS TZ\')'})\
    .order_by('-time')

    def message_to_dict(message):
        return {
            'id': message.id,
            'title': message.title,
            'action': message.action,
            'text': message.text,
            # time does not correspond exactly to PHP version, lacks
            # timezone postfix. Can't find docs anywhere on how to get it.
            # Doesn't seem to be used though, luckily.
            'time': str(message.time),
            'time_formatted': message.time_formatted
        }

    messages = map(message_to_dict, messages)

    return HttpResponse(json.dumps(makeJSON_legacy_list(messages)))


@catmaid_login_required
@transaction_reportable_commit_on_success
def read_message(request, project_id=None, logged_in_user=None):
    message_id = request.GET.get('id', 0)
    message_on_error = ''
    try:
        message_on_error = 'Could not retrieve message with id %s.' % message_id
        message = Message.objects.filter(user=logged_in_user, id=message_id)[0]
        message_on_error = 'Could not mark message with id %s as read.' % message_id
        message.read = True
        message.save()

        if message.action is not None and message.action != '':
            redirect = 'location.replace(%s)' % message.action
            redir_link = message.action
        else:
            redirect = 'history.back()'
            redir_link = 'history.back()'

        return my_render_to_response(request, 'vncbrowser/read_message.html', {
            'url': request.build_absolute_uri(),
            'redirect': redirect,
            'redir_link': redir_link})

    except Exception as e:
        if message_on_error != '':
            error = message_on_error
        elif e.message != '':
            error = e.message
        else:
            error = 'Unknown error.'
        return my_render_to_response(request, 'vncbrowser/error.html', {'error': error})

