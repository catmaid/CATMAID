# -*- coding: utf-8 -*-

import json
import numpy as np
from typing import Any, Dict, List

from django.http import HttpRequest, JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404

from catmaid.models import UserRole, Relation, Class, ClassClass, Restriction, \
        CardinalityRestriction
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import (get_relation_to_id_map, get_class_to_id_map,
        get_request_bool)


# Root classes can be seen as namespaces in the semantic space. Different
# tools use different root classes.
root_classes = ['root', 'classification_root']

# Root classes can be treated special if wanted. If set to True root
# classes won't appear an the class overview and can't be deleted
guard_root_classes = False

# In strict mode, it is not allowed to add relations and classes that
# have the same name like already present ones
be_strict = True

# Names of new classes and relations will be trimmed automatically,
# if trim_names is true.
trim_names = True

class ClassElement:
    def __init__(self, id, name):
        self.id = id
        self.name = name

class Feature:
    """ A small container to keep a list of class-class links.
    """
    def __init__(self, class_class_links):
        self.links = class_class_links
        if self.links:
            self.short_name = ",".join(
                [l.class_a.class_name for l in self.links] )
            self.name = "%s: %s" % (self.links[0].class_b.class_name, self.short_name)
        else:
            raise ValueError("A feature needs at least one element")

    def __str__(self):
        return self.__unicode__()

    def __unicode__(self):
        return self.name

    def __len__(self):
        return len(self.links)

class FeatureLink:
    def __init__(self, class_a, class_b, relation, super_class = None):
        self.class_a = class_a
        self.class_b = class_b
        self.relation = relation
        self.super_class = super_class

    def __str__(self):
        return self.__unicode__()

    def __unicode__(self) -> str:
        return "[CA {}: {} R {}: {} CB {}: SC {}: {}]".format(self.class_a.id,
                self.class_a, self.relation.id, self.relation, self.class_b.id,
                self.class_b, self.super_class.id, self.super_class)

def get_known_ontology_roots(request:HttpRequest) -> JsonResponse:
    """ Returns an array of all known root class names.
    """
    return JsonResponse({"knownroots": root_classes})

def get_existing_roots(request:HttpRequest, project_id) -> JsonResponse:
    """Get all existing classification root nodes for a project.
    """
    links = get_class_links_qs(project_id, 'is_a', 'classification_root')
    links = links.select_related('class_a')

    return JsonResponse({
        'root_classes': [{
            'id': l.class_a.id,
            'name': l.class_a.class_name
        } for l in links]
    })

def get_children(parent_id, max_nodes:int = 5000):
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
def get_available_relations(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a simple list of all relations available available
    for the given project."""
    relation_map = get_relation_to_id_map(project_id)
    return JsonResponse(relation_map)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_available_classes(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a simple list of all classes available available
    for the given project."""
    class_map = get_class_to_id_map(project_id)
    return JsonResponse(class_map)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_available_relations(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns an object of all relations available available
    for the given project, prepared to work with a jsTree."""
    parent_id = int(request.GET.get('parentid', 0))

    # Get the relations queryset
    relations = Relation.objects.filter(project=project_id)

    if 0 == parent_id:
        data = {
            'id': 'relations',
            'text': 'Relations',
            'type': 'root'
        } # type: Dict[str, Any]
        # Test if there are relations present and mark the root
        # as leaf if there are none.
        if relations.count() > 0:
            data['state'] = {
                'opened': False
            }
        return JsonResponse([data], safe=False)

    return JsonResponse(tuple({
        'id': r.id,
        'text': '%s (%d)' % (r.relation_name, r.id),
        'type': 'relation',
        'name': r.relation_name
    } for r in relations), safe=False)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_available_classes(request:HttpRequest, project_id=None) -> JsonResponse:
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
        data = {
            'id': 'classes',
            'text': 'Classes',
            'type': 'root'
        } # type: Dict[str, Any]
        # Test if there are classes present and mark the root
        # as leaf if there are none.
        if classes.count() > 0:
            data['state'] = {
                'opened': False
            }
        return JsonResponse([data], safe=False)
    else:
        return JsonResponse(
            tuple({
                'id': c.id,
                'text': '%s (%d)' % (c.class_name, c.id),
                'type': 'class',
                'name': c.class_name
            } for c in classes), safe=False)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    root_class = request.GET.get('rootclass', None)
    parent_id = int(request.GET.get('parentid', 0))
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
                        return JsonResponse(warning)
                else:
                    if root_class not in class_map:
                        raise Exception('Root class "{0}" not found'.format( root_class ))
                    root_class_ids = [ class_map[root_class] ]

                root_node_q = Class.objects.filter(id__in=root_class_ids,
                    project=project_id)

                # Make sure we actually got at least one root node
                if 0 == len(root_node_q):
                    raise Exception("Couldn't select any root node")

                roots = []
                for root_node in root_node_q:
                    root_id = root_node.id
                    root_name = root_node.class_name
                    num_children = ClassClass.objects.filter(
                        class_b=root_id, project=project_id).count()

                    data = {
                        'id': root_id,
                        'text': '%s (%d)' % (root_name, root_id),
                        'type': 'root',
                        'cname': root_name
                    }
                    # Test if there are links present and mark the root
                    # as leaf if there are none.
                    if num_children > 0:
                        data['state'] = {
                            'opened': False
                        }
                    # Add this root node to the output list
                    roots.append(data)

                return JsonResponse(tuple(r for r in roots), safe=False)
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
                    data = {
                        'id': cc.class_a.id,
                        'text': node_name,
                        'type': 'class',
                        'restrictions': restrictions_json,
                        'cname': cc.class_a.class_name,
                        'ccid': cc.id
                    }

                    # Only add a 'state' field if this node has children
                    # (i.e. relations where it is class_b).
                    num_children = ClassClass.objects.filter(
                        class_b=cc.class_a.id, project=project_id).count()
                    if num_children > 0:
                        data['state'] = {
                            'opened': False
                        }
                    # Add this class-class link to the list
                    links.append(data)

                return JsonResponse(tuple(l for l in links), safe=False)
        elif parent_type in ("class", "root"):
            # A relation is wanted
            cc_q = ClassClass.objects.filter(
                project=project_id, class_b_id=parent_id)
            # Combine same relations into one
            relations = {} # type: Dict
            for cc in cc_q:
                if cc.relation not in relations:
                    relations[ cc.relation ] = []
                relations[ cc.relation ].append( cc )

            return JsonResponse(tuple({
                'id': r.id,
                'text': '%s (%d)' % (r.relation_name, r.id),
                'type': 'relation',
                'name': r.relation_name,
                'classbname': relations[r][0].class_b.class_name,
                'classbid': parent_id
            } for r in relations), safe=False)
        else:
            response_on_error = 'Unknown parent type'
            raise Exception(parent_type)

    except Exception as e:
        raise Exception(response_on_error + ': ' + str(e))

def get_restrictions(cc_link) -> Dict[str, Dict[str, Any]]:
    """ Returns a map with <restrition_type> as key and a list
    of data structures, desribing each restriction type.
    """
    restrictions = {} # type: Dict
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
def add_relation_to_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    name = request.POST.get('relname', None)
    uri = request.POST.get('uri', '')
    description = request.POST.get('description', None)
    isreciprocal = bool(request.POST.get('isreciprocal', False))
    silent = get_request_bool(request.POST, 'silent', False)

    if name is None:
        raise Exception("Couldn't find name for new relation.")

    if trim_names:
        name = name.strip()

    if be_strict:
        # Make sure that there isn't already a relation with this name
        num_r = Relation.objects.filter(project_id = project_id,
            relation_name = name).count()
        if num_r > 0:
            if silent:
                return JsonResponse({
                    'already_present': True
                })
            else:
                raise Exception("A relation with the name '%s' already exists." % name)

    r = Relation.objects.create(user=request.user,
        project_id = project_id, relation_name = name, uri = uri,
        description = description, isreciprocal = isreciprocal)

    return JsonResponse({'relation_id': r.id})

def get_number_of_inverse_links(obj) -> int:
    """ Returns the number of links that other model objects
    have to the passed object. It seems to be alright to do it like this:
    http://mail.python.org/pipermail//centraloh/2012-December/001492.html
    """
    count = 0
    related_objects = [
        f for f in obj._meta.get_fields()
        if (f.one_to_many or f.one_to_one)
        and f.auto_created and not f.concrete
    ]

    for r in related_objects:
        count += r.related_model.objects.filter(
            **{r.field.name + '__exact': obj.id}).count()
    return count

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def rename_class(request:HttpRequest, project_id=None) -> JsonResponse:
    # Get class
    class_id = request.POST.get('classid', None)
    if not class_id:
        raise Exception("No class id was provided!")
    class_id = int(class_id)
    class_obj  = get_object_or_404(Class, id=class_id)
    # Get new name
    new_name = request.POST.get('newname', None)
    if not new_name:
        raise Exception("No new name was provided!")

    # Make sure the name is not the same as before
    if class_obj.class_name == new_name:
        raise Exception("The new ralation name equals the current one!")

    # If in strict mode, try to find a class that already
    # has the requested name.
    if be_strict:
        same_name_count = Class.objects.filter(class_name=new_name).count()
        if same_name_count > 0:
            raise Exception("There is already a class named '%s'!" % new_name)

    # Rename class to new name
    class_obj.class_name = new_name
    class_obj.save()

    return JsonResponse({'renamed_class': class_id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def rename_relation(request:HttpRequest, project_id=None) -> JsonResponse:
    # Get relation
    rel_id = request.POST.get('relid', None)
    if not rel_id:
        raise Exception("No relation id was provided!")
    rel_id = int(rel_id)
    relation = get_object_or_404(Relation, id=rel_id)
    # Get new name
    new_name = request.POST.get('newname', None)
    if not new_name:
        raise Exception("No new name was provided!")

    # Make sure the name is not the same as before
    if relation.relation_name == new_name:
        raise Exception("The new ralation name equals the current one!")

    # If in strict mode, try to find a relation that already
    # has the requested name.
    if be_strict:
        same_name_count = Relation.objects.filter(relation_name=new_name).count()
        if same_name_count > 0:
            raise Exception("There is already a relation named '%s'!" % new_name)

    # Rename relation to name
    relation.relation_name = new_name
    relation.save()

    return JsonResponse({'renamed_relation': rel_id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_relation_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
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
    return JsonResponse({'deleted_relation': relid})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_relations_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    force = bool(int(request.POST.get('force', 0)))
    deleted_ids = [] # type: List
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

    return JsonResponse({
        'deleted_relations': deleted_ids,
        'not_deleted_relations': not_deleted_ids
    })

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_class_to_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    name = request.POST.get('classname', None)
    description = request.POST.get('description', None)
    silent = get_request_bool(request.POST, 'silent', False)

    if name is None:
        raise Exception("Couldn't find name for new class.")

    if trim_names:
        name = name.strip()

    if be_strict:
        # Make sure that there isn't already a class with this name
        num_c = Class.objects.filter(project_id = project_id,
            class_name = name).count()
        if num_c > 0:
            if silent:
                return JsonResponse({
                    'already_present': True,
                })
            else:
                raise Exception("A class with the name '%s' already exists." % name)

    c = Class.objects.create(user=request.user,
        project_id = project_id, class_name = name,
        description = description)

    return JsonResponse({'class_id': c.id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_class_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
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
    return JsonResponse({'deleted_class': classid})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_classes_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Removes all classes from the ontology of a particular project.
    The root classes will be excluded from this and can't be removed
    with this method
    """
    force = bool(int(request.POST.get('force', 0)))
    deleted_ids = [] # type: List
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

    return JsonResponse({
        'deleted_classes': deleted_ids,
        'not_deleted_classes': not_deleted_ids
    })

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_link_to_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
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

    return JsonResponse({'class_class_id': cc.id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_link_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Removes one class-class link for a given project. Which link
    gets removed is determined by the ID passed in the POST data.
    """
    ccid = int(request.POST.get('ccid', -1))
    link = get_object_or_404(ClassClass, id=ccid)
    link.delete()
    return JsonResponse({'deleted_link': ccid})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_selected_links_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
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

    return JsonResponse({'deleted_links': removed_links})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_all_links_from_ontology(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Removes all class-class links for a given project.
    """
    cc_q = ClassClass.objects.filter(user=request.user,
        project_id = project_id)

    removed_links = []
    for cc in cc_q:
        removed_links.append(cc.id)
    cc_q.delete()

    return JsonResponse({'deleted_links': removed_links})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def add_restriction(request:HttpRequest, project_id=None) -> JsonResponse:
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

    return JsonResponse({'new_restriction': new_restriction.id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_restriction(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Removes a particular restriction.
    """
    rid = int(request.POST.get('restrictionid', -1))
    if rid == -1:
        raise Exception("Couldn't find restriction ID.")
    # Get the restriction that should get deleted
    restriction = get_object_or_404(Restriction, id=rid)
    restriction.delete()

    return JsonResponse({'removed_restriction': rid})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_restriction_types(request:HttpRequest, project_id=None, restriction=None) -> JsonResponse:
    """ Get a list of type IDs and names for a particular restriction.
    """
    if restriction == "cardinality":
        types = CardinalityRestriction.get_supported_types()
        return JsonResponse({'types': types})
    else:
        raise Exception("Unsupported restriction type encountered: " + restriction)

def get_class_links_qs(project_id, rel_name, class_name, class_is_b=True):
    """ Returns a list of all classes, that have a certain relationship
    to a particular class in a project's semantic space.
    """
    relation = Relation.objects.filter(relation_name=rel_name,
        project_id=project_id)
    other_class = Class.objects.filter(class_name=class_name,
        project_id=project_id)
    # Get all classes with the given relation to the given class
    # (if present).
    if class_is_b:
        cici_q = ClassClass.objects.filter(project_id=project_id,
            relation__in=relation, class_b__in=other_class)
    else:
        cici_q = ClassClass.objects.filter(project_id=project_id,
            relation__in=relation, class_a__in=other_class)
    return cici_q

def get_by_graphs_instantiated_features(graphs, features) -> List:
    # Needs to be imported locally to avoid circular dependencies
    # TODO Fix this issue somehow
    from catmaid.control.classification import graphs_instantiate_features
    matrix = np.zeros((len(graphs),len(features)), dtype=np.int)
    graphs_instantiate_features(graphs, features, matrix)
    # Find features that are instantiated
    used_features = set()
    for ng,g in enumerate(graphs):
        for nf,f in enumerate(features):
            if 1 == matrix[ng][nf]:
                used_features.add(f)

    return list(used_features)

def get_features(ontology, workspace_pid, graphs, add_nonleafs=False, only_used_features=False) -> List:
    """ Return a list of Feature instances which represent paths
    to leafs of the ontology.
    """
    feature_lists = get_feature_paths(ontology, workspace_pid, add_nonleafs)
    features = [Feature(fl) for fl in feature_lists]
    if only_used_features and features:
        used_features = get_by_graphs_instantiated_features(graphs, features)
        return used_features
    else:
        return features

def get_feature_paths(ontology, workspace_pid, add_nonleafs=False, depth=0, max_depth=100) -> List:
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships.
    """
    return get_feature_paths_remote(ontology, workspace_pid, add_nonleafs, depth, max_depth)

def get_feature_paths_remote(ontology, workspace_pid, add_nonleafs=False, depth=0, max_depth=100) -> List:
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships. It uses an implementation stored remotely in the
    database server. It needs three database queries in total.
    """

    query = "SELECT * FROM get_feature_paths(%s, %s, %s, %s, %s);" % \
        (ontology.id, workspace_pid, add_nonleafs, depth, max_depth)

    # Run query
    cursor = connection.cursor()
    cursor.execute(query)

    # Parse result
    class_ids = set()
    relation_ids = set()
    rows = cursor.fetchall()
    for r in rows:
        # We get back tuples of feature links with each consisting of the
        # IDs of class_a, class_b, relation and a super class. To create
        # FeatureLink objects out of this, we need to get the class objects
        # first. So collect all class IDs we have got.
        # The link data can be found in the first row of the result set
        if not r:
            raise Exception('Could not parse feature path data received from data base.')
        for link_data in r[0]:
            class_ids.add(link_data[0])
            class_ids.add(link_data[1])
            relation_ids.add(link_data[2])
            if link_data[3]:
                class_ids.add(link_data[3])

    # Get all needed class and relation model objects
    classes = Class.objects.in_bulk(class_ids)
    relations = Relation.objects.in_bulk(relation_ids)

    # Create feature links
    features = []
    for r in rows:
        feature = []
        for link_data in r[0]:
            class_a = classes[link_data[0]]
            class_b = classes[link_data[1]]
            relation = relations[link_data[2]]
            super_a = classes.get(link_data[3], None)
            fl = FeatureLink(class_a, class_b, relation, super_a)
            feature.append(fl)
        features.append(feature)

    return features

def get_feature_paths_simple(ontology, add_nonleafs=False, depth=0, max_depth=100) -> List:
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships.
    """
    features = []
    # Get all links, but exclude 'is_a' relationships
    links_q = ClassClass.objects.filter(class_b_id=ontology.id).exclude(
        relation__relation_name='is_a')
    # Check if this link is followed by an 'is_a' relatiship. If so
    # use the classes below.
    feature_links = []
    for link in links_q:
        is_a_links_q = ClassClass.objects.filter(class_b_id=link.class_a.id,
            relation__relation_name='is_a')
        # Add all sub-classes instead of the root if there is at least one.
        if is_a_links_q.count() > 0:
            for is_a_link in is_a_links_q:
                fl = FeatureLink(is_a_link.class_a, link.class_b, link.relation, link.class_a)
                feature_links.append(fl)
        else:
            fl = FeatureLink(link.class_a, link.class_b, link.relation)
            feature_links.append(fl)

    # Look at the feature link paths
    for flink in feature_links:
        add_single_link = False

        if depth < max_depth:
            # Get features of the current feature's class a
            child_features = get_feature_paths( flink.class_a, add_nonleafs, depth+1 )
            # If there is a super class, get the children in addition
            # to the children of the current class.
            if flink.super_class:
                child_features = child_features + \
                    get_feature_paths( flink.super_class, add_nonleafs, depth+1 )

            # Remember the path to this node as feature if a leaf is reached
            # or if non-leaf nodes should be added, too.
            is_leaf = (len(child_features) == 0)
            add_single_link = is_leaf or add_nonleafs
            for cf in child_features:
                features.append( [flink] + cf )
        else:
            # Add current node if we reached the maximum depth
            # and don't recurse any further.
            add_single_link = True

        # Add single link if no more children are found/wanted
        if add_single_link:
            features.append( [flink] )

    return features
