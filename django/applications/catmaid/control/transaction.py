from django.db import connection
from django.http import HttpResponse

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole

from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(["GET"])
@requires_user_role([UserRole.Browse])
def transaction_collection(request, project_id):
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
def get_location(request, project_id):
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

        location = None
        query = location_queries.get(label)
        if query:
            cursor.execute(query, (transaction_id, execution_time))
            result = cursor.fetchall()
            if result and len(result) == 1:
                loc = result[0]
                if len(loc) == 3:
                    location = (loc[0], loc[1], loc[2])

        if not location or len(location) != 3:
            raise ValueError("Couldn't find location for transaction {} and "
                    "execution time {}".format(transaction_id, execution_time))

        return Response({
            'x': location[0],
            'y': location[1],
            'z': location[2]
        })

location_queries = {
    # Look transaction and edition time up in treenode table and return
    # node location.
    'treenodes.create': """
        SELECT location_x, location_y, location_z
        FROM treenode
        WHERE xmin = %s
        -- AND edition_time = %s
    """,
    'nodes.update_location': """
        SELECT location_x, location_y, location_z
        FROM location
        WHERE xmin = %s
        AND edition_time = %s
    """
}
