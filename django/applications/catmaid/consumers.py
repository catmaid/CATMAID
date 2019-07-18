import json
import logging

from channels import Group
from channels.sessions import channel_session
from channels.auth import channel_session_user, channel_session_user_from_http
from channels.security.websockets import allowed_hosts_only


logger = logging.getLogger(__name__)

@allowed_hosts_only
@channel_session_user_from_http
def ws_update_connect(message) -> None:
    """Add connecting users to user group so they can receive messages from the
    server."""
    # Accept connection
    message.reply_channel.send({"accept": True})
    # Add user to the matching user group
    Group("updates-{}".format(message.user.id)).add(message.reply_channel)

@channel_session_user
def ws_update_disconnect(message) -> None:
    """Remove channel from group when user disconnects."""
    Group("updates-{}".format(message.user.id)).discard(message.reply_channel)

@channel_session_user
def ws_update_message(message) -> None:
    """Handle client messages."""
    logger.info("WebSockets message received: {}".format(message))

def msg_user(user_id, event_name, data:str="", data_type:str="text", is_raw_data:bool=False,
        ignore_missing:bool=True) -> None:
    """Send a message to a user. This message will contain a dictionary with the
    field <data_type> with content <data> if raw data is requested, otherwise
    with a dictionary. Its fields are "event" for the <event_name> and "payload"
    for <data>."""
    if is_raw_data:
        payload = data
    else:
        payload = json.dumps({
            "event": event_name,
            "payload": data
        })
    # Broadcast to listening sockets
    try:
        Group("updates-{}".format(user_id)).send({
            data_type: payload
        })
    except KeyError as e:
        if ignore_missing:
            pass
        else:
            raise e
