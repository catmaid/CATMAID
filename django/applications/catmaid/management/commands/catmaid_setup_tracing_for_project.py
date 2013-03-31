from django.core.management.base import NoArgsCommand, CommandError
from optparse import make_option

from catmaid.models import *

class Command(NoArgsCommand):
    help = 'Set up the required database entries for tracing in a project'

    option_list = NoArgsCommand.option_list + (
        make_option('--project', dest='project_id', help='The ID of the project to setup tracing for'),
        make_option('--user', dest='user_id', help='The ID of the user who will own the relations and classes'),
        )

    def handle_noargs(self, **options):

        if not (options['project_id'] and options['user_id']):
            raise CommandError("You must specify both --project and --user")

        project = Project.objects.get(pk=options['project_id'])
        user = User.objects.get(pk=options['user_id'])

        # Create the classes first:

        class_dictionary = {}

        for required_class in ("assembly",
                               "skeleton",
                               "neuron",
                               "group",
                               "label",
                               "root"):
            class_object, _ = Class.objects.get_or_create(
                class_name=required_class,
                project=project,
                defaults={'user': user})
            class_dictionary[required_class] = class_object

        # Make sure that a root node exists:

        ClassInstance.objects.get_or_create(
            class_column=class_dictionary['root'],
            project=project,
            defaults={'user': user,
                      'name': 'neuropile'})

        # Now also create the relations:

        for relation_required in ("labeled_as",
                                  "postsynaptic_to",
                                  "presynaptic_to",
                                  "element_of",
                                  "model_of",
                                  "part_of",
                                  "is_a"):
            Relation.objects.get_or_create(
                relation_name=relation_required,
                project=project,
                defaults={'user': user})
