from ast import literal_eval

from django.test import TestCase
from django.test.client import Client

from catmaid.control import importer
from catmaid.control.common import urljoin
from catmaid.models import (Class, ClassInstance, Project, ProjectStack,
        Relation, Stack, StackClassInstance, StackGroup, User)


class ImportExportTests(TestCase):
    """Test CATMAID's import and export functionality.
    """
    #fixtures = ['catmaid_project_stack_data']

    def setUp(self):
        # We need a super user during import
        self.username = "test2"
        self.password = "test"
        self.user = User.objects.create(username=self.username, is_superuser=True)
        self.test_project_id = 3

        self.client = Client()
        self.client.login(username=self.username, password=self.password)

        super(ImportExportTests, self).setUp();

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
                'name': 'test-no-stacks',
            }
        }

        p2_config = {
            'project': {
                'name': 'test-two-stacks',
                'stacks': [
                    {
                        # A basic stack, only with required information
                        'name': 'test-stack-1',
                        'dimension': '(7, 17, 23)',
                        'resolution': '(2, 3, 5)',
                        'zoomlevels': -1,
                        'fileextension': 'jpg'
                    },
                    {
                        # A basic stack with a little more information
                        'name': 'test-stack-1',
                        'dimension': '(7, 17, 23)',
                        'resolution': '(2, 3, 5)',
                        'zoomlevels': -1,
                        'fileextension': 'jpg',
                        'url': 'https://this.is.my.stack/'
                    },
                    {
                        # A stack with all optional properties
                        'name': 'test-stack-2',
                        'dimension': '(4, 34, 9)',
                        'resolution': '(1, 2, 3)',
                        'folder': 'abc/',
                        'metadata': 'Test meta data',
                        'zoomlevels': -1,
                        'fileextension': 'jpg',
                        'tile_width': 123,
                        'tile_height': 456,
                        'tile_source_type': 2,
                        'translation': '(10, 20, 30)',
                        'stackgroups': [{
                            # Add a single stack group with only this stack
                            # in it.
                            'name': 'Test group 1',
                            'relation': 'has_view',
                        }],
                    }
                ]
            }
        }

        pre_projects = [
            importer.PreProject(p1_config, project_url, data_folder),
            importer.PreProject(p2_config, project_url, data_folder),
        ]

        tags = []
        permissions = []
        default_tile_width = 256
        default_tile_height = 512
        default_tile_source_type = 5
        cls_graph_ids_to_link = []
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
        self.assertEqual(p1_config['project']['name'], p1.title)
        self.assertEqual(0, p1.stacks.all().count())

        # Test p2.
        p2 = new_projects[1]
        self.assertEqual(p2_config['project']['name'], p2.title)
        p2_stacks = p2.stacks.all().order_by('title')
        self.assertEqual(3, len(p2_stacks))
        p2cfg_stacks = p2_config['project']['stacks']
        for n, p2s in enumerate(p2_stacks):
            stack = p2cfg_stacks[n]

            # Test required fields
            self.assertEqual(stack['name'], p2s.title)
            self.assertItemsEqual(literal_eval(stack['dimension']),
                    literal_eval(unicode(p2s.dimension)))
            self.assertItemsEqual(literal_eval(stack['resolution']),
                    literal_eval(unicode(p2s.resolution)))
            self.assertEqual(stack['zoomlevels'], p2s.num_zoom_levels)
            self.assertEqual(stack['fileextension'], p2s.file_extension)

            # Test fields with potential default values
            self.assertEqual(stack.get('tile_width', default_tile_width),
                    p2s.tile_width)
            self.assertEqual(stack.get('tile_height', default_tile_height),
                    p2s.tile_height)
            self.assertEqual(stack.get('tile_source_type', default_tile_source_type),
                    p2s.tile_source_type)

            if 'url' in stack:
                image_base = stack['url']
            else:
                image_base = urljoin(project_url,
                        urljoin(stack.get('path', ''), stack.get('folder', '')))

            self.assertEqual(image_base, p2s.image_base)

            # Test project-stack link
            ps = ProjectStack.objects.get(project=p2.id, stack=p2s)
            self.assertItemsEqual(literal_eval(stack.get('translation', '(0,0,0)')),
                    literal_eval(unicode(ps.translation)))

            # Test stack groups
            stack_groups = ClassInstance.objects.filter(project=p2,
                    class_column=Class.objects.get(project=p2, class_name='stackgroup'))
            for sg_cfg in stack.get('stackgroups', []):
                # Will fail if link unavailable
                stack_group_link = StackClassInstance.objects.get(stack=p2s,
                        class_instance__in=stack_groups,
                        relation=Relation.objects.get(project=p2,
                        relation_name=sg_cfg['relation']))
                self.assertEqual(sg_cfg['name'], stack_group_link.class_instance.name)
