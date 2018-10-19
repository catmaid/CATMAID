# -*- coding: utf-8 -*-

import os
import catmaid

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from catmaid.models import Project
from catmaid.control.edge import rebuild_edge_tables


class DryRunRollback(Exception):
    pass

class Command(BaseCommand):
    help = 'Rebuild all edge tables for all skeletons and connectors in the ' \
           'specified projects. No skeleton optimization will be done.'

    def add_arguments(self, parser):
        parser.add_argument('--dryrun', action='store_true', dest='dryrun',
            default=False, help='Don\'t actually apply changes')
        parser.add_argument('--project_id', dest='project_id', nargs='+',
            help='Rebuild edge tables for these projects')

    @transaction.atomic
    def handle(self, *args, **options):
        project_ids = options['project_id']
        if not project_ids:
            self.stdout.write('Since no project IDs were given, all projects will be updated')

        # Check arguments
        dryrun = options['dryrun']

        if dryrun:
            self.stdout.write('DRY RUN - no changes will be made')
        else:
            self.stdout.write('This will make changes to the database')

        run = input('Continue? [y/N]: ')
        if run not in ('Y', 'y'):
            self.stdout.write('Canceled on user request')
            return

        try:

            rebuild_edge_tables(project_ids, log=lambda msg: self.stdout.write(msg))

            if dryrun:
                # For a dry run, cancel the transaction by raising an exception
                raise DryRunRollback()

            self.stdout.write('Successfully rebuilt edge tables')

        except DryRunRollback:
            self.stdout.write('Dry run completed')
