# -*- coding: utf-8 -*-

import os

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from catmaid.control.similarity import install_dependencies


class Command(BaseCommand):
    help = 'Set up the required R dependencies for NBLAST support'

    def handle(self, *args, **options):
        if hasattr(settings, 'R_LIBS_USER'):
            if not os.path.exists(settings.R_LIBS_USER):
                raise CommandError(f'The path defined by R_LIBS_USER in ' + \
                        'settings.py ({settings.R_LIBS_USER}) does not exist.')
            if not os.access(settings.R_LIBS_USER, os.W_OK):
                raise CommandError(f'The path defined by R_LIBS_USER in ' + \
                        f'settings.py ({settings.R_LIBS_USER}) is not writable.')
            install_dependencies()
        else:
            raise CommandError('Please define the R_LIBS_USER setting in ' + \
                    'settings.py and set it to a path writable and readable ' + \
                    'by the user running CATMAID and the user running this command.')
