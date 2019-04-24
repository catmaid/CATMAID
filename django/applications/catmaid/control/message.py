# -*- coding: utf-8 -*-

import json
from typing import Optional, Union

from django.http import HttpRequest, HttpResponseRedirect, JsonResponse
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, render

from catmaid.models import Message, ChangeRequest
from catmaid.consumers import msg_user
from catmaid.control.common import makeJSON_legacy_list


@login_required
def get_latest_unread_date(request:HttpRequest) -> JsonResponse:
    """ This method creates a response containing the date of the most recent
    message added. It is formatted as epoch time.
    """
    try:
        latest_date = int(Message.objects \
            .filter(user=request.user, read=False) \
            .order_by('-time') \
            .values_list('time', flat=True)[0].strftime('%s')) # type: Optional[int]
    except IndexError:
        latest_date = None

    return JsonResponse({'latest_unread_date': latest_date})


@login_required
def list_messages(request:HttpRequest, project_id=None) -> JsonResponse:
    messages = Message.objects.filter(
        user=request.user,
        read=False)\
    .order_by('-time')

    def message_to_dict(message):
        return {
            'id': message.id,
            'title': message.title,
            'action': message.action,
            'text': message.text,
            'time': str(message.time)
        }

    messages = list(map(message_to_dict, messages))

    # Add a dummy message that includes the count of open notifications.
    # This is used to add the red badge to the notifications icon.
    crs = ChangeRequest.objects.filter(recipient = request.user, status = ChangeRequest.OPEN)
    messages += [{'id': -1, 'notification_count': len(crs)}]

    return JsonResponse(makeJSON_legacy_list(messages), safe=False)


@login_required
def read_message(request:HttpRequest, message_id) -> Union[HttpResponseRedirect, JsonResponse]:
        message = get_object_or_404(Message, pk=message_id, user=request.user)
        message.read = True
        message.save()

        if message.action:
            return HttpResponseRedirect(message.action)
        else:
            return JsonResponse({
                'success': True
            })

def notify_user(user_id, message_id, message_title) -> None:
    """Send a ASGI message to the user, if a channel is available."""
    msg_user(user_id, "new-message", {
        "message_id": message_id,
        "message_title": message_title
    })
