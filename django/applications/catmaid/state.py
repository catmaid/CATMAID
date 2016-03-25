import json
import decimal

from django.db import connection


was_edited = """
    SELECT 1 FROM treenode t
    WHERE t.id = %s AND (t.edition_time - %s::timestamptz < '1 ms'::interval)
"""
is_parent = """
    SELECT 1 FROM treenode t
    WHERE t.parent_id = %s AND t.id = %s
"""
is_child = """
    SELECT 1 FROM treenode t
    WHERE t.id = %s AND t.parent_id = %s
"""
is_root = """
    SELECT 1 FROM treenode t
    WHERE t.parent_id IS NULL AND t.id = %s
"""
all_children = """
    SELECT CASE WHEN sub.c=0 THEN 1 ELSE 0 END FROM (
        SELECT COUNT(*) FROM treenode t %s WHERE t.parent_id = %s %s
    ) sub(c)
"""
all_links = """
    SELECT CASE WHEN sub.c=0 THEN 1 ELSE 0 END FROM (
        SELECT COUNT(*) FROM treenode_connector l %s WHERE l.treenode_id = %s %s
    ) sub(c)
"""

class StateCheck:
    """A simple wraper arround state check SQL and parameters for it"""

    def __init__(self, sql, params):
        self.sql = sql
        self.params = params if type(params) in (list, tuple) else (params,)

def make_all_children_query(child_ids, node_id):
    if child_ids:
        table_sql, table_args = list_to_table(child_ids, 1)
        args = table_args
        child_query = " LEFT JOIN {} p(id) ON t.id = p.id ".format(table_sql)
        constraints = "AND p.id IS NULL"
        args.append(node_id)
        return StateCheck(all_children % (child_query, "%s", constraints), args)
    else:
        return StateCheck(all_children % ("", "%s", ""), [node_id])

def make_all_links_query(connector_ids, node_id):
    if connector_ids:
        table_sql, table_args = list_to_table(connector_ids, 2)
        args = table_args
        link_query = """
            LEFT JOIN {} p(cid,rid) ON (l.connector_id = p.cid
            AND l.relation_id = p.rid)
        """.format(table_sql)
        constraints = "AND p.cid IS NULL AND p.rid IS NULL"
        args.append(node_id)
        return StateCheck(all_links % (link_query, "%s", constraints), args)
    else:
        return StateCheck(all_links % ("", "%s", ""), [node_id])

def list_to_table(l, n=1):
    args = None
    if n == 1:
        args = [(e,) for e in l]
    elif n == 2:
        args = [(e[0], e[1]) for e in l]
    if not args:
        raise ValueError("Could't parse list argument in state check")

    records_list_template = ','.join(['%s'] * len(args))
    return ("(VALUES {0})".format(records_list_template), args)

def has_only_truthy_values(element):
    return element[0] and element[1]

def parse_state(state):
    """Expect a JSON string and returned the parsed object."""
    if not state:
        raise ValueError("No state provided")

    if type(state) in (str, unicode):
        state = json.loads(state, parse_float=decimal.Decimal)

    def check_ref(name, ref):
        if type(ref) not in (list, tuple) or len(ref) != 2:
            raise ValueError("Invalid state provided, {} is no list of two elements".format(name))

    def parse_id(name, id):
        try:
            return int(id)
        except TypeError, e:
            raise ValueError("Invalid state, couldn't parse {} id".format(name))

    # Make sure child, parent and link ids are integers
    parent = state.get('parent')
    if parent:
        check_ref('parent', parent)
        parent[0] = parse_id('parent', parent[0])
    children = state.get('children')
    if children:
        if type(children) not in (list, tuple):
            raise ValueError("Invald state provided, 'children' is not a list")
        for c in children:
            check_ref("child", c)
            c[0] = parse_id("child", c[0])
    links = state.get('links')
    if links:
        if type(links) not in (list, tuple):
            raise ValueError("Invald state provided, 'links' is not a list")
        for l in links:
            check_ref("link", l)
            l[0] = parse_id("link", l[0])

    return state

def validate_edge(child_id, parent_id, state, lock=True, cursor=None):
    """Raise an error if either the provided child or parent doesn't match the
    expectations provided by the passded in state.

    Expect state to be a dictionary of of the following form, can be provided
    as a JSON string:
    {
      parent: (<id>, <edition_time>)
      children: [(<id>, <edition_time>)]
    }
    """
    state = parse_state(state)

    # Check parent
    if 'parent' not in state:
        raise ValueError("No valid state provided, missing parent property")
    parent = state['parent']
    if len(parent) != 2:
        raise ValueError("No valid state provided, missing parent node it and edition time")
    if parent[0] != parent_id:
        raise ValueError("No valid state provided, state parent ID doesn't match request")

    state_checks = [StateCheck(was_edited, (parent[0], parent[1]))]

    # Check chilren
    children = state.get('children')
    if not children:
        raise ValueError("No valid state provided, missing children property")
    if not all(has_only_truthy_values(e) for e in children):
        raise ValueError("No valid state provided, invalid children")

    state_checks.extend(StateCheck(was_edited, (c, ct)) for c,ct in children)
    state_checks.extend(StateCheck(is_child, (c, parent[0])) for c,_ in children)

    cursor = cursor or connection.cursor()
    check_state(state_checks, cursor)

    # Acquire lock on parent
    if lock:
        lock_nodes((child_id, parent_id), cursor)

def validate_parent_node_state(parent_id, state, lock=True, cursor=None):
    """Raise an error if there are nodes that don't match the expectations
    provided by the passded in state.

    Expect state to be a dictionary of of the following form, can be provided
    as a JSON string:
    {
      parent: (<id>, <edition_time>)
    }
    """
    state = parse_state(state)

    # Check parent input
    if 'parent' not in state:
        raise ValueError("No valid state provided, missing parent property")
    parent = state['parent']
    if len(parent) != 2:
        raise ValueError("No valid state provided, missing parent node it and edition time")

    if parent[0] != parent_id:
        raise ValueError("No valid state provided, state parent ID doesn't match request")

    state_checks = [StateCheck(was_edited, (parent[0], parent[1]))]

    cursor = cursor or connection.cursor()
    check_state(state_checks, cursor)

    # Acquire lock on parent
    if lock:
        lock_node(parent_id, cursor)

def validate_node_state(node_id, state, lock=True, cursor=None):
    """Raise an error if there are nodes that don't match the expectations
    provided by the passded in state.

    Expect state to be a dictionary of of the following form, can be provided
    as a JSON string:
    {
      parent: (<id>, <edition_time>),
      children: ((<child_id>, <child_edition_time>), ...),
      links: ((<connector_id>, <connector_edition_time>, <relation_id>), ...)
    }
    """
    state = parse_state(state)

    if 'edition_time' not in state:
        raise ValueError("No valid state provided, missing edition time")
    node = [node_id, state['edition_time']]
    parent, children, links = state['parent'], state['children'], state['links']

    if 2 != len(parent):
        raise ValueError("No valid state provided, invalid parent")

    parent_id = parent[0]

    if parent_id and -1 != parent_id and not parent[1]:
        raise ValueError("No valid state provided, invalid parent")
    if not (isinstance(children, (list, tuple)) and isinstance(links, (list, tuple))):
        raise ValueError("No valid state provided")
    if not all(has_only_truthy_values(e) for e in children):
        raise ValueError("No valid state provided, invalid children")
    if not all(has_only_truthy_values(e) for e in links):
        raise ValueError("No valid state provided, invalid links")

    # Make sure the node itself is valid
    state_checks = [StateCheck(was_edited, (node[0], node[1]))]

    # Collect qurey components, startwith parent relation
    if parent_id and -1 != parent_id:
        state_checks.append(StateCheck(is_parent, (parent_id, node_id)))
        state_checks.append(StateCheck(was_edited, (parent_id, parent[1])))
    else:
        state_checks.append(StateCheck(is_root, (node_id,)))

    # Check chilren
    state_checks.append(make_all_children_query(
        [int(c[0]) for c in children], node[0]))
    state_checks.extend(StateCheck(was_edited, (c[0], c[1])) for c in children)
    state_checks.extend(StateCheck(is_child, (c[0],node_id)) for c in children)

    # Check connector links
    state_checks.append(make_all_links_query(
        [(int(l[0]), int(l[2])) for l in links], node[0]))

    # Collect results
    cursor = cursor or connection.cursor()
    check_state(state_checks, cursor)

    # Acquire lock on treenode
    if lock:
        lock_node(node_id, cursor)

def lock_node(node_id, cursor):
    cursor.execute("""
        SELECT id FROM treenode WHERE id=%s FOR UPDATE
    """, (node_id,))

def lock_nodes(node_ids, cursor):
    node_template = ",".join(("%s",) * len(node_ids))
    cursor.execute("""
        SELECT id FROM treenode WHERE id IN ({}) FOR UPDATE
    """.format(node_template), node_ids)

def check_state(state_checks, cursor):
    """Raise an error if state checks can't be passed."""
    sql_checks = [sc.sql for sc in state_checks]
    args = []
    for sc in state_checks:
        args.extend(p for p in sc.params)

    cursor.execute("(" + ") INTERSECT (".join(sql_checks) + ")", args)
    state_check_results = cursor.fetchall()

    # Expect results to have a length of the number of checks made and that
    # each result equals one.
    if not state_check_results or 1 != len(state_check_results) or 1 != state_check_results[0][0]:
        raise ValueError("The provided state differs from the database state")
