from django import template
from django.utils.safestring import SafeUnicode

import re

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
	return val == str or val == unicode or val == SafeUnicode

@register.filter
def sort(l):
    """ In-place sorting of a list.
    """
    l.sort()
    return l

@register.filter
def natural_sort(l,field):
	""" Natural sorting of a list wrt. to a given attribute.
	Based on: http://stackoverflow.com/questions/4836710
	"""
	convert = lambda text: int(text) if text.isdigit() else text.lower()
	alphanum_key = lambda key: [ convert(c) for c in re.split('([0-9]+)', getattr(key, field)) ]
	return sorted(l, key = alphanum_key)

@register.filter
def intersect(set1, set2):
    return set1.intersection(set2)
