# -*- coding: utf-8 -*-
# This file is expected to have an empty new line at the end so that it can be
# easily piped into a python interpreter.

import logging
import os

from django.contrib.auth.models import User


logger = logging.getLogger(__name__)

admin_user = os.environ.get('CM_INITIAL_ADMIN_USER', 'admin')
admin_pass = os.environ.get('CM_INITIAL_ADMIN_PASS', 'admin')
admin_email = os.environ.get('CM_INITIAL_ADMIN_EMAIL', 'admin@localhost.local')
admin_first_name = os.environ.get('CM_INITIAL_ADMIN_FIRST_NAME', 'Super')
admin_last_name = os.environ.get('CM_INITIAL_ADMIN_LAST_NAME', 'User')

if User.objects.filter(is_superuser=True).count() == 0:
    logger.info('Creating super user "{}"'.format(admin_user))
    User.objects.create_superuser(admin_user, admin_email, admin_pass,
            first_name=admin_first_name, last_name=admin_last_name)
else:
    logger.info('Super user already exists')
