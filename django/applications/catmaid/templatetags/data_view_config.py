from django import template
from django.utils.safestring import SafeUnicode
register = template.Library()

@register.filter
def is_none(val):
	""" Return whether the value is None or not.
	"""
	return val is None

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
def get_stack(stacks, pos):
	""" Returns an image stack out of stacks. Which one is
	determined by pos. This can either be an integer index
	or the string "first" or "last".
	"""
	num_stacks = stacks.count()
	# Just return if we got no stacks at all
	if num_stacks == 0:
		return None
	# Check the type of the position informaiton
	pos_type = type(pos)
	if is_string_type( pos_type ):
		if pos == "first":
			return stacks.order_by('id')[0]
		elif pos == "last":
			return stacks.order_by('id')[num_stacks - 1]
	elif pos_type == int:
		# Make sure we are in bounds
		if pos >= 0 and pos < num_stacks:
			return stacks.order_by('id')[pos]
	# Return None if nothing else matched
	return None

@register.filter
def get_slice(stack, pos):
	""" Returns a slice index for an image stack. Which one
	is 	determined by pos. This can either be an integer index
	or the string "first", "center" or "last".
	"""
	num_slices = stack.dimension.z
	# Just return if we got no stacks at all
	if num_slices == 0:
		return None
	# Check the type of the position informaiton
	pos_type = type(pos)
	#return str(pos_type)
	if is_string_type( pos_type ):
		if pos == "first":
			return 0
		elif pos == "center":
			return int(num_slices / 2)
		elif pos == "last":
			return num_slices - 1
	elif pos_type == int:
		# Make sure we are in bounds
		if pos >= 0 and pos < num_slices:
			return pos
	# Return None if nothing else matched
	return None
