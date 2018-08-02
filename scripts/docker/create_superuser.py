# -*- coding: utf-8 -*-
# This file is expected to have an empty new line at the end so that it can be
# easily piped into a python interpreter.

from django.contrib.auth.models import User

if User.objects.filter(is_superuser=True).count() == 0:
    print('Creating super user \'admin\'')
    User.objects.create_superuser('admin', 'admin@example.com', 'admin')
else:
    print('Super user already exists')
