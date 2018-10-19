# -*- coding: utf-8 -*-
import getpass
import logging

from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Get an API token for a given user."

    def add_arguments(self, parser):
        parser.add_argument(
            'username', default=None, nargs='?', const=None,
            help='Username of existing account to get API token for. If not given, user will be given prompt.'
        )
        parser.add_argument(
            '--password', '-p', nargs='?', default=None, const=None,
            help='Password of existing account to get API token for. If not given, user will be given secure prompt.'
        )

    def handle(self, *args, **options):
        # full names for user input functions needed for mocking in unit tests
        username = options.get('username') or input('Enter CATMAID username: ')
        password = options.get('password') or getpass.getpass('Enter CATMAID password: ')

        user = authenticate(username=username, password=password)

        if user is None:
            raise CommandError('Incorrect credentials.')
        if not user.is_active:
            raise CommandError('User account is disabled.')

        token, created = Token.objects.get_or_create(user=user)

        message = '{} API token for user {}\n\tToken {}'.format(
            'Created new' if created else 'Got existing', username, token.key
        )
        self.stdout.write(self.style.SUCCESS(message))
