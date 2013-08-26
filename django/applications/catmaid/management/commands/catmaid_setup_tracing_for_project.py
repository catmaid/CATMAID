from django.core.management.base import NoArgsCommand, CommandError
from optparse import make_option

from catmaid.models import *
from catmaid.control.tracing import setup_tracing

class Command(NoArgsCommand):
    help = 'Set up the required database entries for tracing in a project'

    option_list = NoArgsCommand.option_list + (
        make_option('--project', dest='project_id', help='The ID of the project to setup tracing for'),
        make_option('--user', dest='user_id', help='The ID of the user who will own the relations and classes'),
        )

    def handle_noargs(self, **options):

        if not (options['project_id'] and options['user_id']):
            raise CommandError("You must specify both --project and --user")

        user = User.objects.get(pk=options['user_id'])
        # Set up tracing for the requested project
        setup_tracing(options['project_id'], user);
