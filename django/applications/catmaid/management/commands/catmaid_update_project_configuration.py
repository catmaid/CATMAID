# -*- coding: utf-8 -*-

from django.core.management.base import BaseCommand, CommandError

from catmaid.models import Project, User
from catmaid.control.project import validate_project_setup
from catmaid.apps import get_system_user

import logging
logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Set up the required database entries for a project'
    requires_system_checks = False

    def add_arguments(self, parser):
        parser.add_argument('--project_id', dest='project_id', required=False,
                help='Optional ID of an individual project to update')
        parser.add_argument('--user', dest='user_id', required=False,
                help='Optional ID of the user who will own the relations and classes')

    def handle(self, *args, **options):
        if options['user_id'] is None:
            user = get_system_user(User)
        else:
            user = User.objects.get(pk=options['user_id'])

        if options['project_id'] is None:
            projects = Project.objects.all()
        else:
            projects = Project.objects.filter(pk=options['projects_id'])

        for p in projects:
            try:
                validate_project_setup(p.id, user.id, True)
                logger.info("Validated project {} (ID: {})".format(p, p.id))
            except Exception as e:
                logger.error("Could not validate project setup of project " +
                        "{} (ID: {}): {}".format(p, p.id, e))
