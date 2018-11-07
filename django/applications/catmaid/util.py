# -*- coding: utf-8 -*-

import argparse
import math


# Respected precision
epsilon = 0.001

def same(a, b, eps=epsilon):
    return abs(a - b) < eps

class Point3D:
    """A simple container to hold three coordinate values.
    """

    def __init__(self, x, y, z):
        self.x, self.y, self.z = x, y, z

    def __str__(self):
        return "({}, {}, {})".format(self.x, self.y, self.z)

def is_collinear(a, b, c, between=False, eps=epsilon):
    """Return true if all three points are collinear, i.e. on one line. If
    between is True, c has to be additionally between a and b.
    """
    # General point equation: a + (b - a) * t, calculate d = b - a
    dx = b.x - a.x
    dy = b.y - a.y
    dz = b.z - a.z

    # Find a factor t for a dimension where d isn't zero
    valid_t = None
    if dx != 0:
        tx = (c.x - a.x) / dx
        valid_t = tx
    else:
        tx = 0.0

    if dy != 0:
        ty = (c.y - a.y) / dy
        if valid_t is None:
            valid_t = ty
        elif not same(ty, 0.0, eps) and not math.fabs(valid_t - ty) < eps:
            return False
    else:
        ty = 0.0

    if dz != 0.0:
        tz = (c.z - a.z) / dz
        if valid_t is None:
            valid_t = tz
        elif not same(tz, 0.0, eps) and not math.fabs(valid_t - tz) < eps:
            return False
    else:
        tz = 0.0

    # Re-calculate C and check if it matches the input
    c2x = a.x + tx * dx
    c2y = a.y + ty * dy
    c2z = a.z + tz * dz

    # Return False if the calculated C doesn't match input
    if not (same(c2x, c.x, eps) and same(c2y, c.y, eps) and same(c2z, c.z, eps)):
        return False

    if between:
        # If C is only allowed to be between A and B, check if T is between
        # zero and one.
        return not (min(tx, ty, tz) < 0.0 or max(tx, ty, tz) > 1.0)
    else:
        return True

def str2bool(v):
    if v.lower() in ('yes', 'true', 't', 'y', '1'):
        return True
    elif v.lower() in ('no', 'false', 'f', 'n', '0'):
        return False
    else:
        raise argparse.ArgumentTypeError('Boolean value expected.')
