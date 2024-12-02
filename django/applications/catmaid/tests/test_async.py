import pytest
from django.test import AsyncClient, TestCase, override_settings
from channels.testing import WebsocketCommunicator
from channels.auth import get_user, login, logout
from channels.db import database_sync_to_async
from catmaid.consumers import UpdateConsumer
from catmaid.models import User
from .common import CatmaidTestCase, CatmaidTransactionTestCase
import functools
from asgiref.sync import sync_to_async


@database_sync_to_async
def get_catmaid_user(username):
    try:
        return User.objects.get(username=username)
    except User.DoesNotExist:
        return User.objects.get(username='AnonymousUser')


class AuthWebsocketCommunicator(WebsocketCommunicator):
    def __init__(self, application, path, user, *args, **kwargs):
        super().__init__(self._asgi_with_user(application, user), path,
                         *args, **kwargs)

    @classmethod
    def _asgi_with_user(cls, asgi_app, user):
        """
        Update the scope of an ASGI app such that a particular user
        is already assumed to have been authenticated.
        """
        async def app(scope, receive, send):
            scope['user'] = user
            return await asgi_app(scope, receive, send)
        functools.update_wrapper(app, asgi_app)
        return app


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class TestWebsockets(CatmaidTransactionTestCase):

    async def test_basic_connection(self):
        client = AsyncClient()
        user = await get_catmaid_user('temporary')

        headers = [(b'origin', b'http://localhost:80')] # Bypass AllowedHostsOriginValidator
        communicator = AuthWebsocketCommunicator(UpdateConsumer.as_asgi(),
                                                 '/channels/updates', user,
                                                 headers=headers)

        #communicator = WebsocketCommunicator(UpdateConsumer.as_asgi(), "GET", "/channels/updates")
        #communicator.instance.scope["user"] = await get_user(username='temporary')
        connected, subprotocol = await communicator.connect()
        assert connected

        await communicator.disconnect()
