# -*- coding: utf-8 -*-
import json
import logging
from typing import List
from argparse import FileType
from sys import stdin

from django.core.management.base import BaseCommand, CommandError

from catmaid.apps import get_system_user
from catmaid.models import Project, Stack, User, Group
from catmaid.control.importer import import_projects, PreProject
from catmaid.util import str2bool


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Import projects and stacks into this CATMAID instance. The source " \
            "can either be a file or stdin, with stdin being the default. The " \
            "expected " "format is the JSON format exported by the " \
            "/projects/export endpoint."

    def add_arguments(self, parser):
        parser.add_argument('--project-id', dest='project_id', default=None,
                required=False, help='The ID of the target project')
        parser.add_argument('--ignore-same-name-projects', type=str2bool,
                nargs='?', const=True, dest='ignore_same_name_projects', default=True,
                required=False, help='Whether to ignore projects that have the '
                'same name as an existing project')
        parser.add_argument('--ignore-same-name-stacks', type=str2bool,
                nargs='?', const=True, dest='ignore_same_name_stacks', default=True,
                required=False, help='Whether to ignore stacks that have the '
                'same name as an existing stack')
        parser.add_argument('--ignore-empty-projects', type=str2bool,
                nargs='?', const=True, dest='ignore_empty_projects', default=True,
                required=False, help='Whether to ignore projects without any stacks')
        parser.add_argument('--input', nargs='?', type=FileType('r'),
                            default=stdin, dest='input', help='The path to the '
                            'project JSON file to import. Otherwise, expects '
                            'data on stdin.')
        parser.add_argument('--default-tile-width', dest='default_tile_width',
                default=512, required=False, help='The tile width to assume '
                'when none is provided.')
        parser.add_argument('--default-tile-height', dest='default_tile_height',
                default=512, required=False, help='The tile height to assume '
                'when none is provided.')
        parser.add_argument('--default-tile-source-type', dest='default_tile_source_type',
                default=1, required=False, help='The tile source type to assume '
                'when none is provided.')
        parser.add_argument('--remove-unreferenced-stack-data', dest='remove_unref_stack_data',
                default=False, required=False, type=str2bool, nargs='?',
                const=True, help='If true, all stacks that are not referenced '
                'in stack groups, annotations or project links, will be removed.')
        parser.add_argument('--image-base', dest='image_base',
                default="", required=False, help='The absolute url of the '
                'image base for imported stack that only provide information '
                'a relative path. Not needed with absolute URLs.')
        parser.add_argument('--permission', dest='permissions',
                default="", required=False, nargs='*', help='A combination of '
                'username or group name and permission that should be set, e.g.: '
                'user:AnonymousUser:can_browse to let the anonymous user read the '
                'added projects and group:users:can_annotate to let all members '
                'of group "users" write.')

    def handle(self, *args, **options):
        ignore_same_name_projects = options['ignore_same_name_projects']
        ignore_same_name_stacks = options['ignore_same_name_stacks']
        ignore_empty_projects = options['ignore_empty_projects']
        project_id = options['project_id']
        default_tile_width = options['default_tile_width']
        default_tile_height = options['default_tile_height']
        default_tile_source_type = options['default_tile_source_type']
        remove_unref_stack_data = options['remove_unref_stack_data']
        image_base = options['image_base']

        if ignore_same_name_projects:
            logger.info("Ignoring all loaded projects that have same name as "
                    "existing projects")

        if ignore_same_name_stacks:
            logger.info("Ignoring all loaded stacks that have same name as "
                    "existing stacks")

        # Parse permissions
        permissions:List = []
        for p in map(lambda x: x.split(':'), options['permissions']):
            if len(p) != 3:
                raise CommandError('Invalid permission format, expected: type:name:permission')
            p_type, obj_name, p_name = p[0].lower(), p[1], p[2]

            if p_type == 'user':
                target = User.objects.get(username=obj_name)
            elif p_type == 'group':
                target = Group.objects.get(groupname=obj_name)
            else:
                raise CommandError(f'Unknown permission target type: {p_type}')

            logger.info(f'Setting {p_name} permissions for {p_type} {obj_name}')
            permissions.append((target, p_name))

        # This will read from either stdin or a provided text file
        if options['input'].isatty():
            raise CommandError('Please provide either the --input argument '
                    'with a file path or provide data on stdin.')
        input_data = options['input'].read()
        options['input'].close()

        project_configs = json.loads(input_data)

        pre_projects:List = []
        for project_config in project_configs:
            title = project_config['project']['title']
            if ignore_same_name_projects and \
                    Project.objects.filter(title=title).count() > 0:
                logger.info(f"Skipping project {title}, a project with the same name exists alrady")
                continue
            logger.info(f"Parsing project {title}")
            pre_project = PreProject(project_config, image_base, None)
            stacks_to_remove = []
            for pre_stack in pre_project.stacks:
                if Stack.objects.filter(title=pre_stack.title).count() > 0:
                    stacks_to_remove.append(pre_stack)
            if stacks_to_remove:
                stack_titles = ', '.join(map(lambda x: x.title, stacks_to_remove))
                logger.info(f"Skipping stacks {stack_titles} in project {title}, "
                        "because stacks with these names exist alrady")
                for stack_to_remove in stacks_to_remove:
                    pre_project.stacks.remove(stack_to_remove)


            if ignore_empty_projects and not pre_project.stacks:
                logger.info(f"Skipping project {title}, because it has no stacks")
                continue

            pre_projects.append(pre_project)

        tags:List = []
        cls_graph_ids_to_link:List = []
        user = get_system_user()

        logger.info(f'Importing {len(pre_projects)} projects')
        imported, not_imported = import_projects(user,
            pre_projects, tags, permissions, default_tile_width,
            default_tile_height, default_tile_source_type,
            cls_graph_ids_to_link, remove_unref_stack_data)
        logger.info(f'Imported {len(imported)} projects')

        if not_imported:
            logger.info("Encountered the following problems during import:\n" +
                    '\n'.join(map(lambda x: f'{x[0]}: {x[1]}', not_imported)))
