from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

from django.shortcuts import get_object_or_404

# A dummy project is referenced by all the classes and class instances.
# This is due to the fact, that one classification tree instance should
# be referencey by multiple projects.
dummy_pid = -1
# Root classes can be seen as namespaces in the semantic space. Different
# tools use different root classes.
root_classes = ['classification_root', 'root']

class ClassElement:
    def __init__(self, id, name):
        self.id = id
        self.name = name

def get_children( parent_id, max_nodes = 5000 ):
    """ Returns all children of a node with id <parent_id>. The result
    is limited to a maximum ef <max_nodes> nodes.
    """
    c = connection.cursor()
    # Must select the user as well because the user who created the skeleton may be differen
    # than the user who puts the request for the listing in the Object Tree.
    c.execute('''
            SELECT c.id,
                   c.class_name,
                   "auth_user".username AS username
            FROM class AS c
                INNER JOIN class_class AS cc
                ON c.id = cc.class_a
                INNER JOIN "auth_user"
                ON c.user_id = "auth_user".id
            WHERE cc.class_b = %s
            ORDER BY c.id ASC
            LIMIT %s''', (
        parent_id,
        max_nodes))

    # Collect all child node class instances
    child_nodes = []
    for row in c.fetchall():
        child = ClassElement(row[0], row[1])
        child_nodes.append( child )

    return child_nodes

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_available_relations(request, project_id=None):
    """ Returns a simple list of all relations available available
    for the given project."""
    relation_map = get_relation_to_id_map(project_id)
    return HttpResponse(json.dumps(relation_map))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_available_classes(request, project_id=None):
    """ Returns a simple list of all classes available available
    for the given project."""
    class_map = get_class_to_id_map(project_id)
    return HttpResponse(json.dumps(class_map))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_available_relations(request, project_id=None):
    """ Returns an object of all relations available available
    for the given project, prepared to work with a jsTree."""
    parent_id = int(request.GET.get('parentid', 0))
    if 0 == parent_id:
        return HttpResponse(json.dumps([{
            'data': {'title': 'Relations' },
            'attr': {'id': 'node_1', 'rel': 'root'},
            'state': 'closed'}]))

    relations = Relation.objects.filter(project=project_id)

    return HttpResponse(json.dumps(
        tuple({'data' : {'title': '%s (%d)' % (r.relation_name, r.id) },
               'attr' : {'id': 'node_%s' % r.id,
                         'rel': 'relation',
                         'name': r.relation_name}} for r in relations)))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_available_classes(request, project_id=None):
    """ Returns an object of all classes available available
    for the given project, prepared to work with a jsTree."""
    parent_id = int(request.GET.get('parentid', 0))
    include_roots = bool(int(request.GET.get('roots', 0)))
    if 0 == parent_id:
        return HttpResponse(json.dumps([{
            'data': {'title': 'Classes' },
            'attr': {'id': 'node_1', 'rel': 'root'},
            'state': 'closed'}]))

    if include_roots:
        classes = Class.objects.filter(project=project_id)
    else:
        classes = Class.objects.filter(project=project_id).exclude(class_name__in=root_classes)

    return HttpResponse(json.dumps(
        tuple({'data' : {'title': '%s (%d)' % (c.class_name, c.id) },
               'attr' : {'id': 'node_%s' % c.id,
                         'rel': 'class',
                         'name': c.class_name}} for c in classes)))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_ontology(request, project_id=None):
    parent_id = int(request.GET.get('parentid', 0))
    parent_name = request.GET.get('parentname', '')
    expand_request = request.GET.get('expandtarget', None)
    parent_type = request.GET.get('parenttype', "relation")
    class_b_id  = int(request.GET.get('classbid', 0))
    if expand_request is None:
        expand_request = tuple()
    else:
        # Parse to int to sanitize
        expand_request = tuple(int(x) for x in expand_request.split(','))

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    response_on_error = ''
    try:
        if parent_type == "relation":
            # A class is wanted
            if 0 == parent_id:
                response_on_error = 'Could not select the id of the ontology root node.'
                # For now, restrict this on classification roots
                root_node_q = Class.objects.filter(
                    id=class_map['classification_root'],
                    project=project_id)

                if 0 == root_node_q.count():
                    root_id = 0
                    root_name = 'noname'
                else:
                    root_node = root_node_q[0]
                    root_id = root_node.id
                    root_name = root_node.class_name

                return HttpResponse(json.dumps([{
                    'data': {'title': '%s (%d)' % (root_name, root_id) },
                    'attr': {'id': 'node_%s' % root_id, 'rel': 'root'},
                    'state': 'closed'}]))
            else:
                response_on_error = 'Could not retrieve child nodes.'
                # Select all classes that are linked with the passed relation
                cc_q = ClassClass.objects.filter(class_b=class_b_id,
                    relation=parent_id, project=project_id)

                return HttpResponse(json.dumps(
                    tuple({'data' : {'title': '%s (%d)' % (cc.class_a.class_name, cc.class_a.id)},
                           'attr' : {'id': 'node_%s' % cc.class_a.id,
                                     'rel': 'class',
                                     'ccid': cc.id},
                           'state': 'closed'} for cc in cc_q)))
        elif parent_type in ["class", "root"]:
            # A relation is wanted
            cc_q = ClassClass.objects.filter(
                project=project_id, class_b_id=parent_id)
            # Combine same relations into one
            relations = {}
            for cc in cc_q:
                if cc.relation not in relations:
                    relations[ cc.relation ] = []
                relations[ cc.relation ].append( cc )

            return HttpResponse(json.dumps(
                tuple({'data' : {'title': '%s (%d)' % (r.relation_name, r.id) },
                       'attr' : {'id': 'node_%s' % r.id,
                                 'rel': 'relation',
                                 'name': r.relation_name,
                                 'classbid': parent_id},
                       'state': 'closed'} for r in relations)))

        else:
            response_on_error = 'Unknown parent type'
            raise CatmaidException(parent_type)

    except Exception as e:
        raise CatmaidException(response_on_error + ': ' + str(e))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_relation_to_ontology(request, project_id=None):
    name = request.POST.get('relname', None)
    uri = request.POST.get('uri', '')
    description = request.POST.get('description', None)
    isreciprocal = bool(request.POST.get('isreciprocal', False))

    if name is None:
        raise CatmaidException("Couldn't find name for new relation.")

    r = Relation.objects.create(user=request.user,
        project_id = project_id, relation_name = name, uri = uri,
        description = description, isreciprocal = isreciprocal)

    return HttpResponse(json.dumps({'relation_id': r.id}))

def get_number_of_inverse_links( obj ):
    """ Returns the number of links that other model objects
    have to the passed object. It seems to be alright to do it like this:
    http://mail.python.org/pipermail//centraloh/2012-December/001492.html
    """
    count = 0
    for r in obj._meta.get_all_related_objects():
        count += r.model.objects.filter(
            **{r.field.name + '__exact': obj.id}).count()
    return count

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_relation_from_ontology(request, project_id=None):
    relid = int(request.POST.get('relid', -1))
    force = bool(int(request.POST.get('force', 0)))
    relation = get_object_or_404(Relation, id=relid)
    if not force:
        # Check whether this relation is used somewhere
        nr_links = get_number_of_inverse_links( relation )
        if nr_links > 0:
            raise CatmaidException("The relation to delete is still referenced by others. If enforced, all related objects get deleted, too.")

    # Delete, if not used
    relation.delete()
    return HttpResponse(json.dumps({'deleted_relation': relid}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_relations_from_ontology(request, project_id=None):
    force = bool(int(request.POST.get('force', 0)))
    deleted_ids = []
    not_deleted_ids = []

    if force:
        rel_q = Relation.objects.filter(project=project_id)
        deleted_ids = [r.id for r in rel_q]
        rel_q.delete()
    else:
        # Check whether this relation is used somewhere
        rel_q = Relation.objects.filter(project=project_id)
        for r in rel_q:
            nr_links = get_number_of_inverse_links( r )
            if nr_links == 0:
                deleted_ids.append(r.id)
                r.delete()
            else:
                not_deleted_ids.append(r.id)

    return HttpResponse(json.dumps(
        {'deleted_relations': deleted_ids,
         'not_deleted_relations': not_deleted_ids}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_class_to_ontology(request, project_id=None):
    name = request.POST.get('classname', None)
    description = request.POST.get('description', None)

    if name is None:
        raise CatmaidException("Couldn't find name for new class.")

    c = Class.objects.create(user=request.user,
        project_id = project_id, class_name = name,
        description = description)

    return HttpResponse(json.dumps({'class_id': c.id}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_class_from_ontology(request, project_id=None):
    """ Removes a class from the ontology of a particular project.
    The root classes will be excluded from this and can't be removed
    with this method
    """
    classid = int(request.POST.get('classid', -1))
    force = bool(int(request.POST.get('force', 0)))
    class_instance = get_object_or_404(Class, id=classid)

    if class_instance.class_name in root_classes:
        raise CatmaidException("A root class can't be removed with this method.")

    if not force:
        # Check whether this relation is used somewhere
        nr_links = get_number_of_inverse_links( class_instance )
        if nr_links > 0:
            raise CatmaidException("The class to delete is still referenced by others. If enforced, all related objects get deleted, too.")

    # Delete, if not used
    class_instance.delete()
    return HttpResponse(json.dumps({'deleted_class': classid}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_classes_from_ontology(request, project_id=None):
    """ Removes all classes from the ontology of a particular project.
    The root classes will be excluded from this and can't be removed
    with this method
    """
    force = bool(int(request.POST.get('force', 0)))
    deleted_ids = []
    not_deleted_ids = []

    if force:
        rel_q = Class.objects.filter(project=project_id).exclude(class_name__in=root_classes)
        deleted_ids = [r.id for r in rel_q]
        rel_q.delete()
    else:
        # Check whether a class is used somewhere
        rel_q = Class.objects.filter(project=project_id).exclude(class_name__in=root_classes)
        for r in rel_q:
            nr_links = get_number_of_inverse_links( r )
            if nr_links == 0:
                deleted_ids.append(r.id)
                r.delete()
            else:
                not_deleted_ids.append(r.id)

    return HttpResponse(json.dumps(
        {'deleted_classes': deleted_ids,
         'not_deleted_classes': not_deleted_ids}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_link_to_ontology(request, project_id=None):
    """ Creates a new class-class link.
    """
    classaid = int(request.POST.get('classaid', -1))
    classbid = int(request.POST.get('classbid', -1))
    relationid = int(request.POST.get('relid', -1))

    if classaid == -1:
        raise CatmaidException("Couldn't find ID of class a.")
    if classbid == -1:
        raise CatmaidException("Couldn't find ID of class b.")
    if relationid == -1:
        raise CatmaidException("Couldn't find relation ID.")

    cc = ClassClass.objects.create(user=request.user,
        project_id = project_id, class_a_id = classaid,
        class_b_id = classbid, relation_id = relationid)

    return HttpResponse(json.dumps({'class_class_id': cc.id}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_link_from_ontology(request, project_id=None):
    """ Removes one class-class link for a given project. Which link
    gets removed is determined by the ID passed in the POST data.
    """
    ccid = int(request.POST.get('ccid', -1))
    link = get_object_or_404(ClassClass, id=ccid)
    link.delete()
    return HttpResponse(json.dumps({'deleted_link': ccid}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_selected_links_from_ontology(request, project_id=None):
    """ Removes all class-class links for a given project
    that have a particular class_b and a particular relation.
    """
    relid = int(request.POST.get('relid', -1))
    classbid = int(request.POST.get('classbid', -1))
    relation = get_object_or_404(Relation, id=relid)

    cc_q = ClassClass.objects.filter(user=request.user,
        project_id = project_id, class_b_id = classbid,
        relation = relation)

    removed_links = []
    for cc in cc_q:
        removed_links.append(cc.id)
        cc.delete()

    return HttpResponse(json.dumps({'deleted_links': removed_links}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_links_from_ontology(request, project_id=None):
    """ Removes all class-class links for a given project.
    """
    cc_q = ClassClass.objects.filter(user=request.user,
        project_id = project_id)

    removed_links = []
    for cc in cc_q:
        removed_links.append(cc.id)
    cc_q.delete()

    return HttpResponse(json.dumps({'deleted_links': removed_links}))
