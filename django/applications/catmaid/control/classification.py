import json

from django import forms
from django.conf import settings
from django.http import HttpResponse
from django.views.generic import TemplateView
from django.shortcuts import render_to_response
from django.template import Context

from catmaid.control.common import get_class_to_id_map, get_relation_to_id_map
from catmaid.control.ajax_templates import *
from catmaid.control.ontology import get_classes
from catmaid.models import Class, ClassInstance, ClassInstanceClassInstance, Relation
from catmaid.models import UserRole
from catmaid.control.authentication import requires_user_role

# A dummy project is referenced by all the classes and class instances.
# This is due to the fact, that one classification tree instance should
# be referencey by multiple projects.
dummy_pid = -1

# All needed classes by the classification system alongside their
# descriptions.
needed_classes = {
    'classification_root':
         "The root node class for classification graphs",
    'classification_project':
         "A project represention to link to classification graphs"}

# All needed relations by the classification system alongside their
# descriptions.
needed_relations = {
    'is_a': "A basic is_a relation",
    'classified_by': "Link a classification to something"}

class ClassProxy(Class):
    """ A proxy class to allow custom labeling of class in model forms.
    """
    class Meta:
        proxy=True

    def __unicode__(self):
        return "{0} ({1})".format(self.class_name, str(self.id))

def get_root_classes_qs():
    """ Return a queryset that will get all root classes.
    """
    return[ c.id for c in get_classes(dummy_pid, 'is_a', 'classification_root') ]

def get_classification_roots( project_id ):
    """ Returns a list of classification graph roots, linked to a
    project. The classification system uses a dummy project with ID -1
    to store its ontologies and class instances. Each project using a
    particular classification graph instance creates a class instance
    with its PID of class classification_project (which lives in dummy
    project -1). Those class instances will be returned.
    """
    # Expect the classification system to be set up and expect one
    # single 'classification_project' class.
    classification_project_c_q = Class.objects.filter(
        project_id = dummy_pid, class_name = 'classification_project')
    # Return an empty list if there isn't a classification project class
    if classification_project_c_q.count() == 0:
        return []
    classification_project_c = classification_project_c_q[0]

    # Get the query set for the classification project instance to test
    # if there already is such an instance.
    classification_project_ci_q = ClassInstance.objects.filter(
        project_id = project_id, class_column_id = classification_project_c.id)
    # Return an empty list if there isn't a classification project
    # instance
    if classification_project_ci_q.count() == 0:
        return []
    classification_project_ci = classification_project_ci_q[0]

    # Get a list of all classification root classes and return an empty
    # list if teher are none
    root_classes = get_classes(dummy_pid, 'is_a', 'classification_root')
    if not root_classes:
        return []
    # Query to get all root class instances
    root_class_instances = ClassInstance.objects.filter(project_id=dummy_pid,
        class_column__in=root_classes)
    # Query to get the 'classified_by' relation
    classified_by_rel = Relation.objects.filter(project_id=dummy_pid,
        relation_name='classified_by')
    # Find all 'classification_project' class instances of the current
    # project that link to those root nodes
    cici_q = ClassInstanceClassInstance.objects.filter(project_id=dummy_pid,
        relation__in=classified_by_rel, class_instance_b__in=root_class_instances,
        class_instance_a__in=classification_project_ci_q)
    # Return valid roots
    return [ cici.class_instance_a for cici in cici_q ]

def get_classification_number( project_id ):
    """ Returns the number of classification graphs, linked to a
    project.
    """
    roots = get_classification_roots(project_id)
    return len(roots)

def link_to_classification( project_id, cls_graph ):
    """ Links a project to a classification graph by creating a
    new class_instance_class_instance link for the project's
    classification_project class instance. It relates it to a
    class instance of a class that has a 'is_a' relation to a
    'classification_root' class, i.e. a classification graph root.
    Both are connected like this: 'classification_project'
    'classified_by' 'classification_root'. If  a project's
    classification_project class instance isn't available yet, it
    will be created.
    """
    # Get classification_project class instance for a project
    pass

def create_new_classification( project_id ):
    """ creates a new classification graph instance. This basically
    means a new class instance is created that is based on a class
    whilh has a 'is_a' relation to the class 'classification_root'.
    Such a new class instance will live in the dummy project -1.
    """
    # Get the classification project class
    class_map = get_class_to_id_map(dummy_pid)
    if 'classification_project' not in class_map:
        raise CatmaidException("Couldn't find 'classification_project' class")

    # Create new classification
    cls_graph = None
    # Link new classification to project
    link_to_classification( project_id, cls_graph )

def add_class(class_user, class_name, class_desc):
    new_class = Class.objects.create(
        user = class_user,
        project_id = dummy_pid,
        class_name = class_name,
        description = class_desc)
    return new_class

def add_relation(rel_user, rel_name, rel_desc, is_reciprocal=False):
    new_rel = Relation.objects.create(
        user = rel_user,
        project_id = dummy_pid,
        relation_name = rel_name,
        description = rel_desc,
        isreciprocal = is_reciprocal)
    return new_rel

def check_classification_setup_view(request):
    all_good = check_classification_setup()
    return HttpResponse(json.dumps({'all_good': all_good}))

def check_classification_setup():
    """ Checks if all classes and relations needed by the
    classification system are available. Needed classes are
    'classification_root' and 'classification_project' and the
    nedded relations are 'is_a' and 'classified_by'.
    """
    # Get classification and relation data
    class_map = get_class_to_id_map(dummy_pid)
    relation_map = get_relation_to_id_map(dummy_pid)

    # Check if all is good
    all_good = True
    for c in needed_classes:
        all_good = (all_good and (c in class_map))
    for r in needed_relations:
        all_good = (all_good and (r in relation_map))

    return all_good

def setup_classification(user):
    """ Tests which of the needed classes and relations is missing
    from the dummy project''s semantic space and adds those.
    """
    # Get classification and relation data
    class_map = get_class_to_id_map(dummy_pid)
    relation_map = get_relation_to_id_map(dummy_pid)

    # Add what is missing
    for c in needed_classes:
        if c not in class_map:
            add_class(user, c, needed_classes[c])
    for r in needed_relations:
        if r not in relation_map:
            add_relation(user, r, needed_relations[r])

class ClassificationGraphDisplay():
    """ This view displays the classification graph.
    """
    pass

class SelectionView():
    """ Provides a list of all classification graph instances linked
    to a certain project. The user can select one to trigger the
    display of it.
    """
    pass

class NewGraphView(TemplateView):
    """ Allows to create new classification graphs and link them to
    the current project.
    """
    template_name = 'catmaid/classification/new_graph.html'

    #ontologies =

class NewGraphForm(forms.Form):
    """ A simple form to select classification ontologies. A choice
    field allows to select a single class that 'is_a' 'classification_root'.
    """
    ontology = forms.ModelChoiceField(
        queryset=ClassProxy.objects.filter(id__in=get_root_classes_qs()))

def show_classification_editor( request, project_id=None, link_id=None):
    """ Selects the right view to show, based on the provided project.
    """
    if link_id is not None:
        num_trees = 1

        selected_tree = ClassInstanceClassInstance.objects.filter(
            id=link_id, project=dummy_pid)
        # Make sure we actually got a tree:
        if selected_tree.count() != 1:
            raise CatmaidException("Couldn't select requested tree.")
        else:
            selected_tree = selected_tree[0]

        context = Context({
            'num_trees': 1,
            'tree_id': link_id,
            'project_id': project_id,
            'settings': settings
        })

        template = loader.get_template("catmaid/classification/show_tree.html")
    else:
        # First, check how many trees there are.
        roots = get_classification_roots( project_id )
        num_roots = len(roots)

        context = Context({
            'num_graphs': num_roots,
            #'template_trees': template_trees,
            'project_id': project_id,
            'CATMAID_URL': settings.CATMAID_URL
        })

        if num_roots == 0:
            context['new_tree_form'] = NewGraphForm()
            #link_form = create_link_form(project_id)
            #context['link_tree_form'] = link_form()
            template_name = "catmaid/classification/new_graph.html"
        elif num_roots == 1:
            selected_graph = roots[0]
            context['graph_id'] = selected_graph.id
            template_name = "catmaid/classification/show_graph.html"
        else:
            #form = create_classification_form( project_id )
            #context['select_tree_form'] = form()
            template_name = "catmaid/classification/select_graph.html"

    if request.is_ajax():
        rendered_block = render_block_to_string( template_name,
            'classification-content', {}, context )
        return HttpResponse( json.dumps( {'content': rendered_block} ) )
    else:
        return render_to_response( template_name, {}, context )

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_classification_graph(request, project_id=None):
    # Has the form been submitted?
    if request.method == 'POST':
        form = NewGraphForm(request.POST)
        if form.is_valid():
            # Create the new classification tree
            project = get_object_or_404(Project, pk=project_id)
            ontology = form.cleaned_data['ontology']
            init_classification( request.user, project, ontology )
            return HttpResponse('A new tree has been initalized.')
    else:
        new_tree_form = NewGraphForm()
        #link_form = create_link_form( project_id )
        #link_tree_form = link_form()

        return render_to_response("catmaid/new_classification_tree.html", {
            "project_id": project_id,
            "new_tree_form": new_tree_form,
            #"link_tree_form": link_tree_form,
        })
