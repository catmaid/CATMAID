from channels.routing import route
from catmaid.consumers import ws_update_connect, ws_update_message, ws_update_disconnect


channel_routing = [
    route('websocket.connect', ws_update_connect, path=r'^/updates/$'),
    route("websocket.receive", ws_update_message, path=r"^/updates/$"),
    route('websocket.disconnect', ws_update_disconnect, path=r'^/updates/$'),
]
