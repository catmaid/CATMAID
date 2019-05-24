# -*- coding: utf-8 -*-

from typing import Dict
from django.db import connection

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response


class LocationLookupError(Exception):
    pass


@api_view(["GET"])
@requires_user_role([UserRole.Browse])
def transaction_collection(request:Request, project_id) -> Response:
    """Get a collection of all available transactions in the passed in project.
    ---
    parameters:
      - name: range_start
        description: The first result element index.
        type: integer
        paramType: form
        required: false
      - name: range_length
        description: The maximum number result elements.
        type: integer
        paramType: form
        required: false
    models:
      transaction_entity:
        id: transaction_entity
        description: A result transaction.
        properties:
          change_type:
            type: string
            description: The type of change, either Backend, Migration or External.
            required: true
          execution_time:
            type: string
            description: The time point of the transaction.
            required: true
          label:
            type: string
            description: A reference to the creator of the transaction, the  caller. Can be null.
            required: true
          user_id:
            type: integer
            description: User ID of transaction creator. Can be null.
            required: true
          project_id:
            type: integer
            description: Project ID of data changed in transaction. Can be null.
            required: true
          transaction_id:
            type: integer
            description: Transaction ID, only in combination with timestamp unique.
            required: true
    type:
      transactions:
        type: array
        items:
          $ref: transaction_entity
        description: Matching transactions
        required: true
      total_count:
        type: integer
        description: The total number of elements
        required: true
    """
    if request.method == 'GET':
        range_start = request.GET.get('range_start', None)
        range_length = request.GET.get('range_length', None)
        params = [project_id]
        constraints = []

        if range_start:
            constraints.append("OFFSET %s")
            params.append(range_start)

        if range_length:
            constraints.append("LIMIT %s")
            params.append(range_length)

        cursor = connection.cursor()
        cursor.execute("""
            SELECT row_to_json(cti), COUNT(*) OVER() AS full_count
            FROM catmaid_transaction_info cti
            WHERE project_id = %s
            ORDER BY execution_time DESC {}
        """.format(" ".join(constraints)), params)
        result = cursor.fetchall()
        json_data = [row[0] for row in result]
        total_count = result[0][1] if len(json_data) > 0 else 0

        return Response({
            "transactions": json_data,
            "total_count": total_count
        })


@api_view(["GET"])
@requires_user_role([UserRole.Browse])
def get_location(request:Request, project_id) -> Response:
    """Try to associate a location in the passed in project for a particular
    transaction.
    ---
    parameters:
      transaction_id:
        type: integer
        required: true
        description: Transaction ID in question
        paramType: form
      execution_time:
        type: string
        required: true
        description: Execution time of the transaction
        paramType: form
      label:
        type: string
        required: false
        description: Optional label of the transaction to avoid extra lookup
        paramType: form
    type:
      x:
        type: integer
        required: true
      y:
        type: integer
        required: true
      z:
        type: integer
        required: true
    """
    if request.method == 'GET':
        transaction_id = request.GET.get('transaction_id', None)
        if not transaction_id:
            raise ValueError("Need transaction ID")
        transaction_id = int(transaction_id)

        execution_time = request.GET.get('execution_time', None)
        if not execution_time:
            raise ValueError("Need execution time")

        cursor = connection.cursor()

        label = request.GET.get('label', None)
        if not label:
            cursor.execute("""
                SELECT label FROM catmaid_transaction_info
                WHERE transaction_id = %s AND execution_time = %s
            """, (transaction_id, execution_time))
            result = cursor.fetchone()
            if not result:
                raise ValueError("Couldn't find label for transaction {} and "
                        "execution time {}".format(transaction_id, execution_time))
            label = result[0]

        # Look first in live table and then in history table. Use only
        # transaction ID for lookup
        location = None
        provider = location_queries.get(label)
        if not provider:
            raise LocationLookupError("A representative location for this change was not found")
        query = provider.get()
        while query:
            cursor.execute(query, (transaction_id, ))
            query = None
            result = cursor.fetchall()
            if result and len(result) == 1:
                loc = result[0]
                if len(loc) == 3:
                    location = (loc[0], loc[1], loc[2])
                    query = None
                else:
                    raise ValueError("Couldn't read location information, "
                        "expected 3 columns, got {}".format(len(loc)))

        if not location or len(location) != 3:
            raise ValueError("Couldn't find location for transaction {}".format(transaction_id))

        return Response({
            'x': location[0],
            'y': location[1],
            'z': location[2]
        })

class LocationQuery(object):

    def __init__(self, query, history_suffix='__with_history', txid_column='txid'):
        """ The query is a query string that selects tuples of three,
        representing X, Y and Z coordinates of a location. If this string
        contains "{history}", this part will be replaced by the history suffix,
        which will replace the tablename with a reference to a history view,
        which includes the live table as well as the history.
        """
        self.txid_column = txid_column
        self.history_suffix = history_suffix
        self.query = query.format(history=history_suffix, txid=txid_column)

    def get(self):
        return self.query


class LocationRef(object):
    def __init__(self, d, key): self.d, self.key = d, key
    def get(self): return self.d[self.key].get()

location_queries = {} # type: Dict
location_queries.update({
    # For annotations, select the root of the annotated neuron
    'annotations.add': LocationQuery("""
        SELECT location_x, location_y, location_z
        FROM treenode{history} t
        JOIN class_instance_class_instance{history} cici_s
            ON (cici_s.class_instance_a = t.skeleton_id
            AND t.parent_id IS NULL)
        JOIN class_instance_class_instance{history} cici_e
            ON (cici_s.class_instance_b = cici_e.class_instance_a
            AND cici_e.{txid} = %s)
        LIMIT 1
    """),
    'annotations.remove': LocationQuery("""
        SELECT location_x, location_y, location_z
        FROM treenode{history} t
        JOIN class_instance_class_instance{history} cici_s
            ON (cici_s.class_instance_a = t.skeleton_id
            AND t.parent_id IS NULL)
        JOIN class_instance_class_instance__history cici_e
            ON (cici_s.class_instance_b = cici_e.class_instance_a
            AND cici_e.exec_transaction_id = %s)
        LIMIT 1
    """),
    'connectors.create': LocationRef(location_queries, "nodes.update_location"),
    'connectors.remove': LocationQuery("""
        SELECT c.location_x, c.location_y, c.location_z
        FROM location__history c
        WHERE c.exec_transaction_id = %s
        LIMIT 1
    """),
    'labels.remove': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM treenode_class_instance__history tci
        JOIN treenode{history} t
        ON t.id = tci.treenode_id
        WHERE tci.exec_transaction_id = %s
        LIMIT 1
    """),
    'labels.update': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM treenode_class_instance{history} tci
        JOIN treenode{history} t
        ON t.id = tci.treenode_id
        WHERE tci.{txid} = %s
        LIMIT 1
    """),
    'links.create': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM treenode_connector{history} tc
        JOIN treenode{history} t
        ON t.id = tc.treenode_id
        WHERE tc.{txid} = %s
        LIMIT 1
    """),
    'links.remove': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM treenode_connector__history tc
        JOIN treenode{history} t
        ON t.id = tc.treenode_id
        WHERE tc.{txid} = %s
    """),
    'neurons.remove': LocationQuery("""
        SELECT location_x, location_y, location_z
        FROM treenode{history} t
        JOIN class_instance_class_instance{history} cici_s
            ON (cici_s.class_instance_a = t.skeleton_id
            AND t.parent_id IS NULL)
        JOIN class_instance_class_instance__history cici_e
            ON (cici_s.class_instance_b = cici_e.class_instance_a
            AND cici_e.{txid} = %s)
        LIMIT 1
    """),
    'neurons.rename': LocationQuery("""
        SELECT location_x, location_y, location_z
        FROM treenode{history} t
        JOIN class_instance_class_instance{history} cici_s
            ON (cici_s.class_instance_a = t.skeleton_id
            AND t.parent_id IS NULL)
        JOIN class_instance_class_instance__history{history} cici_e
            ON (cici_s.class_instance_b = cici_e.class_instance_a
            AND cici_e.{txid} = %s)
        LIMIT 1
    """),
    'nodes.add_or_update_review': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM review{history} r
        JOIN treenode{history} t
        ON t.id = r.treenode_id
        WHERE r.{txid} = %s
        LIMIT 1
    """),
    'nodes.update_location': LocationQuery("""
        SELECT location_x, location_y, location_z
        FROM location{history}
        WHERE {txid} = %s
        LIMIT 1
    """),
    'textlabels.create': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM textlabel{history} t
        JOIN textlabel_location{history} tl
        ON t.id = tl.textlabel_id
        WHERE t.{txid} = %s
        LIMIT 1
    """),
    'textlabels.update': LocationRef(location_queries, "textlabels.create"),
    'textlabels.delete': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM textlabel__history t
        JOIN textlabel_location{history} tl
        ON t.id = tl.textlabel_id
        WHERE t.{txid} = %s
        LIMIT 1
    """),
    # Look transaction and edition time up in treenode table and return node
    # location.
    'treenodes.create': LocationRef(location_queries, "nodes.update_location"),
    'treenodes.insert': LocationRef(location_queries, "nodes.update_location"),
    'treenodes.remove': LocationRef(location_queries, "connectors.remove"),
    'treenodes.update_confidence': LocationRef(location_queries, "nodes.update_location"),
    'treenodes.update_parent': LocationRef(location_queries, "nodes.update_location"),
    'treenodes.update_radius': LocationRef(location_queries, "nodes.update_location"),
    'treenodes.suppress_virtual_node': LocationQuery("""
        SELECT t.location_x, t.location_y, t.location_z
        FROM suppressed_virtual_treenode{history} svt
        JOIN treenode{history} t
        ON t.id = svt.child_id
        WHERE svt.{txid} = %s
        LIMIT 1
    """),
    'treenodes.unsuppress_virtual_node': LocationRef(location_queries,
            "treenodes.suppress_virtual_node"),
})
