# -*- coding: utf-8 -*-

from io import StringIO

import mock

from rest_framework.authtoken.models import Token
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from catmaid.models import Class, ClassInstance, Project, User, Treenode


class PruneSkeletonsTest(TestCase):
    """
    Test CATMAID's prune skeleton  mananagement command.
    """

    def setUp(self):
        self.username = "test"
        self.password = "test"
        self.user = User.objects.create(username=self.username,
                                        password=self.password,
                                        is_superuser=True)
        self.client = Client()
        self.client.login(username=self.username, password=self.password)

    def test_straight_line_pruning(self):
        """
        Test pruning of a straight line. Only the end nodes should remain.
        """
        # Create a new neuron and add six nodes to it
        p = TestProject(self.user)
        skid = p.create_neuron()
        root = p.create_node(0, 0, 0, None, skid)
        n1 = p.create_node(0, 0, 10, root.id, skid)
        n2 = p.create_node(0, 0, 20, root.id, skid)
        n3 = p.create_node(0, 0, 30, root.id, skid)
        n4 = p.create_node(0, 0, 40, root.id, skid)
        n5 = p.create_node(0, 0, 50, root.id, skid)

        # Call pruning for this project
        out = StringIO()
        call_command('catmaid_prune_skeletons', project_id=[p.project.id], stdout=out)
        self.assertIn('Deleted 4 nodes in project "%s"' % p.project.id, out.getvalue())


class TestProject():
    """
    Create a new project, assign brows and annotate permissions to the test
    user and create needed classes for testing pruning.
    """

    def __init__(self, user):
        self.user = user
        self.project = Project.objects.create(title="Skeleton pruning test project")
        assign_perm('can_browse', self.user, self.project)
        assign_perm('can_annotate', self.user, self.project)

        self.class_map = {
            "skeleton": self.create_class("skeleton")
        }

    def create_class(self, name):
        return Class.objects.create(class_name="skeleton", user=self.user,
                project=self.project, description="")

    def create_neuron(self):
            return ClassInstance.objects.create(user=self.user, name="A skeleton",
                project=self.project, class_column=self.class_map["skeleton"])

    def create_node(self, x, y, z, parent_id, skeleton_id):
        return Treenode.objects.create(location_x=x, location_y=y, location_z=z,
                project=self.project, user=self.user, editor=self.user,
                parent_id=parent_id, radius=-1, skeleton=skeleton_id)


class GetTokenTest(TestCase):
    def setUp(self):
        self.command_name = 'catmaid_get_auth_token'

        self.username = 'real_username'
        self.password = 'real_password'
        self.user = User.objects.create(
            username=self.username, password=self.password, is_superuser=True
        )
        self.user.save()
        self.client = Client()
        success = self.client.login(username=self.username, password=self.password)
        self.assertTrue(success)

    def attempt_command(self, *args):
        out = StringIO()
        call_command(self.command_name, *args, stdout=out)
        return out.getvalue()

    def test_new_token_success(self):
        output = self.attempt_command(self.username, '--password', self.password)

        self.assertIn('Created new', output)

    def test_new_token_success_short(self):
        output = self.attempt_command(self.username, '-p', self.password)

        self.assertIn('Created new', output)

    def test_user_input_password(self):
        with mock.patch('getpass.getpass') as mock_getpass:
            mock_getpass.return_value = self.password
            output = self.attempt_command(self.username)
            self.assertIn('Created new', output)

    def test_user_input_username(self):
        with mock.patch('input') as mock_input:
            mock_input.return_value = self.username
            output = self.attempt_command('--password', self.password)
            self.assertIn('Created new', output)

    def test_user_input_username_password(self):
        with mock.patch('input') as mock_input, mock.patch('getpass.getpass') as mock_getpass:
            mock_input.return_value = self.username
            mock_getpass.return_value = self.password
            output = self.attempt_command()
            self.assertIn('Created new', output)

    def test_existing_token_success(self):
        token, created = Token.objects.get_or_create(user=self.user)
        self.assertTrue(created)

        output = self.attempt_command(self.username, '--password', self.password)
        self.assertIn(token, output)

    def test_bad_credentials(self):
        with self.assertRaisesMessage(CommandError, 'Incorrect credentials'):
            self.attempt_command('not_a_username', '--password', 'not_a_password')

    def test_inactive_user(self):
        self.user.is_active = False
        self.user.save()
        with self.assertRaisesMessage(CommandError, 'account is disabled'):
            self.attempt_command(self.username, '--password', self.password)
