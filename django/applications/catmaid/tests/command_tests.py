from django.core.management import call_command
from django.test import TestCase
from django.test.client import Client
from django.utils.six import StringIO
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
                                        password=self.password)
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
        call_command('catmaid_prune_skeletons', p.project.id, stdout=out)
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
