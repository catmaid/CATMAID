# -*- coding: utf-8 -*-

from django.test import TestCase
from django.test.client import Client
from catmaid.models import Class, ClassInstance, TreenodeClassInstance, Relation
from catmaid.models import Treenode
from catmaid.control.label import remove_label
from catmaid.tests.common import CatmaidTestCase


class TagCreationAndRemovalTest(CatmaidTestCase):

    def setUp(self):
        super(TagCreationAndRemovalTest, self).setUp()
        self.linked_as_relation = Relation.objects.get(
                project_id=self.test_project_id, relation_name='labeled_as')
        self.label_class = Class.objects.get(
                project=self.test_project_id, class_name='label')

    def test_tag_removal(self):
        """
        Tests that a tag can be removed properly. If the last link to a tag is
        removed, the class instance, by which it is represented, should be
        removed as well.
        """
        self.fake_authentication()

        # Create a new label and link it to the first treenode available
        tn = Treenode.objects.all()[0]
        label = ClassInstance.objects.create(user=self.user,
            project_id=self.test_project_id, class_column=self.label_class,
            name="Test label")
        link1 = TreenodeClassInstance.objects.create(user=self.user,
            project_id=self.test_project_id, relation=self.linked_as_relation,
            treenode=tn, class_instance=label)
        link2 = TreenodeClassInstance.objects.create(user=self.user,
            project_id=self.test_project_id, relation=self.linked_as_relation,
            treenode=tn, class_instance=label)

        # Remove the first link
        remove_label(link1.id, 'treenode')

        # Expect one label link to be there still
        num_links = TreenodeClassInstance.objects.filter(
                class_instance=label).count()
        self.assertEqual(num_links, 1)

        # Expect the class instance still to be there
        self.assertEqual(ClassInstance.objects.filter(pk=label.id).exists(), True)

        # Remove second and last link
        remove_label(link2.id, 'treenode')

        # Expect no label link anymore
        num_links = TreenodeClassInstance.objects.filter(
                class_instance=label).count()
        self.assertEqual(num_links, 0)

        # Expect the class instance to be removed as well
        self.assertEqual(ClassInstance.objects.filter(pk=label.id).exists(), False)
