# -*- coding: utf-8 -*-

import re

from django import template
from django.conf import settings
from django.utils.safestring import SafeText


register = template.Library()

@register.filter
def order_by(queryset, args):
    """ Sort a given queryset by a number of arguments.
    """
    args = [x.strip() for x in args.split(',')]
    return queryset.order_by(*args)

@register.filter
def is_none(val):
    """ Return whether the value is None or not.
    """
    return val is None

@register.filter
def make_js_bool(val):
    """Return a JavasScript "true" or "false" value if the input is truthy or
    falsy, respectively.
    """
    return "true" if val else "false"

@register.filter
def get(dictionary, key):
    return dictionary[key]

@register.filter
def get_or_none(dictionary, option):
    """ Returns the value linked to the name key in the input
    dictionary, if it exists. If it does not exists, it returns
    none.
    """
    if option in dictionary:
        return dictionary[option]
    else:
        return None

def is_string_type(val):
    """ Returns whether the passed type is a string type.
    """
    return val == str or val == SafeText

@register.filter
def sort(l):
    """ In-place sorting of a list.
    """
    l.sort()
    return l

@register.filter
def natural_sort(l, field):
    """ Natural sorting of a list wrt. to a given attribute.
    Based on: http://stackoverflow.com/questions/4836710
    """
    convert = lambda text: int(text) if text.isdigit() else text.lower()
    alphanum_key = lambda key: [convert(c) for c in re.split('([0-9]+)', getattr(key, field))]
    return sorted(l, key=alphanum_key)

@register.filter
def intersect(set1, set2):
    return set1.intersection(set2)

@register.simple_tag
def catmaid_version():
    """
    Print the current Git commit of this CATMAID instance or "unknown" if the
    current Git commit is not available.
    """
    return settings.VERSION

@register.simple_tag
def csrf_cookie_name():
    return settings.CSRF_COOKIE_NAME
