import json
import logging
import msgpack

from asgiref.sync import async_to_sync
from celery import current_app

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


def is_in_celery_task():
    from celery import current_task
    return bool(current_task)


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
        logger.info('attempting send msg')
        if is_in_celery_task():
            logger.info('sending msg from celery task')
            publish_message_to_broker({
                'type': 'user.message',
                'data': payload,
            }, get_user_group_name(user_id))
        else:
            channel_layer = get_channel_layer()
            # Without any channel layer, there is no point in trying to send a
            # message.
            if not channel_layer:
                return
            logger.info('sending msg')
            async_to_sync(channel_layer.group_send)(get_user_group_name(user_id), {
                'type': 'user.message',
                'data': payload,
            })
    except KeyError as e:
        if ignore_missing:
            pass
        else:
            raise e


def publish_message_to_broker(message, routing_key):
    """Put a message into a rabbitmq broker, as suggested here:
    https://github.com/CJWorkbench/channels_rabbitmq/issues/37
    """
    with current_app.producer_pool.acquire(block=True) as producer:
        # The channel layer needs to read an __asgi_group__ member.
        # Otherwise it will be ignored by the channels-rabbitmq
        message.update({"__asgi_group__":  routing_key})

        # `retry=False` because channels has at-most-once delivery semantics.
        # `content_encoding='binary'` because msgpack-ed message will be raw bytes.
        producer.publish(
            msgpack.packb(message),
            exchange="groups",
            content_encoding='binary',
            routing_key=routing_key,
            retry=False,
        )
