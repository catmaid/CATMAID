# -*- coding: utf-8 -*-

"""
Django migrations for CATMAID

This package does not contain South migrations. South migrations can be found
in here last in release 2015.12.21.
"""

SOUTH_ERROR_MESSAGE = """\n
CATMAID requires at least Django 1.7, South isn't supported anymore.
"""

# Ensure the user is not using Django 1.6 or below with South
try:
    from django.db import migrations  # noqa
except ImportError:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(SOUTH_ERROR_MESSAGE)
