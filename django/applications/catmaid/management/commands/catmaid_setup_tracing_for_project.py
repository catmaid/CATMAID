# -*- coding: utf-8 -*-

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from catmaid.models import *
from catmaid.control.tracing import setup_tracing

import logging
logger = logging.getLogger(__name__)
from .common import set_log_level


class Command(BaseCommand):
    help = 'Set up the required database entries for tracing in a project'

    def add_arguments(self, parser):
        parser.add_argument('--project_id', dest='project_id', required=True,
                help='The ID of the project to setup tracing for')
        parser.add_argument('--user', dest='user_id', required=False, default=None,
                help='The ID of the user who will own the relations and classes')

    def handle(self, *args, **options):
        set_log_level(logger, options.get('verbosity', 1))
        user = None
        user_id = pk=options['user_id']
        if user_id is not None:
            user = User.objects.get(pk=user_id)

        if not user:
            from catmaid.apps import get_system_user
            user = get_system_user()
            logger.info(f"Using system user account {user} (ID: {user.id})")

        # Set up tracing for the requested project
        setup_tracing(options['project_id'], user)
