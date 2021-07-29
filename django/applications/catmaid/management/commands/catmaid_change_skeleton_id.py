import os
import catmaid

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from catmaid.models import ClassInstance
from catmaid.control.skeleton import update_skeleton_id


class Command(BaseCommand):
    help = 'Change the ID of a skeleton, optionally also the neuron ID'

    def add_arguments(self, parser):
        parser.add_argument('--project-id', dest='project_id', required=True,
            type=int, help='The to work in'),
        parser.add_argument('--skeleton-id', dest='skeleton_id', required=True,
            type=int, help='The ID of the skeleton to change'),
        parser.add_argument('--new-skeleton-id', dest='new_skeleton_id', required=True,
            type=int, help='The new ID of the skeleton to change'),
        parser.add_argument('--new-neuron-id', dest='new_neuron_id', required=False,
            type=int, default=None, help='The new neuron ID of the skeleton to change'),

    @transaction.atomic
    def handle(self, *args, **options):
        update_skeleton_id(options['project_id'], options['skeleton_id'],
                options['new_skeleton_id'], options['new_neuron_id'],
                add_history_log_entry=True)
        self.stdout.write('Updated skeleton ID')
