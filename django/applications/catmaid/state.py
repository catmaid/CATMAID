import json
import decimal

from django.db import connection


was_edited = """
    SELECT 1 FROM treenode t
    WHERE t.id = %s AND (t.edition_time - '%s'::timestamptz < '1 ms'::interval)
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

def make_all_children_query(child_ids, node_id):
    if child_ids:
        child_query = " LEFT JOIN {} p(id) ON t.id = p.id ".format(
            list_to_table(child_ids))
        constraints = "AND p.id IS NULL"
    else:
        child_query = ""
        constraints = ""
    return all_children % (child_query, node_id, constraints)

def make_all_links_query(connector_ids, node_id):
    if connector_ids:
        link_query = """
            LEFT JOIN {} p(cid,rid) ON (l.connector_id = p.cid
            AND l.relation_id = p.rid)
        """.format(list_to_table(connector_ids, 2))
        constraints = "AND p.cid IS NULL AND p.rid IS NULL"
    else:
        link_query = ""
        constraints = ""
    return all_links % (link_query, node_id, constraints)

def list_to_table(l, n=1):
    if n < 2:
        return "(VALUES {})".format(','.join("({})".format(e) for e in l))
    elif n == 2:
        return "(VALUES {})".format(','.join("({},{})".format(e[0], e[1]) for e in l))
    else:
        raise ValueError("Not implemented")

def has_only_truthy_values(element):
    return element[0] and element[1]

def validate_node_state(node_id, state, lock, cursor=None):
    """Raise an error if there are nodes that

    Expect state to be a dictionary of of the following form, can be provided
    as a JSON string:
    {
      parent: (<id>, <edition_time>),
      children: ((<child_id>, <child_edition_time>), ...),
      links: ((<connector_id>, <connector_edition_time>, <relation_id>), ...)
    }
    """
    if not state:
        raise ValueError("No state provided")

    if type(state) in (str, unicode):
        state = json.loads(state, parse_float=decimal.Decimal)
    print state

    if 'edition_time' not in state:
        raise ValueError("No valid state provided, missing edition time")
    node = [node_id, state['edition_time']]
    parent, children, links = state['parent'], state['children'], state['links']
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
    state_checks = [was_edited % (node[0], node[1])]

    # Collect qurey components, startwith parent relation
    if parent_id and -1 != parent_id:
        state_checks.append(is_parent % (parent_id, node_id))
        state_checks.append(was_edited % (parent_id, parent[1]))
    else:
        state_checks.append(is_root % node_id)

    # Check chilren
    state_checks.append(make_all_children_query(
        [c[0] for c in children], node[0]))
    state_checks.extend((was_edited % (c[0], c[1])) for c in children)
    state_checks.extend(is_child % (k,node_id) for k,v in children)

    # Check connector links
    state_checks.append(make_all_links_query(
        [(l[0],l[2]) for l in links], node[0]))

    # Collect results
    cursor = cursor or connection.cursor()
    cursor.execute("(" + ") INTERSECT (".join(state_checks) + ")")
    state_check_results = cursor.fetchall()

    # Expect results to have a length of the number of checks made and that
    # each result equals one.
    if not state_check_results or 1 != len(state_check_results) or 1 != state_check_results[0][0]:
        raise ValueError("The provided state differs from the database state")

    # Acquire lock on treenode
    if lock:
        cursor.execute("""
            SELECT id FROM treenode WHERE id=%s FOR UPDATE
        """, (node_id,))
