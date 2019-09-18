from django.core.management.base import BaseCommand, CommandError

from catmaid.models import Stack, BrokenSlice
from catmaid.control.tracing import setup_tracing

class Command(BaseCommand):
    help = 'Reset the canary tile location of all stacks or a specific ' \
            'one to the first available tile after its broken sections.'

    def add_arguments(self, parser):
        parser.add_argument('--stack', dest='stack_id', required=False,
                default=None, help='The ID of the stack to reset the canaray location for')

    def handle(self, *args, **options):
        # Set up tracing for the requested project
        stack_id = options['stack_id']
        stacks = Stack.objects.all()
        if stack_id:
            stacks = stacks.filter(id=stack_id)
            if not stacks.count():
                raise ValueError("Could not find stack " + stack_id)
        for s in stacks:
            broken_sections = BrokenSlice.objects.filter(stack=s).order_by('index')
            if len(broken_sections) > 0 and broken_sections[0].index == 0:
                first_valid_index = 0
                while len(broken_sections) > first_valid_index and \
                        broken_sections[first_valid_index].index == first_valid_index:
                    first_valid_index += 1
                location = (0, 0, first_valid_index)
            else:
                location = (0, 0, 0)
            s.canary_location = location
            print(f"Canary location of stack {s.id}: {s.canary_location}")
            s.save()
