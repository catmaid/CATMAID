# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.core.management.base import BaseCommand, CommandError

from catmaid.models import *
from catmaid.control.tracing import setup_tracing

class Command(BaseCommand):
    help = 'Set up the required database entries for tracing in a project'

    def add_arguments(self, parser):
        parser.add_argument('--project_id', dest='project_id', required=True,
                help='The ID of the project to setup tracing for')
        parser.add_argument('--user', dest='user_id', required=True,
                help='The ID of the user who will own the relations and classes')

    def handle(self, *args, **options):
        user = User.objects.get(pk=options['user_id'])
        # Set up tracing for the requested project
        setup_tracing(options['project_id'], user)
