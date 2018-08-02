# -*- coding: utf-8 -*-

from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command

from catmaid.models import *
from catmaid.fields import *

class Command(BaseCommand):
    help = "Create 3 example projects in CATMAID, if they don't already exist"

    def add_arguments(self, parser):
        parser.add_argument('--user', dest='user_id', required=True,
                help='The ID of the user to own the example projects')

    def handle(self, *args, **options):

        if not options['user_id']:
            raise CommandError("You must specify a user ID with --user")

        user = User.objects.get(pk=options['user_id'])

        projects = {'Default Project': {'stacks': []},
                    'Evaluation data set': {'stacks': []},
                    'Focussed Ion Beam (FIB)': {'stacks': []}}

        # Define the details of a stack for two of these projects:

        projects['Default Project']['stacks'].append({
            'title': 'Original data.',
            'dimension': Integer3D(4096,4096,16),
            'resolution': Double3D(3.2614000000000001,3.2614000000000001,60),
            'comment': '''<p>&copy;2007 by Stephan Saalfeld.</p>
<p>Rendered with <a href="http://www.povray.org/">POV-Ray&nbsp;v3.6</a>
using this <a href="http://fly.mpi-cbg.de/~saalfeld/download/volume.tar.bz2">scene-file</a>.</p>''',
            'mirrors': [{
                'title': 'Public copy',
                'image_base': 'http://fly.mpi-cbg.de/map/evaluation/original/',
            }]})

        projects['Focussed Ion Beam (FIB)']['stacks'].append({
            'title': 'Focussed Ion Beam (FIB) stack of Rat Striatum',
            'dimension': Integer3D(2048,1536,460),
            'resolution': Double3D(5,5,9),
            'comment': '''
<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham Knott</a>.</p>
<p>Public INCF data set available at the
<a href="http://www.incf.org/about/nodes/switzerland/data">Swiss INCF Node</a>.</p>''',
            'mirrors': [{
                'title': 'FIB Public copy',
                'image_base': 'http://incf.ini.uzh.ch/image-stack-fib/',
             }]})

        # Make sure that each project and its stacks exist, and are
        # linked via ProjectStack:

        for project_title in projects:
            project_object, _ = Project.objects.get_or_create(
                title=project_title)
            for stack_dict in projects[project_title]['stacks']:
                stack, _ = Stack.objects.get_or_create(
                    title=stack_dict['title'],
                    defaults={
                       'dimension': stack_dict['dimension'],
                       'resolution': stack_dict['resolution'],
                    })
                mirrors = list(StackMirror.objects.filter(stack=stack))
                if not mirrors:
                    for m in stack_dict['mirrors']:
                        mirrors.append(StackMirror.objects.create(stack=stack,
                                title=m['title'], image_base=m['image_base']))
                ProjectStack.objects.get_or_create(
                    project=project_object,
                    stack=stack)
            projects[project_title]['project_object'] = project_object

        # Also set up the FIB project for tracing with treelines:

        tracing_project = projects['Focussed Ion Beam (FIB)']['project_object']

        call_command('catmaid_setup_tracing_for_project',
                     '--project_id', str(tracing_project.id),
                     '--user', str(user.id))
