from collections import defaultdict
from django.db import transaction, connection
from django.http import HttpResponse, Http404
from django.db.models import Count
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Class, ClassInstance,\
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode,\
    Connector, User, Textlabel
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_optional,\
    catmaid_login_required
from common import get_relation_to_id_map, get_class_to_id_map
import json

@catmaid_login_required
def node_list(request, project_id=None, logged_in_user=None):
    # This is probably the most complex view.  For the moment, I'm
    # just using the same queries as before:
    relation_to_id = get_relation_to_id_map(project_id)
    class_to_id = get_class_to_id_map(project_id)
    presyn_id = relation_to_id['presynaptic_to']
    query_parameters = {}
    for p in ('left', 'width', 'top', 'height', 'z', 'zres'):
        query_parameters[p] = request.GET[p]
    query_parameters['limit'] = 400
    query_parameters['zbound'] = 1.0
    query_parameters['project_id'] = project_id
    c = connection.cursor()
    # Fetch all the treenodes which are in the bounding box:
    c.execute('''
SELECT treenode.id AS id,
       treenode.parent_id AS parentid,
       (treenode.location).x AS x,
       (treenode.location).y AS y,
       (treenode.location).z AS z,
       treenode.confidence AS confidence,
       treenode.user_id AS user_id,
       treenode.radius AS radius,
       ((treenode.location).z - %(z)s) AS z_diff,
       treenode_class_instance.class_instance_id AS skeleton_id,
       'treenode' AS type
   FROM (treenode INNER JOIN relation ON (relation.relation_name = 'element_of' AND relation.project_id = treenode.project_id))
      LEFT OUTER JOIN (treenode_class_instance
         INNER JOIN (class_instance INNER JOIN class ON class_instance.class_id = class.id AND class.class_name = 'skeleton')
         ON treenode_class_instance.class_instance_id = class_instance.id)
      ON (treenode_class_instance.treenode_id = treenode.id AND treenode_class_instance.relation_id = relation.id)
   WHERE treenode.project_id = %(project_id)s
      AND (treenode.location).x >= %(left)s
      AND (treenode.location).x <= (CAST (%(left)s AS double precision) + %(width)s)
      AND (treenode.location).y >= %(top)s
      AND (treenode.location).y <= (CAST (%(top)s AS double precision) + %(height)s)
      AND (treenode.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s
      AND (treenode.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s
      ORDER BY parentid DESC, id, z_diff
      LIMIT %(limit)s
''',
        query_parameters)
    headings = c.description
    treenodes = [dict(zip((column[0] for column in headings), row))
                 for row in c.fetchall()]

    query_parameters['model_of_id'] = relation_to_id['model_of']
    query_parameters['synapse_id'] = class_to_id['synapse']
    # Now find all the connectors in the same region:
    c.execute('''
SELECT connector.id AS id,
       (connector.location).x AS x,
       (connector.location).y AS y,
       (connector.location).z AS z,
       connector.user_id AS user_id,
       ((connector.location).z - %(z)s) AS z_diff,
       treenode_connector.relation_id AS treenode_relation_id,
       treenode_connector.treenode_id AS tnid,
       'connector' AS type
    FROM connector_class_instance AS lci, class_instance AS ci, connector
        LEFT OUTER JOIN treenode_connector ON treenode_connector.connector_id = connector.id
       WHERE connector.project_id = %(project_id)s AND
           (connector.location).x >= %(left)s AND
           (connector.location).x <= CAST (%(left)s AS double precision) + %(width)s AND
           (connector.location).y >= %(top)s AND
           (connector.location).y <= CAST (%(top)s AS double precision) + %(height)s AND
           (connector.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s AND
           (connector.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s AND
           connector.id = lci.connector_id AND
           ci.id = lci.class_instance_id AND
           lci.relation_id = %(model_of_id)s AND
           ci.class_id = %(synapse_id)s
        ORDER BY id, z_diff LIMIT %(limit)s
''',
        query_parameters)
    headings = c.description
    connectors = [dict(zip((column[0] for column in headings), row))
                  for row in c.fetchall()]

    already_seen_connectors = {}
    pushed_treenodes = len(treenodes)

    # FIXME: this is taken directly from the PHP, and could be simplified
    # a great deal.
    for connector in connectors:
        connector_id = connector['id']
        if connector['tnid']:
            tnid = connector['tnid']
            relationship = 'pre' if (connector['treenode_relation_id'] == presyn_id) else 'post'
        else:
            tnid = None
            relationship = None
        reuse = connector_id in already_seen_connectors
        val = connector
        del val['tnid']
        del val['treenode_relation_id']
        if reuse:
            existing_index = already_seen_connectors[connector_id]
            if tnid:
                val = treenodes[existing_index]
            else:
                val = None
        if val:
            if tnid:
                val.setdefault(relationship, [])
                val[relationship].append({'tnid': tnid})
            if reuse:
                treenodes[existing_index] = val
            else:
                treenodes.append(val)
                already_seen_connectors[connector_id] = pushed_treenodes
                pushed_treenodes += 1

    return HttpResponse(json.dumps(treenodes), mimetype='text/json')

@catmaid_login_required
def update_location_reviewer(request, project_id=None, node_id=None, logged_in_user=None):
    """ Updates the reviewer id and review time of a node """
    p = get_object_or_404(Project, pk=project_id)
    loc = Location.objects.get(
        pk=node_id,
        project=p)
    loc.reviewer_id=logged_in_user.id
    loc.review_time=datetime.now()
    loc.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')