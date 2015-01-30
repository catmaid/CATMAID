from django.core.serializers import serialize
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.query import QuerySet
from django.template import Library

import json

register = Library()


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
