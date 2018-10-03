# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand
from catmaid.control.similarity import install_dependencies


class Command(BaseCommand):
    help = 'Set up the required R dependencies for NBLAST support'

    def handle(self, *args, **options):
        install_dependencies()

