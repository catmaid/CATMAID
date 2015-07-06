class Point3D:
    """A simple container to hold three coordinate values.
    """

    def __init__(self, x, y, z):
        self.x, self.y, self.z = x, y, z


def is_collinear(a, b, c, between=False):
    """Return true if all three points are collinear, i.e. on one line. If
    between is True, c has to be additionally between a and b.
    """
    # General point equation: a + (b - a) * t, calculate d = b - a
    dx = b.x - a.x
    dy = b.y - a.y
    dz = b.z - a.z

    # Find a factor t for a dimension where d isn't zero
    if 0 != dx:
        t = (c.x - a.x) / dx
    elif 0 != dy:
        t = (c.y - a.y) / dy
    elif 0 != dz:
        t = (c.z - a.z) / dz
    else:
        raise ValueError("A and B have to be different")

    # Re-calculate C and check if it matches the input
    c2x = a.x + t * dx
    c2y = a.y + t * dy
    c2z = a.z + t * dz

    # Return False if the calculated C doesn't match input
    if not (c2x == c.x and c2y == c.y and c2z == c.z):
        return False

    if between:
        # If C is only allowed to be between A and B, check if T is between
        # zero and one.
        return not (t < 0.0 or t > 1.0)
    else:
        return True
