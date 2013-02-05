from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

from django.shortcuts import get_object_or_404

# Root classes can be seen as namespaces in the semantic space. Different
# tools use different root classes.
root_classes = ['root', 'classification_root']

# Root classes can be treated special if wanted. If set to True root
# classes won't appear an the class overview and can't be deleted
guard_root_classes = False

# In strict mode, it is not allowed to add relations and classes that
# have the same name like already present ones
be_strict = True

class ClassElement:
    def __init__(self, id, name):
        self.id = id
        self.name = name

def get_known_ontology_roots(request):
    """ Returns an array of all known root class names.
    """
    return HttpResponse(json.dumps({"knownroots": root_classes}))

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

    # Get the relations queryset
    relations = Relation.objects.filter(project=project_id)

    if 0 == parent_id:
        data = {'data': {'title': 'Relations' },
            'attr': {'id': 'node_1', 'rel': 'root'}}
        # Test if there are relations present and mark the root
        # as leaf if there are none.
        if relations.count() > 0:
            data['state'] = 'closed'
        return HttpResponse(json.dumps([data]))

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
    include_roots = bool(int(request.GET.get('roots', int(guard_root_classes))))

    # Get the classes queryset
    if include_roots:
        classes = Class.objects.filter(project=project_id)
    else:
        classes = Class.objects.filter(project=project_id).exclude(class_name__in=root_classes)

    if 0 == parent_id:
        data = {'data': {'title': 'Classes' },
            'attr': {'id': 'node_1', 'rel': 'root'}}
        # Test if there are classes present and mark the root
        # as leaf if there are none.
        if classes.count() > 0:
            data['state'] = 'closed'
        return HttpResponse(json.dumps([data]))
    else:
        return HttpResponse(json.dumps(
            tuple({'data' : {'title': '%s (%d)' % (c.class_name, c.id) },
                   'attr' : {'id': 'node_%s' % c.id,
                             'rel': 'class',
                             'name': c.class_name}} for c in classes)))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_ontology(request, project_id=None):
    root_class = request.GET.get('rootclass', None)
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
                response_on_error = 'Could not select the id of any ontology root node'
                # If the no root class is explicitely requested, return all known
                # root classes.
                root_class_ids = []
                if root_class is None:
                    for rc in root_classes:
                        if rc in class_map:
                            root_class_ids.append( class_map[rc] )
                    if len(root_class_ids) == 0:
                        warning = {'warning': 'Could not find any of the known root classes. ' \
                            'Please add at least one of them to build an ontology.'}
                        return HttpResponse(json.dumps(warning))
                else:
                    if root_class not in class_map:
                        raise Exception('Root class "{0}" not found'.format( root_class ))
                    root_class_ids = [ class_map[root_class] ]

                root_node_q = Class.objects.filter(id__in=root_class_ids,
                    project=project_id)

                # Make sure we actually got at least one root node
                if 0 == root_node_q.count():
                    raise Exception("Couldn't select any root node")

                roots = []
                for root_node in root_node_q:
                    root_id = root_node.id
                    root_name = root_node.class_name
                    num_children = ClassClass.objects.filter(
                        class_b=root_id, project=project_id).count()

                    data = {'data': {'title': '%s (%d)' % (root_name, root_id) },
                        'attr': {'id': 'node_%s' % root_id, 'rel': 'root',
                        'cname': root_name}}
                    # Test if there are links present and mark the root
                    # as leaf if there are none.
                    if num_children > 0:
                        data['state'] = 'closed'
                    # Add this root node to the output list
                    roots.append(data)

                return HttpResponse(json.dumps(tuple(r for r in roots)))
            else:
                response_on_error = 'Could not retrieve child nodes.'
                # Select all classes that are linked with the passed relation
                cc_q = ClassClass.objects.filter(class_b=class_b_id,
                    relation=parent_id, project=project_id)

                links = []
                for cc in cc_q:
                    # Get known restrictions
                    restrictions = get_restrictions( cc )
                    restrictions_json = json.dumps( restrictions )
                    # Create name, mark restrictin availability with *
                    node_name = "%s (%d)" % (cc.class_a.class_name, cc.class_a.id)
                    if len(restrictions) > 0:
                        node_name = node_name + "*"
                    # Collect standard jSTree data
                    data = {'data' : {'title': node_name},
                            'attr' : {'id': 'node_%s' % cc.class_a.id,
                                      'rel': 'class',
                                      'restrictions': restrictions_json,
                                      'cname': cc.class_a.class_name,
                                      'ccid': cc.id}}
                    # Only add a 'state' field if this node has children
                    # (i.e. relations where it is class_b).
                    num_children = ClassClass.objects.filter(
                        class_b=cc.class_a.id, project=project_id).count()
                    if num_children > 0:
                        data['state'] = 'closed'
                    # Add this class-class link to the list
                    links.append(data)

                return HttpResponse(json.dumps(tuple(l for l in links)))
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
                                 'classbname': relations[r][0].class_b.class_name,
                                 'classbid': parent_id},
                       'state': 'closed'} for r in relations)))

        else:
            response_on_error = 'Unknown parent type'
            raise Exception(parent_type)

    except Exception as e:
        raise Exception(response_on_error + ': ' + str(e))

def get_restrictions( cc_link ):
    """ Returns a map with <restrition_type> as key and a list
    of data structures, desribing each restriction type.
    """
    restrictions = {}
    # Add cardinality restrictions
    cardinality_restrictions_q = CardinalityRestriction.objects.filter(
        restricted_link=cc_link)
    for cr in cardinality_restrictions_q:
        if 'cardinality' not in restrictions:
            restrictions['cardinality'] = []
        restrictions['cardinality'].append( {'id': cr.id,
            'type': cr.cardinality_type, 'value': cr.value} )

    return restrictions

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_relation_to_ontology(request, project_id=None):
    name = request.POST.get('relname', None)
    uri = request.POST.get('uri', '')
    description = request.POST.get('description', None)
    isreciprocal = bool(request.POST.get('isreciprocal', False))

    if name is None:
        raise Exception("Couldn't find name for new relation.")

    if be_strict:
        # Make sure that there isn't already a relation with this name
        num_r = Relation.objects.filter(project_id = project_id,
            relation_name = name).count()
        if num_r > 0:
            raise Exception("A relation with the name '%s' already exists." % name)

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
            raise Exception("The relation to delete is still referenced by others. If enforced, all related objects get deleted, too.")

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
        raise Exception("Couldn't find name for new class.")

    if be_strict:
        # Make sure that there isn't already a class with this name
        num_c = Class.objects.filter(project_id = project_id,
            class_name = name).count()
        if num_c > 0:
            raise Exception("A class with the name '%s' already exists." % name)

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

    if class_instance.class_name in root_classes and guard_root_classes:
        raise Exception("A root class can't be removed with this method.")

    if not force:
        # Check whether this relation is used somewhere
        nr_links = get_number_of_inverse_links( class_instance )
        if nr_links > 0:
            raise Exception("The class to delete is still referenced by others. If enforced, all related objects get deleted, too.")

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
    exclude_list = root_classes if guard_root_classes else []

    if force:
        rel_q = Class.objects.filter(project=project_id).exclude(class_name__in=exclude_list)
        deleted_ids = [r.id for r in rel_q]
        rel_q.delete()
    else:
        # Check whether a class is used somewhere
        rel_q = Class.objects.filter(project=project_id).exclude(class_name__in=exclude_list)
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
        raise Exception("Couldn't find ID of class a.")
    if classbid == -1:
        raise Exception("Couldn't find ID of class b.")
    if relationid == -1:
        raise Exception("Couldn't find relation ID.")

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

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_restriction(request, project_id=None):
    """ Add a constraint to a class. A constraint is just represented as
    another class which is linked to the class to be constrained with a
    'constrains' relation.
    """
    linkid = int(request.POST.get('linkid', -1))
    constraint = request.POST.get('restriction', "")
    if linkid == -1:
        raise Exception("Couldn't find ID of class-class link.")
    if constraint == "":
        raise Exception("Couldn't find restriction name.")
    # Get the link that should get restricted
    cc_link = get_object_or_404(ClassClass, id=linkid)

    # Depending on the type of the constraint, different parameters
    # are expected.
    if constraint == "cardinality":
        # Get cardinality constraint properties
        cardinality = int(request.POST.get('cardinality', -1))
        cardinality_type = int(request.POST.get('cardinalitytype', -1))
        if cardinality == -1:
            raise Exception("Couldn't find cardinality property.")
        if cardinality_type == -1:
            raise Exception("Couldn't find cardinalitytype property.")
        # Add cardinality restriction
        new_restriction = CardinalityRestriction.objects.create(
            user = request.user,
            project_id = project_id,
            restricted_link = cc_link,
            cardinality_type = cardinality_type,
            value = cardinality)
    else:
        raise Exception("Unsupported restriction type encountered: " + constraint)

    relationid = int(request.POST.get('relid', -1))

    return HttpResponse(json.dumps({'new_restriction': new_restriction.id}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_restriction(request, project_id=None):
    """ Removes a particular restriction.
    """
    rid = int(request.POST.get('restrictionid', -1))
    if rid == -1:
        raise Exception("Couldn't find restriction ID.")
    # Get the restriction that should get deleted
    restriction = get_object_or_404(Restriction, id=rid)
    restriction.delete()

    return HttpResponse(json.dumps({'removed_restriction': rid}))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_restriction_types(request, project_id=None, restriction=None):
    """ Get a list of type IDs and names for a particular restriction.
    """
    if restriction == "cardinality":
        types = CardinalityRestriction.get_supported_types()
        return HttpResponse(json.dumps({'types': types}))
    else:
        raise Exception("Unsupported restriction type encountered: " + restriction)
