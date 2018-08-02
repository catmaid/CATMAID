# -*- coding: utf-8 -*-

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

ONTOLOGY_DUMMY_PROJECT_ID = getattr(settings, 'ONTOLOGY_DUMMY_PROJECT_ID', None)
if ONTOLOGY_DUMMY_PROJECT_ID is None:
    raise ImproperlyConfigured("In order to use CATMAID's ontology and "
        "classification system you have to configure ONTOLOGY_DUMMY_PROJECT_ID "
        "in your settings module.")
