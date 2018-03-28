# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.core.management.base import BaseCommand, CommandError

from catmaid.control.project import insert_example_projects
from catmaid.models import User

class Command(BaseCommand):
    help = "Create 3 example projects in CATMAID, if they don't already exist"

    def add_arguments(self, parser):
        parser.add_argument('--user', dest='user_id', required=True,
                help='The ID of the user to own the example projects')

    def handle(self, *args, **options):

        if not options['user_id']:
            raise CommandError("You must specify a user ID with --user")

        user = User.objects.get(pk=options['user_id'])
        insert_example_projects(user.id)
