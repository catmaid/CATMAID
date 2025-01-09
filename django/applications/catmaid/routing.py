from django.urls import re_path

from catmaid.consumers import UpdateConsumer


websocket_urlpatterns = [
    re_path(r'^channels/updates/$', UpdateConsumer.as_asgi()),
]
