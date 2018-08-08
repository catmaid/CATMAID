# -*- coding: utf-8 -*-
from django import template
from django.db.models import Count

from ..models import Project
from .common import is_string_type, natural_sort

register = template.Library()

@register.filter
def get_stack(stacks, pos):
    """ Returns an image stack out of stacks. Which one is
    determined by pos. This can either be an integer index
    or the string "first" or "last".
    """
    num_stacks = len(stacks)
    # Just return if we got no stacks at all
    if num_stacks == 0:
        return None
    # Check the type of the position informaiton
    pos_type = type(pos)
    if is_string_type(pos_type):
        if pos == "first":
            return stacks[0]
        elif pos == "last":
            return stacks[num_stacks - 1]
    elif pos_type == int:
        # Make sure we are in bounds
        if pos >= 0 and pos < num_stacks:
            return stacks[pos]
    # Return None if nothing else matched
    return None

@register.filter
def filter_stacks(stacks, pos):
    """ Returns a list of filtered stacks according to the
    pos parameter. This list can contain all stacks (pos is
    "all"), a specific stack (pos is a number), the first or
    the last stack (pos is "first" or "last").
    """
    if is_string_type(type(pos)) and pos == "all":
        return stacks
    else:
        s = get_stack(stacks, pos)
        if s is None:
            return []
        else:
            return [s]

@register.filter
def get_slice(stack, pos):
    """ Returns a slice index for an image stack. Which one
    is  determined by pos. This can either be an integer index
    or the string "first", "center" or "last".
    """
    num_slices = stack.dimension.z
    # Just return if we got no stacks at all
    if num_slices == 0:
        return None
    # Check the type of the position informaiton
    pos_type = type(pos)
    #return str(pos_type)
    if is_string_type(pos_type):
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

class ProjectListVarNode(template.Node):
    """ Stores the tag references in a template node and
    allows access to the projects tagged with them.
    """
    def __init__(self, var_name, tags, sort):
        self.var_name = var_name
        self.tags = [template.Variable(t) for t in tags]
        if sort is None:
            self.sort = None
        else:
            self.sort = template.Variable(sort)

    def render(self, context):
        """ Gets the tagged projects and return a list of them.
        """
        try:
            # Allow lists as tags as well
            current_tags = []
            for t in self.tags:
                tag = t.resolve(context)
                if not tag:
                    continue
                elif type(tag) == list:
                    for subtag in tag:
                        current_tags.append(subtag)
                else:
                    current_tags.append(tag)
            # Filter objects that have *all* the tags assigned
            projects = Project.objects.filter(tags__name__in=current_tags).annotate(repeat_count=Count("id")).filter(repeat_count=len(current_tags))
            # Sort projects if requested. Default to true if
            # variable not given or not found.
            if self.sort is None:
                sort = True
            else:
                sort = self.sort.resolve(context)
                sort = bool(sort)
            if sort:
                projects = natural_sort(projects, "title")
            context[self.var_name] = projects
        except template.VariableDoesNotExist:
            pass
        return u""

@register.tag
def tagged_projects(parser, token):
    """ {% tagged_projects <tag1> <tag2> ... as <var_name> [<sort>] %}
    """
    help_msg = "'tagged_projects' must be of the form: {% tagged_projects \
            <tag1> <tag2> ... as <var_name> [<sort>] %}. The tags and sort \
            option will be evaluated as context variables. Therefore, the \
            tags should resolve to strings and sort to a boolean value. If \
            sort isn't present, it will default to true."
    try:
        parts = token.split_contents()
    except ValueError:
        raise template.TemplateSyntaxError(help_msg)
    if len(parts) < 4:
        raise template.TemplateSyntaxError(help_msg)
    nr_parts = len(parts)
    as_is_third_last = (parts[nr_parts - 3] == "as")
    as_is_second_last = (parts[nr_parts - 2] == "as")
    if not (as_is_third_last or as_is_second_last):
        raise template.TemplateSyntaxError(help_msg)
    # See if a sort variable name is given
    sort = as_is_third_last and not as_is_second_last
    # Get all tokens and return a node
    if sort:
        sort = parts[nr_parts - 1]
        var_name = parts[nr_parts - 2]
        tags = parts[1:nr_parts - 3]
    else:
        sort = None
        var_name = parts[nr_parts - 1]
        tags = parts[1:nr_parts - 2]
    return ProjectListVarNode(var_name, tags, sort)

@register.filter
def has_tag(project, tags):
    for tag in project.tags.all():
        if tag.name in tags:
            return True
    return False

@register.simple_tag
def pids_to_projects(pids, project_index, sort=False):
    """ Returns a list of project objects that correspond to the PID list
    passed as parameter. If sort is specified, the returning list is sorted
    by title.
    """
    projects = [project_index[pid] for pid in pids]
    if sort:
        return natural_sort(projects, "title")
    else:
        return projects

@register.simple_tag
def is_highlighted(pid, highlight_tags, tag_index):
    """ Expects <args> to be a list where the first element is a list of tags
    to test against and the second element is a project ID. Based on that, this
    filter tests whether at least one test tag is linked to a project ID by
    using the tag index.
    """
    if not highlight_tags:
        return
    for t in highlight_tags:
        if pid in tag_index[t]:
            return True
    return False
