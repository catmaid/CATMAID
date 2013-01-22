from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

# A dummy project is referenced by all the classes and class instances.
# This is due to the fact, that one classification tree instance should
# be referencey by multiple projects.
dummy_pid = -1

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
                    'attr': {'id': 'node_%s' % root_id, 'rel': 'class'},
                    'state': 'closed'}]))
            else:
                response_on_error = 'Could not retrieve child nodes.'
                # Select all classes that are linked with the passed relation
                cc_q = ClassClass.objects.filter(class_b=class_b_id,
                    relation=parent_id, project=project_id)

                return HttpResponse(json.dumps(
                    tuple({'data' : {'title': '%s (%d)' % (cc.class_a.class_name, cc.class_a.id)},
                           'attr' : {'id': 'node_%s' % cc.class_a.id,
                                     'rel': 'class'},
                           'state': 'closed'} for cc in cc_q)))
        elif parent_type == "class":
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
                                 'classbid': parent_id},
                       'state': 'closed'} for r in relations)))

        else:
            response_on_error = 'Unknown parent type'
            raise CatmaidException(parent_type)

    except Exception as e:
        raise CatmaidException(response_on_error + ': ' + str(e))
