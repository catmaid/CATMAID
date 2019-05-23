# -*- coding: utf-8 -*-

from ast import literal_eval
import json
from typing import List
import yaml

from guardian.shortcuts import assign_perm
from guardian.utils import get_anonymous_user

from catmaid.control import project
from catmaid.models import (Class, ClassInstance, Project, Stack, User,
        Relation, StackClassInstance, StackGroup, StackStackGroup, StackMirror)

from .common import CatmaidApiTestCase


class ProjectsApiTests(CatmaidApiTestCase):
    def test_project_list(self):
        # Check that, pre-authentication, we can see none of the
        # projects:
        response = self.client.get('/projects/')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(result), 0)

        # Add permission to the anonymous user to browse two projects
        anon_user = get_anonymous_user()
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', anon_user, p)

        # Check that, pre-authentication, we can see two of the
        # projects:
        response = self.client.get('/projects/')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content.decode('utf-8'))
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
        result = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(result), 4)

        def get_project(result, pid):
            rl = [r for r in result if r['id'] == pid]
            if len(rl) != 1:
                raise ValueError("Malformed result")
            return rl[0]

        # Check the first project:
        p1 = get_project(result, 1)
        self.assertEqual(len(p1['stacks']), 1)
        self.assertEqual(len(p1['stackgroups']), 0)

        # Check the second project
        p3 = get_project(result, 3)
        self.assertEqual(len(p3['stacks']), 1)
        self.assertEqual(len(p3['stackgroups']), 0)

        # Check the third project:
        p5= get_project(result, 5)
        self.assertEqual(len(p5['stacks']), 2)
        self.assertEqual(len(p5['stackgroups']), 1)

    def test_project_export(self):
        """Test projects/export endpoint, which returns a YAML format which can
        also be understood by the importer.
        """
        # Check that, pre-authentication, we can see none of the
        # projects:
        response = self.client.get('/projects/export')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(result), 0)

        # Now log in and check that we see a different set of projects:
        self.fake_authentication()

        # Add permission to the test user to browse three projects
        test_user = User.objects.get(pk=self.test_user_id)
        valid_project_ids = (1,2,3,5)
        for pid in valid_project_ids:
            p = Project.objects.get(pk=pid)
            assign_perm('can_browse', test_user, p)

        visible_projects = project.get_project_qs_for_user(test_user)

        response = self.client.get('/projects/export')
        self.assertEqual(response.status_code, 200)
        result = yaml.load(response.content.decode('utf-8'), Loader=yaml.FullLoader)

        # Expect a returned list with four projects
        self.assertEqual(len(result), 4)

        seen_projects = [] # type: List
        for exported_project in result:
            data = exported_project['project']
            pid = data['id']
            self.assertTrue(pid in valid_project_ids)
            self.assertFalse(pid in seen_projects)
            seen_projects.append(pid)

            p = Project.objects.get(id=pid)
            self.assertEqual(p.title, data['title'])

            stacks = p.stacks.all()
            valid_stack_ids = [s.id for s in stacks]

            stackgroup_links = StackStackGroup.objects.filter(stack__in=stacks)
            valid_stackgroup_ids = [sgl.stack_group_id for sgl in stackgroup_links]

            seen_stacks = [] # type: List
            seen_stackgroups = [] # type: List
            for s in data.get('stacks', []):
                stack_id = s['id']
                self.assertIn(stack_id, valid_stack_ids)
                self.assertNotIn(stack_id, seen_stacks)
                seen_stacks.append(stack_id)

                # Compare stacks
                stack = Stack.objects.get(id=stack_id)
                self.assertEqual(stack.title, s['title'])
                self.assertEqual(literal_eval(str(stack.dimension)),
                        literal_eval(s['dimension']))
                self.assertEqual(literal_eval(str(stack.resolution)),
                        literal_eval(s['resolution']))
                self.assertEqual(stack.downsample_factors, s['downsample_factors'])
                self.assertEqual(stack.metadata, s['metadata'])
                self.assertEqual(stack.comment, s['comment'])
                self.assertEqual(stack.attribution, s['attribution'])
                self.assertEqual(stack.description, s['description'])
                self.assertEqual(literal_eval(str(stack.canary_location)),
                        literal_eval(s['canary_location']))
                self.assertEqual(literal_eval(str(stack.placeholder_color)),
                        literal_eval(s['placeholder_color']))

                # Get all stack mirrors for this stack
                stack_mirrors = StackMirror.objects.filter(stack_id=stack_id).order_by('position')
                self.assertEqual(len(stack_mirrors), len(s['mirrors']))

                # Expect exported stack mirros to be ordered by position
                for sm, sm_export in zip(stack_mirrors, s['mirrors']):
                    # Compare stack mirrors
                    self.assertEqual(sm.image_base, sm_export['url'])
                    self.assertEqual(sm.tile_width, sm_export['tile_width'])
                    self.assertEqual(sm.tile_height, sm_export['tile_height'])
                    self.assertEqual(sm.tile_source_type, sm_export['tile_source_type'])
                    self.assertEqual(sm.file_extension, sm_export['fileextension'])

                for sge in s.get('stackgroups', []):
                    sg_id = sge['id']
                    self.assertIn(sg_id, valid_stackgroup_ids)
                    self.assertNotIn(sg_id, seen_stackgroups)
                    seen_stackgroups.append(sg_id)

                    sg = StackGroup.objects.get(id=sg_id)
                    sg_link = StackStackGroup.objects.get(
                        stack=stack, stack_group=sg)
                    self.assertEqual(sg.title, sge['title'])
                    self.assertEqual(sg_link.group_relation.name, sge['relation'])

                # Make sure we have seen all relevant stack groups
                self.assertCountEqual(valid_stackgroup_ids, seen_stackgroups)

            # Make sure we have seen all relevant stacks
            self.assertCountEqual(valid_stack_ids, seen_stacks)

        self.assertCountEqual(valid_project_ids, seen_projects)
