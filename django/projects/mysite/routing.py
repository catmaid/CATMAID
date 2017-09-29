# -*- coding: utf-8 -*-
from __future__ import absolute_import

from channels.routing import include
from catmaid.routing import channel_routing as catmaid_routes


# Link connsumer functions to websockets.
channel_routing = [
    include(catmaid_routes, path='^/channels')
]
