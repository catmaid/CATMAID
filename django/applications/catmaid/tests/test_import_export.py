# -*- coding: utf-8 -*-

from ast import literal_eval
import json
from typing import List
import yaml

from guardian.shortcuts import assign_perm

from django.http import HttpResponse
from django.test import TestCase
from django.test.client import Client

from catmaid.control import importer
from catmaid.control.common import urljoin
from catmaid.models import (Class, ClassInstance, Project, ProjectStack,
        Relation, Stack, StackClassInstance, StackGroup, StackStackGroup, User)


class ImportExportTests(TestCase):
    """Test CATMAID's import and export functionality.
    """
    #fixtures = ['catmaid_project_stack_data']

    def setUp(self):
        # We need a super user during import
        self.username = "test2"
        self.password = "test"
        self.user = User.objects.create(username=self.username, is_superuser=True)
        self.user.set_password(self.password)
        self.user.save()
        self.test_project_id = 3
        self.maxDiff = None

        self.client = Client()
        self.client.login(username=self.username, password=self.password)

        super(ImportExportTests, self).setUp();

    def fake_authentication(self):
        self.client.force_login(self.user)

    def test_import_projects(self):
        """Import a set of new projects, stacks and stack groups. This tests
        only the actual import. Retrieving the data to import from different
        sources is not part of this test.
        """
        project_url = 'https://catmaid-test/'
        data_folder = '/tmp/catmaid-test/'
        existing_projects = list(Project.objects.all())
        existing_project_ids = [p.id for p in existing_projects]

        p1_config = {
            'project': {
                'title': 'test-no-stacks',
            }
        }

        p2_config = {
            'project': {
                'title': 'test-two-stacks',
                'stacks': [
                    {
                        # A basic stack, only with required information
                        'title': 'test-stack-1',
                        'dimension': '(7, 17, 23)',
                        'resolution': '(2, 3, 5)',
                        'zoomlevels': -1,
                        'mirrors': [{
                            'title': 'test-mirror-1',
                            'fileextension': 'jpg'
                        }]
                    },
                    {
                        # A basic stack with a little more information
                        'title': 'test-stack-2',
                        'dimension': '(7, 17, 23)',
                        'resolution': '(2, 3, 5)',
                        'zoomlevels': -1,
                        'mirrors': [{
                            'title': 'test-mirror-2',
                            'fileextension': 'jpg',
                            'url': 'https://this.is.my.stack/'
                        }]
                    },
                    {
                        # A stack with all optional properties
                        'title': 'test-stack-3',
                        'dimension': '(4, 34, 9)',
                        'resolution': '(1, 2, 3)',
                        'metadata': 'Test meta data',
                        'zoomlevels': -1,
                        'translation': '(10, 20, 30)',
                        'mirrors': [{
                            'title': 'test-mirror-3',
                            'folder': 'abc/',
                            'fileextension': 'jpg',
                            'tile_width': 123,
                            'tile_height': 456,
                            'tile_source_type': 2,
                        }],
                        'stackgroups': [{
                            # Add a single stack group with only this stack
                            # in it.
                            'title': 'Test group 1',
                            'relation': 'view',
                        }],
                    }
                ]
            }
        }

        pre_projects = [
            importer.PreProject(p1_config, project_url, data_folder),
            importer.PreProject(p2_config, project_url, data_folder),
        ]

        tags = [] # type: List
        permissions = [] # type: List
        default_tile_width = 256
        default_tile_height = 512
        default_tile_source_type = 5
        default_position = 0
        cls_graph_ids_to_link = [] # type: List
        remove_unref_stack_data = False

        imported, not_imported = importer.import_projects(self.user,
            pre_projects, tags, permissions, default_tile_width,
            default_tile_height, default_tile_source_type,
            cls_graph_ids_to_link, remove_unref_stack_data)

        self.assertListEqual(pre_projects, imported)
        self.assertListEqual([], not_imported)

        new_projects = list(Project.objects.exclude(id__in=existing_project_ids).order_by('title'))
        self.assertEqual(2, len(new_projects))

        # Projects should be ordered by name, so the first project will be based
        # on p1_config. Test p1 first, it is not expected to have any stacks.
        p1 = new_projects[0]
        self.assertEqual(p1_config['project']['title'], p1.title)
        self.assertEqual(0, p1.stacks.all().count())

        # Test p2.
        p2 = new_projects[1]
        self.assertEqual(p2_config['project']['title'], p2.title)
        p2_stacks = p2.stacks.all().order_by('title')
        self.assertEqual(3, len(p2_stacks))
        p2cfg_stacks = p2_config['project']['stacks']
        for n, p2s in enumerate(p2_stacks):
            stack = p2cfg_stacks[n]

            # Test required fields
            self.assertEqual(stack['title'], p2s.title)
            self.assertCountEqual(literal_eval(stack['dimension']),
                    literal_eval(str(p2s.dimension)))
            self.assertCountEqual(literal_eval(stack['resolution']),
                    literal_eval(str(p2s.resolution)))
            self.assertEqual(stack['zoomlevels'], p2s.num_zoom_levels)

            # Test mirrors
            mirrors = p2s.stackmirror_set.all().order_by('title')
            self.assertEqual(len(stack['mirrors']), len(mirrors))
            for m, omirror in enumerate(mirrors):
                mirror = stack['mirrors'][m]

                self.assertEqual(mirror['title'], omirror.title)
                self.assertEqual(mirror['fileextension'], omirror.file_extension)

                # Test fields with potential default values
                self.assertEqual(mirror.get('position', default_position),
                        omirror.position)
                self.assertEqual(mirror.get('tile_width', default_tile_width),
                        omirror.tile_width)
                self.assertEqual(mirror.get('tile_height', default_tile_height),
                        omirror.tile_height)
                self.assertEqual(mirror.get('tile_source_type', default_tile_source_type),
                        omirror.tile_source_type)

                if 'url' in mirror:
                    image_base = mirror['url']
                else:
                    image_base = urljoin(project_url,
                            urljoin(mirror.get('path', ''), mirror.get('folder', '')))

                self.assertEqual(image_base, omirror.image_base)

            # Test project-stack link
            ps = ProjectStack.objects.get(project=p2.id, stack=p2s)
            self.assertCountEqual(literal_eval(stack.get('translation', '(0,0,0)')),
                    literal_eval(str(ps.translation)))

            # Test stack groups
            ostack_group_links = StackStackGroup.objects.filter(stack=p2s).order_by('stack__title')
            stack_groups = stack.get('stackgroups', [])
            self.assertEqual(len(ostack_group_links), len(stack_groups))
            for m, sg_cfg in enumerate(stack_groups):
                ostack_group_link = ostack_group_links[m]
                ostack_group = ostack_group_link.stack_group
                self.assertEqual(sg_cfg['title'], ostack_group.title)
                self.assertEqual(sg_cfg['relation'],
                        ostack_group_link.group_relation.name)
                self.assertEqual(sg_cfg.get('position', default_position),
                        ostack_group_link.position)

    def test_import_export_projects(self):
        """Export all projects, stacks and stack groups (without class instance
        and tracing data). Make then sure, they match the fixture.
        """

        p1_config = {
            'project': {
                'title': 'test-no-stacks',
                'stacks': list(),
            }
        }

        p2_config = {
            'project': {
                'title': 'test-two-stacks',
                'stacks': [{
                    'broken_sections': [],
                    'title': 'test-stack-1',
                    'dimension': '(7, 17, 23)',
                    'resolution': '(2,3,5)',
                    'downsample_factors': None,
                    'orientation': 0,
                    'translation': '(0,0,0)',
                    'metadata': '',
                    'comment': 'Test comment',
                    'attribution': 'Test attribution',
                    'description': 'Simple test data',
                    'canary_location': '(0, 0, 0)',
                    'placeholder_color': '(0,0,0,1)',
                    'mirrors': [{
                        'title': 'test-mirror-1',
                        'url': 'https://catmaid-test/',
                        'tile_height': 512,
                        'tile_width': 256,
                        'fileextension': 'jpg',
                        'tile_source_type': 5,
                        'position': 2
                    }]
                }, {
                    'broken_sections': [],
                    'comment': None,
                    'title': 'test-stack-2',
                    'dimension': '(7, 17, 23)',
                    'metadata': '',
                    'resolution': '(2,3,5)',
                    'downsample_factors': None,
                    'orientation': 0,
                    'translation': '(0,0,0)',
                    'attribution': None,
                    'description': '',
                    'canary_location': '(0, 0, 0)',
                    'placeholder_color': '(0.5,0.4,0.3,1)',
                    'mirrors': [{
                        'title': 'test-mirror-2',
                        'position': 0,
                        'url': 'https://this.is.my.stack/',
                        'tile_height': 400,
                        'tile_width': 300,
                        'fileextension': 'jpg',
                        'tile_source_type': 5,
                    }]
                }, {
                    'broken_sections': [],
                    'comment': None,
                    'title': 'test-stack-3',
                    'dimension': '(4, 34, 9)',
                    'metadata': 'Test meta data',
                    'resolution': '(1,2,3)',
                    'downsample_factors': None,
                    'orientation': 0,
                    'translation': '(0,0,0)',
                    'attribution': None,
                    'description': '',
                    'canary_location': '(1, 2, 3)',
                    'placeholder_color': '(0,0,0.3,0.1)',
                    'mirrors': [{
                        'title': 'test-mirror-3',
                        'position': 0,
                        'url': 'https://catmaid-test/abc/',
                        'tile_height': 456,
                        'tile_width': 123,
                        'fileextension': 'jpg',
                        'tile_source_type': 2,
                    }],
                    'stackgroups': [{
                        'relation': 'view',
                        'title': u'Test group 1'
                    }],
                }]
            }
        }

        project_url = 'https://catmaid-test/'
        data_folder = '/tmp/catmaid-test/'
        pre_projects = [
            importer.PreProject(p1_config, project_url, data_folder),
            importer.PreProject(p2_config, project_url, data_folder),
        ]
        config = [p1_config, p2_config]

        tags = [] # type: List
        permissions = [] # type: List
        default_tile_width = 256
        default_tile_height = 512
        default_tile_source_type = 1
        cls_graph_ids_to_link = [] # type: List
        remove_unref_stack_data = False

        # Make sure there are no existing projects or stacks
        Project.objects.all().delete()
        Stack.objects.all().delete()

        imported, not_imported = importer.import_projects(self.user,
            pre_projects, tags, permissions, default_tile_width,
            default_tile_height, default_tile_source_type,
            cls_graph_ids_to_link, remove_unref_stack_data)

        self.assertEqual(0, len(not_imported))
        self.assertEqual(len(config), len(imported))

        # Make sure we can see all projects
        for p in Project.objects.all():
            assign_perm('can_browse', self.user, p)

        def strip_ids(d):
            """ Recursively, strip all 'id' fields of dictionaries.
            """
            if type(d) == dict:
                if 'id' in d:
                    d.pop('id')
                for _,v in d.items():
                    strip_ids(v)
            if type(d) == list:
                for v in d:
                    strip_ids(v)

        def test_result(result):
            # Results come with IDs, which we don't have in our input data. Strip
            # them to be able to simply compare dictionaries.
            strip_ids(result)

            for cp, p in zip(config, result):
                # Convert potential stack tuples into lists (YAML parsing
                # results in tuples).
                if 'project' in p:
                    if 'stacks' in p['project']:
                        if type(p['project']['stacks']) == tuple:
                            p['project']['stacks'] = list(p['project']['stacks'])
                self.assertDictEqual(cp, p)

        self.fake_authentication()

        def parse_list(d):
            for k in d:
                if type(d[k]) == tuple:
                    d[k] = list(d[k])
            return d

        # Export imported YAML data
        response = self.client.get('/projects/export')
        self.assertEqual(response.status_code, 200)
        result_yaml = yaml.load(response.content.decode('utf-8'), Loader=yaml.FullLoader)
        test_result(result_yaml)

        # Export imported JSON data
        response = self.client.get('/projects/export', HTTP_ACCEPT='application/json')
        self.assertEqual(response.status_code, 200)
        result_json = json.loads(response.content.decode('utf-8'),
                object_hook=parse_list)
        test_result(result_json)
