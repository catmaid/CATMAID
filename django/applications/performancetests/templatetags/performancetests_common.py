# -*- coding: utf-8 -*-

from django.conf import settings
from django.core.serializers import serialize
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.query import QuerySet
from django.template import Library

import json
import re

register = Library()

version_to_commit_regex = re.compile('^.*-g(.*)$')

class CustomJSONEncoder(DjangoJSONEncoder):
    def default(self, obj):
        try:
            return obj.as_json()
        except AttributeError:
            return super(CustomJSONEncoder, self).default(obj)


@register.filter
def jsonify(object):
    if isinstance(object, QuerySet):
        return serialize('json', object)
    return json.dumps(object, cls=CustomJSONEncoder)

@register.filter
def make_version_link(version):
    """Convert a 'git describe' version to only the commit id,
    """
    matches = version_to_commit_regex.match(version)
    if matches:
        # Use only commit, e.g. 2015.5.27-513-gd0038be -> d0038be
        v = matches.groups(1)[0]
        return settings.PERFORMANCETEST_SCM_URL.format(version=v)
    else:
        return '#'
