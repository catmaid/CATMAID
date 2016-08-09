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
      - type: array
        items:
          $ref: transaction_entity
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
            SELECT row_to_json(cti.*) FROM catmaid_transaction_info cti
            WHERE project_id = %s
            ORDER BY execution_time DESC {}
        """.format(" ".join(constraints)), params)
        json_data = [row[0] for row in cursor.fetchall()]

        return Response(json_data)
