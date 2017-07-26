# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import time
import pytz
from datetime import timedelta, datetime
from dateutil import parser as dateparser

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.db.models.aggregates import Count
from django.db import connection, transaction
from django.utils import timezone

from rest_framework.decorators import api_view

from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map
from catmaid.models import ClassInstance, Connector, Treenode, User, UserRole, \
        Review, Relation, TreenodeConnector


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def stats_nodecount(request, project_id=None):
    """ Get the total number of nodes per user.
    """
    cursor = connection.cursor()
    names = dict(User.objects.values_list('id', 'username'))

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
        SELECT user_id, SUM(n_treenodes)
        FROM result_with_precomputation, last_precomputation
        WHERE last_precomputation.max_date IS NOT NULL
        GROUP BY user_id

        -- If there was no precomputation (max_date is null), do a simpler
        -- counting that doesn't involve date comparisons. In this case
        -- duplicates are impossible.
        UNION ALL
        SELECT user_id, count(*)
        FROM treenode, last_precomputation
        WHERE project_id = %(project_id)s
        AND last_precomputation IS NULL
        GROUP BY user_id
    ''', dict(project_id=int(project_id)))

    result = {'users': [],
              'values': []}
    for row in cursor.fetchall():
        result['values'].append(int(row[1]))
        s = (names[row[0]], row[1]) if -1 != row[0] else ("*anonymous*", row[1])
        result['users'].append('%s (%d)' % s)

    return JsonResponse(result)


@requires_user_role(UserRole.Browse)
def stats_editor(request, project_id=None):
    cursor = connection.cursor()
    cursor.execute('''
        SELECT editor_id, count(editor_id)
        FROM treenode
        WHERE project_id=%(project_id)s
          AND editor_id != user_id
        GROUP BY editor_id
    ''', dict(project_id=int(project_id)))


    # Get name dictonary separately to avoid joining the user table to the
    # treenode table, which in turn improves performance.
    names = dict(User.objects.values_list('id', 'username'))

    result = {'users': [],
              'values': []}
    for row in cursor.fetchall():
        result['values'].append(int(row[1]))
        s = (names[row[0]], row[1]) if -1 != row[0] else ("*unedited*", row[1])
        result['users'].append('%s (%d)' % s)

    return JsonResponse(result)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_summary(request, project_id=None):
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
    return HttpResponse(json.dumps(result), content_type='application/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stats_history(request, project_id=None):
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

    return HttpResponse(json.dumps(stats), content_type='application/json')

def stats_user_activity(request, project_id=None):
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
    return HttpResponse(json.dumps({'skeleton_nodes': timepoints,
         'presynaptic': prelinks, 'postsynaptic': postlinks}), content_type='application/json')

@api_view(['GET'])
def stats_user_history(request, project_id=None):
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
    stats_table = {}
    for userid in all_users:
        if userid == -1:
            continue
        userid = str(userid)
        stats_table[userid] = {}
        for i in range(daydelta):
            date = (start_date + timedelta(days=i)).strftime("%Y%m%d")
            stats_table[userid][date] = {}

    cursor = connection.cursor()

    treenode_stats = select_cable_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)
    connector_stats = select_connector_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)
    tree_reviewed_nodes = select_review_stats(cursor, project_id,
            start_date_utc, end_date_utc, time_zone)

    for di in treenode_stats:
        user_id = str(di[0])
        date = di[1].strftime('%Y%m%d')
        stats_table[user_id][date]['new_treenodes'] = di[2]

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
    # demand.
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
            SUM(t.n_treenodes)
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
            ROUND(SUM(l.cable_length))
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
    # second node is younger than the first one
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
            SUM(l.n_connector_links)
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
    # demand.
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
            SUM(r.n_reviewed_nodes)
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
def populate_stats_summary(project_id, delete=False, incremental=True):
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

def populate_review_stats_summary(project_id, incremental=True, cursor=None):
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

def populate_connector_stats_summary(project_id, incremental=True, cursor=None):
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

def populate_cable_stats_summary(project_id, incremental=True, cursor=None):
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

def populate_nodecount_stats_summary(project_id, incremental=True,
                                     cursor=None):
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
