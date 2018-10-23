# -*- coding: utf-8 -*-
import os

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from catmaid.control.similarity import install_dependencies


class Command(BaseCommand):
    help = 'Set up the required R dependencies for NBLAST support'

    def handle(self, *args, **options):
        if hasattr(settings, 'R_USER_LIBS'):
            if not os.path.exists(settings.R_USER_LIBS):
                raise CommandError('The path defined by R_USER_LIBS in '
                        'settings.py ({}) does not exist.'.format(settings.R_USER_LIBS))
            if not os.access(settings.R_USER_LIBS, os.W_OK):
                raise CommandError('The path defined by R_USER_LIBS in '
                        'settings.py ({}) is not writable.'.format(settings.R_USER_LIBS))
            install_dependencies()
        else:
            raise CommandError('Please define the R_USER_LIBS setting in '
                    'settings.py and set it to a path writable and readable '
                    'by the user running CATMAID and the user running this command.')

