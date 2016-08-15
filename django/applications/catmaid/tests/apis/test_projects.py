import json

from guardian.shortcuts import assign_perm
from guardian.utils import get_anonymous_user

from catmaid.models import Project, User

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
