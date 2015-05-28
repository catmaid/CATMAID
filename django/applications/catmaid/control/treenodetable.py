import json
from django.db import connection
from django.http import HttpResponse
from catmaid.models import UserRole
from catmaid.control.authentication import requires_user_role

@requires_user_role(UserRole.Browse)
def treenode_table_content(request, project_id=None, skid=None):
    project_id = int(project_id)
    skid = int(skid)

    cursor = connection.cursor()
    cursor.execute('''
SELECT id, parent_id, confidence,
       location_x, location_y, location_z,
       radius, user_id, floor(EXTRACT(epoch FROM edition_time))
FROM treenode
WHERE project_id = %s
  AND skeleton_id = %s
    ''' % (project_id, skid))

    treenodes = tuple(cursor.fetchall())

    cursor.execute('''
SELECT treenode_id, reviewer_id
FROM review
WHERE project_id = %s
  AND skeleton_id = %s
    ''' % (project_id, skid))

    reviews = tuple(cursor.fetchall())

    cursor.execute('''
SELECT id
FROM relation
WHERE project_id = %s
  AND relation_name = 'labeled_as'
    ''' % (project_id))

    labeled_as = cursor.fetchone()[0]

    cursor.execute('''
SELECT t.id, ci.name
FROM treenode t, treenode_class_instance tci, class_instance ci
WHERE t.project_id = %s
  AND t.skeleton_id = %s
  AND tci.treenode_id = t.id
  AND tci.relation_id = %s
  AND tci.class_instance_id = ci.id
    ''' % (project_id, skid, labeled_as))

    tags = tuple(cursor.fetchall())

    return HttpResponse(json.dumps([treenodes, reviews, tags], separators=(',', ':')))

