from django.conf.urls import url

from catmaid.consumers import UpdateConsumer


websocket_urlpatterns = [
    url(r'^channels/updates/$', UpdateConsumer.as_asgi()),
]
