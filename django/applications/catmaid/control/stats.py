# -*- coding: utf-8 -*-

from datetime import timedelta, datetime
from dateutil import parser as dateparser
import json
import os
import pytz
import time
from typing import Any, Dict

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.db.models.aggregates import Count
from django.db import connection, transaction
from django.utils import timezone
from django.utils.decorators import method_decorator

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map, get_request_bool
from catmaid.models import ClassInstance, Connector, Treenode, User, UserRole, \
        Review, Relation, TreenodeConnector


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def stats_cable_length(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Get the largest skeletons based on cable length.
    ---
    parameters:
    - name: n_skeletoons
      description: |
        How many skeletons should be returned
      required: false
      type: integer
      paramType: form
    """
    cursor = connection.cursor()
    n_skeletons = int(request.GET.get('n_skeletons', '0'))

    cursor.execute("""
        SELECT skeleton_id, cable_length
        FROM catmaid_skeleton_summary
        WHERE project_id = %(project_id)s
        ORDER BY cable_length DESC
        {limit}
    """.format(**{
        'limit': 'LIMIT {}'.format(n_skeletons) if n_skeletons else '',
    }), {
        'project_id': project_id,
    })

    result = list(cursor.fetchall())

    return JsonResponse(result, safe=False)


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def stats_nodecount(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Get the total number of created nodes per user.
    ---
    parameters:
    - name: with_imports
      description: |
        Whether data added through imports should be respected.
      required: false
      default: false
      type: boolean
      paramType: form
      defaultValue: false
    """
    cursor = connection.cursor()
    names = dict(User.objects.values_list('id', 'username'))
    with_imports = get_request_bool(request.GET, 'with_imports', False)

    cursor.execute('''
        WITH precomputed AS (
            SELECT user_id,
                MAX(date) AS date,
                SUM(n_treenodes) AS n_treenodes
            FROM catmaid_stats_summary
            WHERE project_id = %(project_id)s
            GROUP BY 1
        ),
        last_precomputation AS (
            SELECT COALESCE(
                date_trunc('hour', MAX(date)) + interval '1 hour',
                NULL) AS max_date
            FROM precomputed
        ),
        result_with_precomputation AS (
            SELECT p.user_id AS user_id,
                p.n_treenodes AS n_treenodes
            FROM precomputed p

            -- Don't expect duplicates, when adding rows for nodes traced after the
            -- last precomputation. This is only executed if there actually was a
            -- precomputation (max_Date is not null).
            UNION ALL
            SELECT t.user_id AS user_id,
                count(*) AS n_treenodes
            FROM treenode t, last_precomputation
            WHERE t.project_id = %(project_id)s
            AND last_precomputation.max_date IS NOT NULL
            AND t.creation_time >= last_precomputation.max_date
            GROUP BY t.user_id
        )
        SELECT user_id, SUM(n_treenodes)::float
        FROM result_with_precomputation, last_precomputation
        WHERE last_precomputation.max_date IS NOT NULL
        GROUP BY user_id

        -- If there was no precomputation (max_date is null), do a simpler
        -- counting that doesn't involve date comparisons. In this case
        -- duplicates are impossible.
        UNION ALL
        SELECT user_id, count(*)::float
        FROM treenode, last_precomputation
        WHERE project_id = %(project_id)s
        AND last_precomputation IS NULL
        GROUP BY user_id
    ''', dict(project_id=int(project_id)))

    node_stats = dict(cursor.fetchall())

    if not with_imports:
        # In case imports should be excluded, subtract the number imported nodes
        # for each entry. Otherwise the regular node count doesn't differentiate
        # between imported and createad nodes. This flag requires history
        # tracking to be enabled to work reliably.
        cursor.execute('''
            WITH precomputed AS (
                SELECT user_id,
                    date,
                    SUM(n_imported_treenodes) AS n_imported_treenodes
                FROM catmaid_stats_summary
                WHERE project_id = %(project_id)s
                -- This is required to not just take the last available cache
                -- entry, which might not contain a valid precomputed import
                -- cache field.
                AND n_imported_treenodes > 0
                GROUP BY 1, 2
            ),
            last_precomputation AS (
                SELECT COALESCE(
                    -- Select first start date after last precomputed hour/bucket
                    date_trunc('hour', MAX(date)) + interval '1 hour',
                    '-infinity') AS max_date
                FROM precomputed
            ),
            transactions AS (
                SELECT cti.transaction_id, cti.execution_time
                FROM last_precomputation
                JOIN catmaid_transaction_info cti
                    ON cti.execution_time >= last_precomputation.max_date
                WHERE cti.project_id = %(project_id)s
                AND label = 'skeletons.import'
            ),
            all_treenodes AS (
                SELECT p.user_id AS user_id,
                    p.n_imported_treenodes AS n_imported_treenodes
                FROM precomputed p

                -- Don't expect duplicates
                UNION ALL

                SELECT sorted_row_history.user_id AS user_id,
                    1 AS n_imported_treenodes
                FROM (
                    SELECT t.id, t.user_id,
                        ROW_NUMBER() OVER(PARTITION BY t.id ORDER BY t.edition_time) AS n
                    FROM last_precomputation,
                       transactions tx
                    JOIN treenode__with_history t
                    ON t.txid = tx.transaction_id
                    WHERE t.creation_time = tx.execution_time
                    AND t.creation_time >= last_precomputation.max_date
                ) sorted_row_history
                WHERE sorted_row_history.n = 1
            )
            SELECT user_id,
                -- Return float to make python side arithmetic easier
                SUM(n_imported_treenodes)::float AS n_imported_treenodes
            FROM all_treenodes
            GROUP BY user_id
        ''', dict(project_id=int(project_id)))

        for user_id, n_imported_nodes in cursor.fetchall():
            created_nodes = node_stats.get(user_id)
            if created_nodes:
                # The lower boundary of zero shouldn't be needed, but due to the
                # fact that general node counting doesn't take history into
                # account (deleted nodes are not counted), there are corner
                # cases in which more nodes have been imported than there are
                # created (and still available).
                node_stats[user_id] = max(0, created_nodes - n_imported_nodes)

    # Both SUM and COUNT are represented as floating point number in the
    # response, which works better with JSON than Decimal (which is converted to
    # a string by the JSON encoder).
    return JsonResponse(node_stats)


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def stats_editor(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Get the total number of edited nodes per user.
    """
    cursor = connection.cursor()
    cursor.execute('''
        SELECT editor_id, count(editor_id)::float
        FROM treenode
        WHERE project_id=%(project_id)s
          AND editor_id != user_id
        GROUP BY editor_id
    ''', dict(project_id=int(project_id)))

    return JsonResponse(dict(cursor.fetchall()))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_summary(request:HttpRequest, project_id=None) -> JsonResponse:
    startdate = datetime.today()
    result = {
        'treenodes_created': Treenode.objects.filter(
            project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day).count(),
        'connectors_created': Connector.objects.filter(
            project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day
            ).count(),
    }
    for key, class_name in [
            ('skeletons_created', 'skeleton')
            ]:
        result[key] = ClassInstance.objects.filter(
            project=project_id,
            user=request.user.id,
            creation_time__year=startdate.year,
            creation_time__month=startdate.month,
            creation_time__day=startdate.day,
            class_column__class_name=class_name).count()
    return JsonResponse(result)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_history(request:HttpRequest, project_id=None) -> JsonResponse:
    # Get the start and end dates for the query, defaulting to the last 30
    # days.
    start_date = request.GET.get('start_date', timezone.now() - timedelta(30))
    end_date = request.GET.get('end_date', timezone.now())

    # Look up all tree nodes for the project in the given date range.
    # Also add a computed field which is just the day of the last edited
    # date/time.
    tree_nodes = Treenode.objects \
        .filter(
            project=project_id,
            edition_time__range=(start_date, end_date)) \
        .extra(select={
            'date': 'to_char("treenode"."edition_time", \'YYYYMMDD\')'}) \
        .order_by('user', 'date')

    # Get the count of tree nodes for each user/day combination.
    stats = tree_nodes.values('user__username', 'date') \
        .annotate(count=Count('id'))

    # Change the 'user__username' field name to just 'name'.
    # (If <https://code.djangoproject.com/ticket/12222> ever gets implemented
    # then this wouldn't be necessary.)
    stats = [{
        'name': stat['user__username'],
        'date': stat['date'],
        'count': stat['count']} for stat in stats]

    return JsonResponse(stats, safe=False)

def stats_user_activity(request:HttpRequest, project_id=None) -> JsonResponse:
    username = request.GET.get('username', None)
    all_users = User.objects.filter().values('username', 'id')
    map_name_to_userid = {}
    for user in all_users:
        map_name_to_userid[user['username']] = user['id']
    relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=project_id))
    # Retrieve all treenodes and creation time
    stats = Treenode.objects \
        .filter(
            project=project_id,
            user=map_name_to_userid[username] ) \
        .order_by('creation_time') \
        .values('creation_time')
    # Extract the timestamps from the datetime objects
    timepoints = [time.mktime(ele['creation_time'].timetuple()) for ele in stats]
    # Retrieve TreenodeConnector creation times
    stats_prelink = TreenodeConnector.objects \
        .filter(
            project=project_id,
            user=map_name_to_userid[username],
            relation=relations['presynaptic_to'] ) \
        .order_by('creation_time').values('creation_time')
    stats_postlink = TreenodeConnector.objects \
        .filter(
            project=project_id,
            user=map_name_to_userid[username],
            relation=relations['postsynaptic_to'] ) \
        .order_by('creation_time').values('creation_time')
    prelinks = [time.mktime(ele['creation_time'].timetuple()) for ele in stats_prelink]
    postlinks = [time.mktime(ele['creation_time'].timetuple()) for ele in stats_postlink]
    return JsonResponse({'skeleton_nodes': timepoints,
         'presynaptic': prelinks, 'postsynaptic': postlinks})

@api_view(['GET'])
def stats_user_history(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get per user contribution statistics

    A date range can be provided to limit the scope of the returned statiscis.
    By default, the statistics for the last ten days is returned. The returned
    data includes created cable length, the number of created synaptic
    connections and the number of reviews made, per day and user.
    ---
    parameters:
    - name: start_date
      description: |
        If provided (YYYY-MM-DD), only statistics from this day on are returned (inclusive).
      required: false
      type: string
      paramType: form
    - name: end_date
      description: |
        If provided (YYYY-MM-DD), only statistics to this day on are returned (inclusive).
      required: false
      type: string
      paramType: form
    - name: time_zone
      description: |
        Optional time zone for the date range, e.g. "US/Eastern"
      required: false
      type: string
      paramType: form
    models:
      stats_user_history_cell:
        id: stats_user_history_cell
        properties:
          new_treenodes:
            description: Number of nodes created
            type: integer
            required: true
          new_cable_length:
            description: Cable length created
            type: integer
            required: true
          new_connectors:
            description: Number of new synaptic connections created
            type: integer
            required: true
          new_reviewed_nodes:
            description: Number of new node reviews
            type: integer
            required: true
      stats_user_history_day_segment:
        id: stats_user_history_day_segment
        properties:
          date:
            description: Entries for a day, expressed as field name
            $ref: stats_user_history_cell
            required: true
      stats_user_history_segment:
        id: stats_user_history_segment
        properties:
          user_id:
            description: Entries by day for a user (ID), expressed as field name
            $ref: stats_user_history_day_segment
            required: true
    type:
      days:
        description: Returned dates in YYYYMMDD format
        type: array
        items:
          type: string
          format: date
        required: true
      daysformatted:
        description: Returned dates in more readable format
        type: array
        items:
          type: string
        required: true
      stats_table:
        description: Actual history information by user and by date
        $ref: stats_user_history_segment
        required: true
    """
    raw_time_zone = request.GET.get('time_zone', settings.TIME_ZONE)
    time_zone = pytz.timezone(raw_time_zone)

    # Get the start date for the query, defaulting to 10 days ago.
    start_date = request.GET.get('start_date', None)
    if start_date:
        start_date = dateparser.parse(start_date)
        start_date = time_zone.localize(start_date)
    else:
        with timezone.override(time_zone):
            start_date = timezone.now() - timedelta(10)

    # Get the end date for the query, defaulting to now.
    end_date = request.GET.get('end_date', None)
    if end_date:
        end_date = dateparser.parse(end_date)
        end_date = time_zone.localize(end_date)
    else:
        with timezone.override(time_zone):
            end_date = timezone.now()

    # The API is inclusive and should return stats for the end date as
    # well. The actual query is easier with an exclusive end and therefore
    # the end date is set to the beginning of the next day.
    end_date = end_date + timedelta(days=1)

    # Calculate number of days between (including) start and end.
    delta = end_date - start_date
    daydelta = delta.days
    # If the orginal delta is bigger than the days only, the day based delta has
    # to be incremented. This can happen if start date and end date have
    # different distances to UTC, e.g. if start date is in EST and end date in
    # EDT.
    if timedelta(daydelta) < delta:
        daydelta += 1

    # To query data with raw SQL we need the UTC version of start and end time
    start_date_utc = start_date.astimezone(pytz.utc)
    end_date_utc = end_date.astimezone(pytz.utc)

    all_users = User.objects.filter().values_list('id', flat=True)
    days = []
    daysformatted = []
    for i in range(daydelta):
        tmp_date = start_date + timedelta(days=i)
        days.append(tmp_date.strftime("%Y%m%d"))
        daysformatted.append(tmp_date.strftime("%a %d, %h %Y"))
    stats_table = {} # type: Dict
    for userid in all_users:
        if userid == -1:
            continue
        userid = str(userid)
        stats_table[userid] = {}
        for i in range(daydelta):
            date = (start_date + timedelta(days=i)).strftime("%Y%m%d")
            stats_table[userid][date] = {}

    cursor = connection.cursor()

    treenode_stats = select_node_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)
    cable_stats = select_cable_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)
    connector_stats = select_connector_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)
    tree_reviewed_nodes = select_review_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)

    for di in treenode_stats:
        user_id = str(di[0])
        date = di[1].strftime('%Y%m%d')
        stats_table[user_id][date]['new_treenodes'] = di[2]

    for di in cable_stats:
        user_id = str(di[0])
        date = di[1].strftime('%Y%m%d')
        stats_table[user_id][date]['new_cable_length'] = di[2]

    for di in connector_stats:
        user_id = str(di[0])
        date = di[1].strftime('%Y%m%d')
        stats_table[user_id][date]['new_connectors'] = di[2]

    for di in tree_reviewed_nodes:
        user_id = str(di[0])
        date = di[1].strftime('%Y%m%d')
        stats_table[user_id][date]['new_reviewed_nodes'] = di[2]

    return JsonResponse({
        'stats_table': stats_table,
        'days': days,
        'daysformatted': daysformatted
    })

def select_node_stats(cursor, project_id, start_date_utc, end_date_utc,
        time_zone, time_unit='day'):

    # Get review information by first getting all hourly precomputed statistics
    # for the requested timezone and then add all remaining statistics on
    # demand. The result sum is returned as float, to not required
    # Decimal-to-JSON conversion.
    cursor.execute('''
        WITH precomputed AS (
            SELECT user_id,
                date,
                SUM(n_treenodes) AS n_treenodes
            FROM catmaid_stats_summary
            WHERE project_id = %(project_id)s
            AND date >= %(start_date_utc)s
            AND date < %(end_date_utc)s
            GROUP BY 1, 2
        ),
        last_precomputation AS (
            SELECT COALESCE(
                -- Select first start date after last precomputed hour/bucket
                date_trunc('hour', MAX(date)) + interval '1 hour',
                %(start_date_utc)s) as max_date
            FROM precomputed
        ),
        all_treenodes AS (
            SELECT p.user_id AS user_id,
                p.date AS date,
                p.n_treenodes AS n_treenodes
            FROM precomputed p
            -- Don't expect duplicates
            UNION ALL
            SELECT t.user_id AS user_id,
                t.creation_time AS date,
                count(*) AS n_treenodes
            FROM treenode t, last_precomputation
            WHERE t.project_id = %(project_id)s
            AND t.creation_time >= last_precomputation.max_date
            AND t.creation_time < %(end_date_utc)s
            GROUP BY t.user_id, date
        )
        SELECT t.user_id,
            date_trunc(%(time_unit)s, timezone(%(tz)s, t.date)) AS date,
            SUM(t.n_treenodes)::float
        FROM all_treenodes t
        GROUP BY 1, 2
    ''', {
        'tz': time_zone.zone,
        'utc_offset': time_zone,
        'project_id': project_id,
        'start_date_utc': start_date_utc,
        'end_date_utc': end_date_utc,
        'time_unit': time_unit
    })

    return cursor.fetchall()

def select_cable_stats(cursor, project_id, start_date_utc, end_date_utc,
        time_zone, time_unit='day'):
    # The result sum is returned as float, to not required Decimal-to-JSON
    # conversion.
    cursor.execute('''
        WITH precomputed AS (
            SELECT user_id,
                date,
                SUM(cable_length) AS cable_length
            FROM catmaid_stats_summary
            WHERE project_id = %(project_id)s
            AND date >= %(start_date_utc)s
            AND date < %(end_date_utc)s
            GROUP BY 1, 2
        ),
        last_precomputation AS (
            SELECT COALESCE(
                -- Select first start date after last precomputed hour/bucket
                date_trunc('hour', MAX(date)) + interval '1 hour',
                %(start_date_utc)s) as max_date
            FROM precomputed
        ),
        all_cable_lengths AS (
            SELECT p.user_id, p.date, p.cable_length
            FROM precomputed p
            -- Don't expect duplicates
            UNION ALL
            SELECT child.uid, child.date, SUM(edge.length)
            FROM (
                SELECT
                    child.user_id AS uid,
                    child.creation_time AS date,
                    child.parent_id,
                    child.location_x,
                    child.location_y,
                    child.location_z
                FROM treenode child, last_precomputation
                WHERE child.project_id = %(project_id)s
                  AND child.creation_time >= last_precomputation.max_date
                  AND child.creation_time < %(end_date_utc)s
            ) AS child
            INNER JOIN LATERAL (
                SELECT sqrt(pow(child.location_x - parent.location_x, 2)
                          + pow(child.location_y - parent.location_y, 2)
                          + pow(child.location_z - parent.location_z, 2)) AS length
                FROM treenode parent
                WHERE parent.project_id = %(project_id)s
                  AND parent.id = child.parent_id
                LIMIT 1
            ) AS edge ON TRUE
            GROUP BY child.uid, child.date
        )
        SELECT l.user_id,
            date_trunc(%(time_unit)s, timezone(%(tz)s, l.date)) AS date,
            ROUND(SUM(l.cable_length))::float
        FROM all_cable_lengths l
        GROUP BY 1, 2
    ''', dict(tz=time_zone.zone, project_id=project_id,
            start_date_utc=start_date_utc, end_date_utc=end_date_utc,
            time_unit=time_unit))

    return cursor.fetchall()

def select_connector_stats(cursor, project_id, start_date_utc, end_date_utc,
        time_zone, time_unit='day'):
    relations = get_relation_to_id_map(project_id, cursor=cursor)
    pre_id, post_id = relations['presynaptic_to'], relations['postsynaptic_to']

    # Retrieve a list of how many completed connector relations a user has
    # created in a given time frame. A completed connector relation is either
    # one were a user created both the presynaptic and the postsynaptic side
    # (one of them in the given time frame) or if a user completes an existing
    # 'half connection'. To avoid duplicates, only links are counted, where the
    # second node is younger than the first one. The result sum is returned as
    # float, to not required Decimal-to-JSON conversion.
    cursor.execute('''
        WITH precomputed AS (
            SELECT user_id,
                date,
                SUM(n_connector_links) AS n_connector_links
            FROM catmaid_stats_summary
            WHERE project_id = %(project_id)s
            AND date >= %(start_date_utc)s
            AND date < %(end_date_utc)s
            GROUP BY 1, 2
        ),
        last_precomputation AS (
            SELECT COALESCE(
                -- Select first start date after last precomputed hour/bucket
                date_trunc('hour', MAX(date)) + interval '1 hour',
                %(start_date_utc)s) as max_date
            FROM precomputed
        ),
        all_connectors AS (
            SELECT p.user_id AS user_id,
                p.date AS date,
                p.n_connector_links AS n_connector_links
            FROM precomputed p
            -- Don't expect duplicates
            UNION ALL
            SELECT t1.user_id,
                t1.creation_time AS date,
                count(*) AS n_connector_links
            FROM last_precomputation, treenode_connector t1
            JOIN treenode_connector t2
                ON t1.connector_id = t2.connector_id
            WHERE t1.project_id=%(project_id)s
            AND t1.creation_time >= last_precomputation.max_date
            AND t1.creation_time < %(end_date_utc)s
            AND t1.relation_id <> t2.relation_id
            AND (t1.relation_id = %(pre_id)s OR t1.relation_id = %(post_id)s)
            AND (t2.relation_id = %(pre_id)s OR t2.relation_id = %(post_id)s)
            AND t1.creation_time > t2.creation_time
            GROUP BY 1, 2
        )
        SELECT l.user_id,
            date_trunc(%(time_unit)s, timezone(%(tz)s, l.date)) AS date,
            SUM(l.n_connector_links)::float
        FROM all_connectors l
        GROUP BY 1, 2
    ''', {
        'tz': time_zone.zone,
        'project_id': project_id,
        'start_date_utc': start_date_utc,
        'end_date_utc': end_date_utc,
        'pre_id': pre_id,
        'post_id': post_id,
        'time_unit': time_unit
    })

    return cursor.fetchall()

def select_review_stats(cursor, project_id, start_date_utc, end_date_utc,
        time_zone, time_unit='day'):

    # Get review information by first getting all hourly precomputed statistics
    # for the requested timezone and then add all remaining statistics on
    # demand. The result sum is returned as float, to not required
    # Decimal-to-JSON conversion.
    cursor.execute('''
        WITH precomputed AS (
            SELECT user_id,
                date,
                SUM(n_reviewed_nodes) AS n_reviewed_nodes
            FROM catmaid_stats_summary
            WHERE project_id = %(project_id)s
            AND date >= %(start_date_utc)s
            AND date < %(end_date_utc)s
            GROUP BY 1, 2
        ),
        last_precomputation AS (
            SELECT COALESCE(
                -- Select first start date after last precomputed hour/bucket
                date_trunc('hour', MAX(date)) + interval '1 hour',
                %(start_date_utc)s) as max_date
            FROM precomputed
        ),
        all_reviews AS (
            SELECT p.user_id AS reviewer_id,
                p.date AS date,
                p.n_reviewed_nodes AS n_reviewed_nodes
            FROM precomputed p
            -- Don't expect duplicates
            UNION ALL
            SELECT r.reviewer_id AS reviewer_id,
                r.review_time AS date,
                count(*) AS n_reviewed_nodes
            FROM review r, last_precomputation
            WHERE r.project_id = %(project_id)s
            AND r.review_time >= last_precomputation.max_date
            AND r.review_time < %(end_date_utc)s
            GROUP BY r.reviewer_id, date
        )
        SELECT r.reviewer_id,
            date_trunc(%(time_unit)s, timezone(%(tz)s, r.date)) AS date,
            SUM(r.n_reviewed_nodes)::float
        FROM all_reviews r
        GROUP BY 1, 2
    ''', {
        'tz': time_zone.zone,
        'utc_offset': time_zone,
        'project_id': project_id,
        'start_date_utc': start_date_utc,
        'end_date_utc': end_date_utc,
        'time_unit': time_unit
    })

    return cursor.fetchall()

@transaction.atomic
def populate_stats_summary(project_id, delete:bool=False, incremental:bool=True) -> None:
    """Create statistics summary tables from scratch until yesterday.
    """
    cursor = connection.cursor()
    if delete:
        cursor.execute("""
            DELETE FROM catmaid_stats_summary WHERE project_id = %(project_id)s
        """, dict(project_id=project_id))

    populate_review_stats_summary(project_id, incremental, cursor)
    populate_connector_stats_summary(project_id, incremental, cursor)
    populate_cable_stats_summary(project_id, incremental, cursor)
    populate_nodecount_stats_summary(project_id, incremental, cursor)
    populate_import_nodecount_stats_summary(project_id, incremental, cursor)

def populate_review_stats_summary(project_id, incremental:bool=True, cursor=None) -> None:
    """Add review summary information to the summary table. Create hourly
    aggregates in UTC time. These aggregates can still be moved in other
    timezones with good enough precision for our purpose. By default, this
    happens in an incremental manner, but can optionally be fone for all data
    from scratch (overriding existing statistics).
    """
    if not cursor:
        cursor = connection.cursor()

    # Add reviewer info
    cursor.execute("""
        WITH last_precomputation AS (
            SELECT CASE WHEN %(incremental)s = FALSE THEN '-infinity'
                ELSE COALESCE(date_trunc('hour', MAX(date)) - interval '1 hour',
                    '-infinity') END AS max_date
            FROM catmaid_stats_summary
            WHERE project_id=%(project_id)s
                AND n_reviewed_nodes > 0
        ),
        review_info AS (
            SELECT r.reviewer_id AS user_id,
                date_trunc('hour', r.review_time) AS date,
                count(*) AS n_reviewed_nodes
            FROM review r, last_precomputation
            WHERE r.project_id = %(project_id)s
            AND r.review_time > last_precomputation.max_date
            AND r.review_time < date_trunc('hour', CURRENT_TIMESTAMP)
            GROUP BY r.reviewer_id, date
        )
        INSERT INTO catmaid_stats_summary (project_id, user_id, date,
                n_reviewed_nodes)
        SELECT %(project_id)s, ri.user_id, ri.date, ri.n_reviewed_nodes
        FROM review_info ri
        ON CONFLICT (project_id, user_id, date) DO UPDATE
        SET n_reviewed_nodes = EXCLUDED.n_reviewed_nodes;
    """, dict(project_id=project_id, incremental=incremental))

def populate_connector_stats_summary(project_id, incremental:bool=True, cursor=None) -> None:
    """Add connector summary information to the summary table. Create hourly
    aggregates in UTC time. These aggregates can still be moved in other
    timezones with good enough precision for our purpose. By default, this
    happens in an incremental manner, but can optionally be fone for all data
    from scratch (overriding existing statistics).
    """
    if not cursor:
        cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, cursor=cursor)
    pre_id, post_id = relations.get('presynaptic_to'), relations.get('postsynaptic_to')
    if pre_id and post_id:
        cursor.execute("""
            WITH last_precomputation AS (
                SELECT CASE WHEN %(incremental)s = FALSE THEN '-infinity'
                    ELSE COALESCE(date_trunc('hour', MAX(date)) - interval '1 hour',
                        '-infinity') END AS max_date
                FROM catmaid_stats_summary
                WHERE project_id=%(project_id)s
                    AND n_connector_links > 0
            ),
            connector_info AS (
                SELECT t1.user_id,
                    date_trunc('hour', t1.creation_time) AS date,
                    count(*) AS n_connector_links
                FROM last_precomputation, treenode_connector t1
                JOIN treenode_connector t2 ON t1.connector_id = t2.connector_id
                WHERE t1.project_id=%(project_id)s
                AND t1.creation_time >= last_precomputation.max_date
                AND t1.creation_time < date_trunc('hour', CURRENT_TIMESTAMP)
                AND t1.relation_id <> t2.relation_id
                AND (t1.relation_id = %(pre_id)s OR t1.relation_id = %(post_id)s)
                AND (t2.relation_id = %(pre_id)s OR t2.relation_id = %(post_id)s)
                AND t1.creation_time > t2.creation_time
                GROUP BY t1.user_id, date
            )
            INSERT INTO catmaid_stats_summary (project_id, user_id, date,
                    n_connector_links)
            SELECT %(project_id)s, ci.user_id, ci.date, ci.n_connector_links
            FROM connector_info ci
            ON CONFLICT (project_id, user_id, date) DO UPDATE
            SET n_connector_links = EXCLUDED.n_connector_links;
        """, dict(project_id=project_id, pre_id=pre_id, post_id=post_id,
                  incremental=incremental))

def populate_cable_stats_summary(project_id, incremental:bool=True, cursor=None) -> None:
    """Add cable length summary data to the statistics summary table. By
    default, this happens in an incremental manner, but can optionally be fone
    for all data from scratch (overriding existing statistics).
    """
    if not cursor:
        cursor = connection.cursor()

    cursor.execute("""
        WITH last_precomputation AS (
            SELECT CASE WHEN %(incremental)s = FALSE THEN '-infinity'
                ELSE COALESCE(date_trunc('hour', MAX(date)) - interval '1 hour',
                    '-infinity') END AS max_date
            FROM catmaid_stats_summary
            WHERE project_id=%(project_id)s
                AND cable_length > 0
        ),
        cable_info AS (
            SELECT child.uid AS user_id,
                child.date AS date,
                SUM(edge.length) AS cable_length
            FROM (
                SELECT
                    child.user_id AS uid,
                    date_trunc('hour', child.creation_time) AS date,
                    child.parent_id,
                    child.location_x,
                    child.location_y,
                    child.location_z
                FROM treenode child, last_precomputation
                WHERE child.project_id = %(project_id)s
                  AND child.creation_time >= last_precomputation.max_date
                  AND child.creation_time < date_trunc('hour', CURRENT_TIMESTAMP)
            ) AS child
            INNER JOIN LATERAL (
                SELECT sqrt(pow(child.location_x - parent.location_x, 2)
                          + pow(child.location_y - parent.location_y, 2)
                          + pow(child.location_z - parent.location_z, 2)) AS length
                FROM treenode parent
                WHERE parent.project_id = %(project_id)s
                  AND parent.id = child.parent_id
                LIMIT 1
            ) AS edge ON TRUE
            GROUP BY child.uid, child.date
        )
        INSERT INTO catmaid_stats_summary (project_id, user_id, date,
                cable_length)
        SELECT %(project_id)s, ci.user_id, ci.date, ci.cable_length
        FROM cable_info ci
        ON CONFLICT (project_id, user_id, date) DO UPDATE
        SET cable_length = EXCLUDED.cable_length;
    """, dict(project_id=project_id, incremental=incremental))

def populate_nodecount_stats_summary(project_id, incremental:bool=True,
                                     cursor=None) -> None:
    """Add node count summary data to the statistics summary table. By default,
    this happens in an incremental manner, but can optionally be fone for all
    data from scratch (overriding existing statistics).
    """
    if not cursor:
        cursor = connection.cursor()

    # Add node count incrementally by finding the last precomputed treenode
    # count value above zero for the passed in project and (re)compute
    # statistics starting one hour before. This means, some statistics
    # might be recomputed, which is done to increase reobustness.
    cursor.execute("""
        WITH last_precomputation AS (
            SELECT CASE WHEN %(incremental)s = FALSE THEN '-infinity'
                ELSE COALESCE(date_trunc('hour', MAX(date)) - interval '1 hour',
                    '-infinity') END AS max_date
            FROM catmaid_stats_summary
            WHERE project_id=%(project_id)s
                AND n_treenodes > 0
        ),
        node_info AS (
            SELECT user_id,
                date_trunc('hour', creation_time) AS date,
                count(*) as node_count
            FROM treenode, last_precomputation
            WHERE project_id=%(project_id)s
            AND creation_time >= last_precomputation.max_date
            GROUP BY 1, 2
        )
        INSERT INTO catmaid_stats_summary (project_id, user_id, date,
                n_treenodes)
        SELECT %(project_id)s, ni.user_id, ni.date, ni.node_count
        FROM node_info ni
        ON CONFLICT (project_id, user_id, date) DO UPDATE
        SET n_treenodes = EXCLUDED.n_treenodes;
    """, dict(project_id=project_id, incremental=incremental))

def populate_import_nodecount_stats_summary(project_id, incremental:bool=True,
                                            cursor=None) -> None:
    """Add import node count summary data to the statistics summary table. By
    default, this happens in an incremental manner, but can optionally be fone
    for all data from scratch (overriding existing statistics).
    """
    if not cursor:
        cursor = connection.cursor()

    # Add import node count incrementally by finding the last precomputed
    # import treenode count value above zero for the passed in project and
    # (re)compute statistics starting one hour before. This means, some
    # statistics might be recomputed, which is done to increase reobustness.
    cursor.execute("""
        WITH last_precomputation AS (
            SELECT CASE WHEN %(incremental)s = FALSE THEN '-infinity'
                ELSE COALESCE(date_trunc('hour', MAX(date)) - interval '1 hour',
                    '-infinity') END AS max_date
            FROM catmaid_stats_summary
            WHERE project_id=%(project_id)s
                AND n_imported_treenodes > 0
        ),
        node_info AS (
            SELECT sorted_row_history.user_id AS user_id,
                date_trunc('hour', sorted_row_history.creation_time) AS date,
                count(*) AS node_count
            FROM (
                SELECT DISTINCT t.id, t.user_id, t.creation_time,
                    ROW_NUMBER() OVER(PARTITION BY t.id ORDER BY t.edition_time) AS n
                FROM last_precomputation, treenode__with_history t
                JOIN catmaid_transaction_info cti
                  ON t.txid = cti.transaction_id
                WHERE cti.project_id = %(project_id)s
                  AND t.creation_time = cti.execution_time
                  AND t.creation_time >= last_precomputation.max_date
                  AND label = 'skeletons.import'
            ) sorted_row_history
            WHERE sorted_row_history.n = 1
            GROUP BY 1, 2
        )
        INSERT INTO catmaid_stats_summary (project_id, user_id, date,
                n_imported_treenodes)
        SELECT %(project_id)s, ni.user_id, ni.date, ni.node_count
        FROM node_info ni
        ON CONFLICT (project_id, user_id, date) DO UPDATE
        SET n_imported_treenodes = EXCLUDED.n_imported_treenodes;
    """, dict(project_id=project_id, incremental=incremental))


class ServerStats(APIView):

    @method_decorator(requires_user_role(UserRole.Admin))
    def get(self, request:Request, project_id) -> Response:
        """Return an object that represents the state of various server and
        database objects.
        """

        return Response({
            'time': self.get_current_timestamp(),
            'server': self.get_server_stats(),
            'database': self.get_database_stats(),
        })


    def get_current_timestamp(self) -> str:
        return datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")


    def get_server_stats(self) -> Dict[str, Any]:
        return {
            'load_avg': os.getloadavg(),
        }

    def get_database_stats(self) -> Dict[str, Any]:
        cursor = connection.cursor()
        cursor.execute("select current_database()")
        db_name = cursor.fetchone()[0]

        cursor.execute("SELECT version()")
        db_version = cursor.fetchone()[0]

        cursor.execute("""
            SELECT (xact_commit * 100) / (xact_commit + xact_rollback),
                deadlocks, conflicts, temp_files, pg_size_pretty(temp_bytes),
                blks_read, blks_hit
            FROM pg_stat_database WHERE datname = %(db_name)s
        """, {
            'db_name': db_name,
        })
        db_stats = cursor.fetchone();

        cursor.execute("""
            SELECT sum(heap_blks_read) AS heap_read,
              sum(heap_blks_hit) AS heap_hit,
              sum(heap_blks_hit)/ (sum(heap_blks_hit) + sum(heap_blks_read)) AS ratio
            FROM pg_statio_user_tables
        """)
        db_cache = cursor.fetchone()

        cursor.execute("""
            SELECT sum(idx_blks_read) AS idx_read,
                sum(idx_blks_hit) AS idx_hit,
                (sum(idx_blks_hit) - sum(idx_blks_read)) / sum(idx_blks_hit) AS ratio
            FROM pg_statio_user_indexes
        """)
        db_idx_cache = cursor.fetchone()

        cursor.execute("""
            SELECT checkpoints_timed, checkpoints_req, buffers_clean,
                maxwritten_clean, buffers_backend_fsync,
                extract(epoch from now() - pg_last_xact_replay_timestamp())
            FROM pg_stat_bgwriter
        """)
        bgwriter_stats = cursor.fetchone();

        return {
            'version': db_version,
            # Should be above 95%
            'c_ratio': db_stats[0],
            # Should be < 10
            'deadlocks': db_stats[1],
            # Should be < 10
            'conflicts': db_stats[2],
            # Should be < 100
            'temp_files': db_stats[3],
            # Should be < 10 GB
            'temp_size': db_stats[4],
            # blks_hit/blks_read Should be > 90%
            'blks_read': db_stats[5],
            'blks_hit': db_stats[6],
            'cache_hit_ratio': db_stats[6]/(db_stats[5]+db_stats[6]),
            # user table hit/blks ratio should be > 90%
            'user_blks_read': db_cache[0],
            'user_blks_hit': db_cache[1],
            'user_cache_hit_ratio': db_cache[1]/(db_cache[0]+db_cache[1]),
            # user table hit/blks ratio should be > 90%
            'idx_blks_read': db_idx_cache[0],
            'idx_blks_hit': db_idx_cache[1],
            'idx_cache_hit_ratio': db_idx_cache[1]/(db_idx_cache[0]+db_idx_cache[1]),
            # Should be checkpoints_req < checkpoints_timed
            'checkpoints_req': bgwriter_stats[0],
            'checkpoints_timed': bgwriter_stats[1],
            # Should be high
            'buffers_clean': bgwriter_stats[2],
            # Should be 0
            'maxwritten_clean': bgwriter_stats[3],
            # Should be 0
            'buffers_backend_fsync': bgwriter_stats[4],
            # Should be close to 0 or 0
            'replication_lag': bgwriter_stats[5],
        }
