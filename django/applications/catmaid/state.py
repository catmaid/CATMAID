# -*- coding: utf-8 -*-

import decimal
import json
from typing import Any, Dict, List, Optional, Tuple, Union

from django.db import connection
from functools import reduce


class StateMatchingError(Exception):
    """Indicates that a state check wasn't successful"""
    def __init__(self, message, state):
        super(StateMatchingError, self).__init__(message)
        self.unmatched_state = state

    def __str__(self) -> str:
        return "{}: {}".format(self.args[0],
            str(self.unmatched_state) or "(no details found)")


class SQL:
    was_edited = """
        SELECT 1 FROM location t
        WHERE t.id = %s
        AND t.edition_time >=(%s::timestamptz - '1 ms'::interval)
        AND t.edition_time < (%s::timestamptz + '1 ms'::interval)
        LIMIT 1
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
    all_links_c = """
        SELECT CASE WHEN sub.c=0 THEN 1 ELSE 0 END FROM (
            SELECT COUNT(*) FROM treenode_connector l %s WHERE l.connector_id = %s %s
        ) sub(c)
    """

    @staticmethod
    def edited(table):
        return """
            SELECT 1 FROM {} t
            WHERE t.id = %s
            AND t.edition_time >=(%s::timestamptz - '1 ms'::interval)
            AND t.edition_time < (%s::timestamptz + '1 ms'::interval)
        """.format(table)

class StateCheck:
    """A simple wraper arround state check SQL and parameters for it"""

    def __init__(self, sql, params):
        if not isinstance(sql, str):
            raise ValueError("No SQL string")
        self.sql = sql
        self.params = params if type(params) in (list, tuple) else (params,)

    def __str__(self) -> str:
        return "SQL: {} Parameters: {}".format(self.sql, self.params)

def make_all_children_query(child_ids, node_id) -> StateCheck:
    if child_ids:
        table_sql, table_args = list_to_table(child_ids, 1)
        args = table_args
        child_query = " LEFT JOIN {} p(id) ON t.id = p.id ".format(table_sql)
        constraints = "AND p.id IS NULL"
        args.append(node_id)
        return StateCheck(SQL.all_children % (child_query, "%s", constraints), args)
    else:
        return StateCheck(SQL.all_children % ("", "%s", ""), [node_id])

def make_all_links_query(link_ids, node_id, is_connector=False) -> StateCheck:
    template = SQL.all_links_c if is_connector else SQL.all_links
    if link_ids:
        table_sql, table_args = list_to_table(link_ids, 1)
        args = table_args
        link_query = " LEFT JOIN {} p(id) ON l.id = p.id ".format(table_sql)
        constraints = "AND p.id IS NULL"
        args.append(node_id)
        return StateCheck(template % (link_query, "%s", constraints), args)
    else:
        return StateCheck(template % ("", "%s", ""), [node_id])

def list_to_table(l, n=1) -> Tuple[str, Any]:
    if n == 1:
        args = [(e,) for e in l] # type: List[Tuple]
    elif n == 2:
        args = [(e[0], e[1]) for e in l]
    else:
        raise ValueError("Invalid n parameter for list_to_table")
    if not args: # empty l or invalid n
        raise ValueError("Could't parse list argument in state check")

    records_list_template = ','.join(['%s'] * len(args))
    return ("(VALUES {0})".format(records_list_template), args)

def has_only_truthy_values(element, n=2) -> bool:
    return n == len(element) and all(element)

def parse_state(state):
    """Expect a JSON string and returned the parsed object."""
    if not state:
        raise ValueError("No state provided")

    if isinstance(state, str):
        state = json.loads(state, parse_float=decimal.Decimal)

    def check_ref(name, ref):
        if type(ref) not in (list, tuple) or len(ref) != 2:
            raise ValueError("Invalid state provided, {} is no list of two elements".format(name))

    def parse_id(name, id):
        try:
            return int(id)
        except (ValueError, TypeError):
            raise ValueError("Invalid state provided, couldn't parse {} id: {}".format(name, id))

    # Make sure child, parent and link ids are integers
    parsed_state_type = type(state)
    if parsed_state_type == dict:
        parent = state.get('parent')
        if parent:
            check_ref('parent', parent)
            # Allow parent to be None, as an alternative way to say there is no
            # parent.
            parent[0] = None if not parent[0] else parse_id('parent', parent[0])
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
    elif parsed_state_type == list:
        for n in state:
            check_ref('node', n)
            n[0] = parse_id('node', n[0])

    return state

def collect_state_checks(node_id, state, cursor, node=False,
        parent_edittime=False, is_parent=False, children=False,
        links=False, c_links=False, multinode=False) -> List[StateCheck]:
    """Collect state checks for a single node, but don't execute them.

    If <children> is a list of node IDs, only these nodes will be checked if
    they are valid children. If <children> is the boolean True, a state check is
    added that tests if the state provided children represent *all* children.
    """
    state_checks = [] # type: List

    if node:
        if 'edition_time' not in state:
            raise ValueError("No valid state provided, missing edition time")
        node = [node_id, state['edition_time']]

        # Make sure the node itself is valid
        state_checks = [StateCheck(SQL.was_edited, (node[0], node[1], node[1]))]
    else:
        node = [node_id]

    if parent_edittime or is_parent:
        parent = state.get('parent')
        if not parent:
            parent_id = None
        elif 2 != len(parent):
            raise ValueError("No valid state provided, invalid parent")
        else:
            parent_id = parent[0]

        if parent_id and -1 != parent_id and not parent[1]:
            raise ValueError("No valid state provided, invalid parent")

        # Collect qurey components, startwith parent relation
        if parent_id and -1 != parent_id:
            if is_parent:
                if parent_id == node_id:
                    raise ValueError("No valid state provided, parent is same as node ({})".format(parent_id))
                state_checks.append(StateCheck(SQL.is_parent, (parent_id, node_id)))
            state_checks.append(StateCheck(SQL.was_edited,
                (parent_id, parent[1], parent[1])))
        else:
            state_checks.append(StateCheck(SQL.is_root, (node_id,)))

    if children:
        child_nodes = state.get('children')
        if not isinstance(child_nodes, (list, tuple)):
            raise ValueError("No valid state provided, can't find list 'children'")
        if not all(has_only_truthy_values(e) for e in child_nodes):
            raise ValueError("No valid state provided, invalid children")

        if type(children) == bool:
            state_checks.append(make_all_children_query(
                [int(c[0]) for c in child_nodes], node_id))
        state_checks.extend(StateCheck(SQL.was_edited, (c[0], c[1], c[1])) for c in child_nodes)
        state_checks.extend(StateCheck(SQL.is_child, (c[0], node_id)) for c in child_nodes)

    if links:
        links = state.get('links')
        if not isinstance(links, (list, tuple)):
            raise ValueError("No valid state provided, can't find list 'links'")
        if not all(has_only_truthy_values(e) for e in links):
            raise ValueError("No valid state provided, invalid links")

        state_checks.append(make_all_links_query(
            [int(l[0]) for l in links], node_id))
        state_checks.extend(StateCheck(SQL.edited('treenode_connector'),
            (l[0], l[1], l[1])) for l in links)

    if c_links:
        c_links = state.get('c_links')
        if not isinstance(c_links, (list, tuple)):
            raise ValueError("No valid state provided, can't find list 'c_links'")
        if not all(has_only_truthy_values(e) for e in c_links):
            raise ValueError("No valid state provided, invalid links")

        state_checks.append(make_all_links_query(
            [int(l[0]) for l in c_links], node_id, True))
        state_checks.extend(StateCheck(SQL.edited('treenode_connector'),
            (l[0], l[1], l[1])) for l in c_links)


    return state_checks

def validate_state(node_ids, state, node=False, is_parent=False,
        parent_edittime=False, children=False, links=False, c_links=False,
        multinode=False, neighborhood=False, lock=True, cursor=None) -> None:
    """Validate a local state relative to a given node. What tests are performed
    depends on the mode flags set.

    Modes are hierarchical: neighborhood implies node, is_parent,
    parent_edittime, children and links. A edge implies is_parent,
    parent_edittime and children. The special mode "multinode" voids others and
    expects a list of two-element-lists containing node IDs and edition times,
    which will be checked.

    Expect state to be a dictionary of of the following form, can be provided
    as a JSON string. Only entry for set flags need to be present:
    {
      parent: (<id>, <edition_time>),
      children: ((<child_id>, <child_edition_time>), ...),
      links: ((<connector_id>, <connector_edition_time>, <relation_id>), ...)
    }
    """
    state = parse_state(state)

    # Make sure input nodes are iterable
    if type(node_ids) not in (list, tuple):
        node_ids = (node_ids,)

    # Neighborhood implies node and parent checks
    node = node or neighborhood
    is_parent = is_parent or neighborhood
    parent_edittime = parent_edittime or neighborhood
    children = children or neighborhood
    links = links or neighborhood

    # Collect state checks and test them, if state checks are not disabled
    if not is_disabled(state):
        cursor = cursor or connection.cursor()
        if multinode:
            node_id_set = set(node_ids)
            unseen = set(node_ids)
            for node_state in state:
                node_id = node_state[0]
                if node_id not in node_id_set:
                    raise ValueError("Couldn't find node in state: {}".format(node_id))
                unseen.remove(node_id)
            if len(unseen) > 0:
                raise ValueError("Couldn't find state info on node(s) {}".format(
                    ", ".join(str(n) for n in unseen)))
            state_checks = []
            for node_state in state:
                state_checks.append(StateCheck(SQL.was_edited,
                    (node_state[0], node_state[1], node_state[1])))
            check_state(state, state_checks, cursor)
        else:
            check_sets = [collect_state_checks(n, state, cursor, node=node,
                    is_parent=is_parent, parent_edittime=parent_edittime,
                    multinode=multinode, children=children, links=links,
                    c_links=c_links) for n in node_ids]
            # Flatten list of per-node state checks into one list of checks
            state_checks = reduce(lambda x, y: x + y, check_sets)
            check_state(state, state_checks, cursor)

    # Acquire lock on treenode
    if lock:
        cursor = cursor or connection.cursor()
        lock_nodes(node_ids, cursor)

def lock_node(node_id, cursor) -> None:
    cursor.execute("""
        SELECT id FROM treenode WHERE id=%s FOR UPDATE
    """, (node_id,))
    result = cursor.fetchall()

def lock_nodes(node_ids, cursor) -> None:
    if node_ids:
        node_template = ",".join(("%s",) * len(node_ids))
        cursor.execute("""
            SELECT id FROM treenode WHERE id IN ({}) FOR UPDATE
        """.format(node_template), node_ids)
    else:
        raise ValueError("No nodes to lock")

def is_disabled(state) -> bool:
    return state and type(state) == dict and state.get('nocheck') is True

def make_nocheck_state(parsed=False):
    """Get a state representation that causes skipping of actual state checks.

    If "parsed" is True, a parsed representation will be returned, otherwise a
    regular JSON representation is used."""
    state = {'nocheck': True} # type: Union[str, Dict]
    if not parsed:
        state = json.dumps(state)
    return state

def check_state(state, state_checks, cursor) -> None:
    """Raise an error if state checks can't be passed."""
    # Skip actual tests if state checking is disabled in state
    if is_disabled(state):
        return

    sql_checks = [sc.sql for sc in state_checks]
    args = [] # type: List
    for sc in state_checks:
        args.extend(p for p in sc.params)

    if sql_checks:
        cursor.execute("(" + ") INTERSECT (".join(sql_checks) + ")", args)
    else:
        cursor.execute("SELECT 1")
    state_check_results = cursor.fetchall()

    # Expect results to have a length of the number of checks made and that
    # each result equals one.
    if not state_check_results or 1 != len(state_check_results) or 1 != state_check_results[0][0]:
        raise StateMatchingError("The provided state differs from the database state", state)
