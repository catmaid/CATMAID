# -*- coding: utf-8 -*-

from django.test import TestCase
from django.contrib.auth.models import User
from django.http.request import QueryDict
from catmaid.control.common import get_request_bool, get_request_list
from catmaid.models import Project, Class, Relation, ClassInstance, \
    ClassInstanceClassInstance
from catmaid.control.annotation import delete_annotation_if_unused
from catmaid.tests.common import CatmaidTestCase


class InternalApiTestsNoDB(TestCase):

    def test_request_list_parsing(self):
        q = QueryDict('a=0&a=1&a=2&a=3')
        self.assertEqual(get_request_list(q, 'a'), ['0', '1', '2', '3'])
        self.assertEqual(get_request_list(q, 'a', map_fn=int), [0, 1, 2, 3])
        self.assertEqual(get_request_list(q, 'b'), None)

        q2 = QueryDict('a[0]=0&a[1]=1&a[2]=2&a[3]=3&a=4')
        self.assertEqual(get_request_list(q2, 'a'), ['0', '1', '2', '3'])
        self.assertEqual(get_request_list(q2, 'a', map_fn=int), [0, 1, 2, 3])
        self.assertEqual(get_request_list(q2, 'b'), None)

        # Test list of lists [[1,2],[3,4]]
        q3 = QueryDict('a[0][0]=1&a[0][1]=2&a[1][0]=3&a[1][1]=4')
        self.assertEqual(get_request_list(q3, 'a'), [['1', '2'], ['3', '4']])
        self.assertEqual(get_request_list(q3, 'a', map_fn=int), [[1, 2], [3, 4]])
        self.assertEqual(get_request_list(q3, 'b'), None)

        # Test list with single list [[1,2, 3]]
        q4 = QueryDict('a[0][0]=1&a[0][1]=2&a[0][2]=3')
        self.assertEqual(get_request_list(q4, 'a'), [['1', '2', '3']])
        self.assertEqual(get_request_list(q4, 'a', map_fn=int), [[1, 2, 3]])

        # Test list with single list [1,2,3]
        q5 = QueryDict('a[]=1,2,3')
        self.assertEqual(get_request_list(q5, 'a'), ['1', '2', '3'])
        self.assertEqual(get_request_list(q5, 'a', map_fn=int), [1, 2, 3])


    def test_request_bool_parsing(self):
        q1 = QueryDict('a=true&b=True&c=TRUE')
        self.assertEqual(get_request_bool(q1, 'a', False), True)
        self.assertEqual(get_request_bool(q1, 'b', False), True)
        self.assertEqual(get_request_bool(q1, 'c', False), True)

        q2 = QueryDict('a=false&b=False&c=FALSE')
        self.assertEqual(get_request_bool(q2, 'a', True), False)
        self.assertEqual(get_request_bool(q2, 'b', True), False)
        self.assertEqual(get_request_bool(q2, 'c', True), False)

        q3 = QueryDict()
        self.assertEqual(get_request_bool(q3, 'a', True), True)
        self.assertEqual(get_request_bool(q3, 'b', False), False)


class InternalApiTests(CatmaidTestCase):
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.test_user = User.objects.get(username="test0")
        self.test_project = Project.objects.get(id=3)

    def test_annotation_deletion(self):
        annotation_class = Class.objects.get(project=self.test_project,
                                             class_name='annotation')
        annotated_with = Relation.objects.get(project=self.test_project,
                                              relation_name='annotated_with')
        # Create three annotation A, B and C
        annotation_a = ClassInstance.objects.create(project=self.test_project,
                                                    user=self.test_user,
                                                    class_column=annotation_class,
                                                    name="A")
        annotation_b = ClassInstance.objects.create(project=self.test_project,
                                                    user=self.test_user,
                                                    class_column=annotation_class,
                                                    name="B")
        annotation_c = ClassInstance.objects.create(project=self.test_project,
                                                    user=self.test_user,
                                                    class_column=annotation_class,
                                                    name="C")

        # Annotate A with B and B with C
        a_b = ClassInstanceClassInstance.objects.create(project=self.test_project,
                                                        user=self.test_user,
                                                        class_instance_a=annotation_a,
                                                        class_instance_b=annotation_b,
                                                        relation=annotated_with)
        b_c = ClassInstanceClassInstance.objects.create(project=self.test_project,
                                                        user=self.test_user,
                                                        class_instance_a=annotation_b,
                                                        class_instance_b=annotation_c,
                                                        relation=annotated_with)

        # Try to delete annotation B and expect fail, because it is used
        b_deleted, b_usecount = delete_annotation_if_unused(self.test_project,
                                                            annotation_b.id,
                                                            annotated_with)
        self.assertFalse(b_deleted)
        self.assertEqual(b_usecount, 1)
        self.assertTrue(ClassInstance.objects.filter(id=annotation_a.id).exists())
        self.assertTrue(ClassInstance.objects.filter(id=annotation_b.id).exists())
        self.assertTrue(ClassInstance.objects.filter(id=annotation_c.id).exists())

        # Try to delete annotation C and expect fail, because it is used
        c_deleted, c_usecount = delete_annotation_if_unused(self.test_project,
                                                            annotation_c.id,
                                                            annotated_with)
        self.assertFalse(c_deleted)
        self.assertEqual(c_usecount, 1)
        self.assertTrue(ClassInstance.objects.filter(id=annotation_a.id).exists())
        self.assertTrue(ClassInstance.objects.filter(id=annotation_b.id).exists())
        self.assertTrue(ClassInstance.objects.filter(id=annotation_c.id).exists())

        # Try to delete annotation A and expect this to succeed, B and C should
        # also be deleted. Since they are not use anymore if A is deleted.
        a_deleted, a_usecount = delete_annotation_if_unused(self.test_project,
                                                            annotation_a.id,
                                                            annotated_with)
        self.assertTrue(a_deleted)
        self.assertEqual(a_usecount, 0)
        self.assertFalse(ClassInstance.objects.filter(id=annotation_a.id).exists())
        self.assertFalse(ClassInstance.objects.filter(id=annotation_b.id).exists())
        self.assertFalse(ClassInstance.objects.filter(id=annotation_c.id).exists())
