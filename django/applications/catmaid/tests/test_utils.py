# -*- coding: utf-8 -*-

from django.test import TestCase

class UtilTests(TestCase):

    def test_is_collinear_diagonal(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(-1.0, 1.0, 1.0)
        p2 = Point3D(1.0, 2.0, 3.0)
        p3 = Point3D(-2.0, 0.5, 0.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_on_x_axis(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(0.0, 0.0, 0.0)
        p2 = Point3D(1.0, 0.0, 0.0)
        p3 = Point3D(1.5, 0.0, 0.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_on_y_axis(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(0.0, 0.0, 0.0)
        p2 = Point3D(0.0, 1.0, 0.0)
        p3 = Point3D(0.0, 1.5, 0.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_on_z_axis(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(0.0, 0.0, 0.0)
        p2 = Point3D(0.0, 0.0, 1.0)
        p3 = Point3D(0.0, 0.0, 1.5)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_too_precise(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(0.0, 0.0, 0.0)
        p2 = Point3D(1.0, 0.0001, 0.0)
        p3 = Point3D(1.5, 0.0, 0.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_precision(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(0.0, 0.0, 0.0)
        p2 = Point3D(1.0, 0.001, 0.0)
        p3 = Point3D(1.5, 0.0, 0.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertFalse(is_collinear(p1, p2, p3, True))

    def test_is_collinear_big_numbers(self):
        from catmaid.util import Point3D, is_collinear

        p1 = Point3D(-299924.0, 505016.0, 40.0)
        p2 = Point3D(-319905.0, 505904.0, 40.0)
        p3 = Point3D(-309915.0, 505460.0, 40.0)

        self.assertTrue(is_collinear(p1, p2, p3))
        self.assertTrue(is_collinear(p1, p2, p3, True))

    def test_get_version(self):
        from mysite.utils import get_version

        version = get_version()
        self.assertNotEqual(version, "unknown")
