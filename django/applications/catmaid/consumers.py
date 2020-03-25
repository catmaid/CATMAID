import json
import logging

from asgiref.sync import async_to_sync

from channels.generic.websocket import WebsocketConsumer
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def get_user_group_name(user_id):
    return f"updates-{user_id}"

class UpdateConsumer(WebsocketConsumer):

    def connect(self):
        """Add connecting users to user group so they can receive messages from the
        server.
        """
        # Don't do anything, if there is no channels layer.
        if not self.channel_layer:
            logger.error(f'UpdateConsumer: can\'t handle WebSockets connection, no channels layer')
            return
        # Add user to the matching user group
        user = self.scope["user"]
        async_to_sync(self.channel_layer.group_add)(get_user_group_name(user.id), self.channel_name)
        self.accept()

    def disconnect(self, message):
        """Remove channel from group when user disconnects.
        """
        # Don't do anything, if there is no channels layer.
        if not self.channel_layer:
            logger.error(f'UpdateConsumer: can\'t handle WebSockets disconnect, no channels layer')
            return
        user = self.scope["user"]
        async_to_sync(self.channel_layer.group_discard)(get_user_group_name(user.id), self.channel_name)

    def receive(self, *, text_data):
        """Handle client messages.
        """
        # Don't do anything, if there is no channels layer.
        if not self.channel_layer:
            logger.error(f'UpdateConsumer: can\'t handle WebSockets message, no channels layer')
            return
        user = self.scope["user"]
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        logger.info("WebSockets message received: {}".format(message))
        async_to_sync(self.channel_layer.group_send)(
            get_user_group_name(user.id),
            {
                "type": "user.message",
                "data": text_data,
            },
        )

    def user_message(self, event):
        self.send(text_data=event["data"])


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
        channel_layer = get_channel_layer()
        # Without any channel layer, there is no point in trying to send a
        # message.
        if not channel_layer:
            return
        async_to_sync(channel_layer.group_send)(get_user_group_name(user_id), {
            'type': 'user.message',
            'data': payload,
        })
    except KeyError as e:
        if ignore_missing:
            pass
        else:
            raise e
