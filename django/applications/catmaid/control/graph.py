import json
from django.db import connection
from django.http import HttpResponse
from catmaid.models import Relation, UserRole
from catmaid.control.authentication import requires_user_role

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def arbor_graph(request, project_id=None):
    """
    Return an unsorted list of edges between provided skeletons, with the form:
    [[connector_id, treenode_id PRE, skeleton_id PRE, treenode_id POST, skeleton_id POST], ...]
    """
    skids = ",".join(str(x) for x in set(int(v) for k,v in request.POST.iteritems() if k.startswith('skids[')))

    relations = dict(Relation.objects.filter(project_id=int(project_id)).values_list('relation_name', 'id'))

    cursor = connection.cursor()

    cursor.execute('''
SELECT
  tc1.connector_id,
  tc1.treenode_id,
  tc1.skeleton_id,
  tc2.treenode_id,
  tc2.skeleton_id
FROM
  treenode_connector tc1,
  treenode_connector tc2
WHERE
      tc1.skeleton_id IN (%s)
  AND tc2.skeleton_id IN (%s)
  AND tc1.connector_id = tc2.connector_id
  AND tc1.relation_id = %s
  AND tc2.relation_id = %s
    ''' % (skids, skids, relations['presynaptic_to'], relations['postsynaptic_to']))

    return HttpResponse(json.dumps(tuple(cursor.fetchall()), separators=(',', ':')))

