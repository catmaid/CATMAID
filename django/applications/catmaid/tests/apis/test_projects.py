import json
import yaml

from guardian.shortcuts import assign_perm
from guardian.utils import get_anonymous_user

from catmaid.models import (Class, ClassInstance, Project, Stack, User,
        Relation, StackClassInstance)

from .common import CatmaidApiTestCase


class ProjectsApiTests(CatmaidApiTestCase):
    def test_project_list(self):
        # Check that, pre-authentication, we can see none of the
        # projects:
        response = self.client.get('/projects/')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result), 0)

        # Add permission to the anonymous user to browse two projects
        anon_user = get_anonymous_user()
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', anon_user, p)

        # Check that, pre-authentication, we can see two of the
        # projects:
        response = self.client.get('/projects/')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result), 1)

        # Check stacks:
        stacks = result[0]['stacks']
        self.assertEqual(len(stacks), 1)

        # Check stacks groups
        stackgroups = result[0]['stackgroups']
        self.assertEqual(len(stackgroups), 0)

        # Now log in and check that we see a different set of projects:
        self.fake_authentication()

        # Add permission to the test  user to browse three projects
        test_user = User.objects.get(pk=self.test_user_id)
        for pid in (1,2,3,5):
            p = Project.objects.get(pk=pid)
            assign_perm('can_browse', test_user, p)

        # We expect four projects, one of them (project 2) is empty.
        response = self.client.get('/projects/')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result), 4)

        def get_project(result, pid):
            rl = [r for r in result if r['id'] == pid]
            if len(rl) != 1:
                raise ValueError("Malformed result")
            return rl[0]

        # Check the first project:
        stacks = get_project(result, 1)['stacks']
        self.assertEqual(len(stacks), 1)

        # Check the second project:
        stacks = get_project(result, 3)['stacks']
        self.assertEqual(len(stacks), 1)

        # Check the third project:
        stacks = get_project(result, 5)['stacks']
        self.assertEqual(len(stacks), 2)

    def test_project_export(self):
        """Test projects/export endpoint, which returns a YAML format which can
        also be understood by the importer.
        """
        # Check that, pre-authentication, we can see none of the
        # projects:
        response = self.client.get('/projects/export')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result), 0)

        # Now log in and check that we see a different set of projects:
        self.fake_authentication()

        # Add permission to the test  user to browse three projects
        test_user = User.objects.get(pk=self.test_user_id)
        valid_project_ids = (1,2,3,5)
        for pid in valid_project_ids:
            p = Project.objects.get(pk=pid)
            assign_perm('can_browse', test_user, p)

        response = self.client.get('/projects/export')
        self.assertEqual(response.status_code, 200)
        result = yaml.load(response.content)

        # Expect a returned list with four projects
        self.assertEqual(len(result), 4)

        seen_projects = []
        for exported_project in result:
            data = exported_project['project']
            pid = data['id']
            self.assertTrue(pid in valid_project_ids)
            self.assertFalse(pid in seen_projects)
            seen_projects.append(pid)

            p = Project.objects.get(id=pid)
            self.assertEqual(p.title, data['name'])

            stacks = p.stacks.all()
            valid_stack_ids = [s.id for s in stacks]

            stackgroups = ClassInstance.objects.filter(project=p,
                    class_column__in=Class.objects.filter(project=p, class_name='stackgroup'))
            valid_stackgroup_ids = [sg.id for sg in stackgroups]

            seen_stacks = []
            seen_stackgroups = []
            for s in data.get('stacks', []):
                stack_id = s['id']
                self.assertIn(stack_id, valid_stack_ids)
                self.assertNotIn(stack_id, seen_stacks)
                seen_stacks.append(stack_id)

                stack = Stack.objects.get(id=stack_id)
                self.assertEqual(stack.image_base, s['url'])
                self.assertEqual(stack.metadata, s['metadata'])
                self.assertEqual(stack.num_zoom_levels, s['zoomlevels'])
                self.assertEqual(stack.file_extension, s['fileextension'])
                self.assertEqual(stack.tile_width, s['tile_width'])
                self.assertEqual(stack.tile_height, s['tile_height'])
                self.assertEqual(stack.tile_source_type, s['tile_source_type'])
                self.assertEqual(stack.comment, s['comment'])

                for sge in s.get('stackgroups', []):
                    sg_id = sge['id']
                    self.assertIn(sg_id, valid_stackgroup_ids)
                    self.assertNotIn(sg_id, seen_stackgroups)
                    seen_stackgroups.append(sg_id)

                    sg = ClassInstance.objects.get(id=sg_id)
                    sg_link = StackClassInstance.objects.get(project=p,
                        stack=stack, class_instance=sg)
                    self.assertEqual(sg.name, sge['name'])
                    self.assertEqual(sg_link.relation.relation_name, sge['relation'])

                # Make sure we have seen all relevant stack groups
                self.assertItemsEqual(valid_stackgroup_ids, seen_stackgroups)

            # Make sure we have seen all relevant stacks
            self.assertItemsEqual(valid_stack_ids, seen_stacks)

        self.assertItemsEqual(valid_project_ids, seen_projects)
