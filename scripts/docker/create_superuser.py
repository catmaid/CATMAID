# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib.auth.models import User

if User.objects.all().count() == 0:
    User.objects.create_superuser('admin', 'admin@example.com', 'admin')
