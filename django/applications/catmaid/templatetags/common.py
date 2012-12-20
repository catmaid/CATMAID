from django import template

register = template.Library()

@register.filter
def order_by(queryset, args):
    """ Sort a given queryset by a number of arguments.
    """
    args = [x.strip() for x in args.split(',')]
    return queryset.order_by(*args)
