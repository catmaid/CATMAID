# -*- coding: utf-8 -*-

from collections import defaultdict
import json
from typing import Any, DefaultDict, Dict, List

from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection
from django.http import HttpRequest, JsonResponse

from guardian.utils import get_anonymous_user

from catmaid.models import UserRole, Review, ReviewerWhitelist
from catmaid.control.authentication import requires_user_role


def get_treenodes_to_reviews(treenode_ids=None, skeleton_ids=None,
                             umap=lambda r: r) -> DefaultDict[Any, List]:
    """ Returns a dictionary that contains all reviewed nodes of the
    passed <treenode_ids> and/or <skeleton_ids> lists as keys. The
    reviewer user IDs are kept in a list as values. A function can be
    passed to which is executed for every reviewer_id to change the
    value stored  result (e.g. to use user names instead of an ID. It
    defaults to the identity and therefore reviewer IDs.
    """
    # Set up filters
    reviews = Review.objects.all()
    if treenode_ids:
        reviews = reviews.filter(treenode_id__in=treenode_ids)
    if skeleton_ids:
        reviews = reviews.filter(skeleton_id__in=skeleton_ids)
    # Only request treenode ID and reviewer ID
    reviews = reviews.values_list('treenode_id', 'reviewer_id')
    # Build dictionary
    treenode_to_reviews = defaultdict(list) # type: DefaultDict[Any, List]
    for tid, rid in reviews:
        treenode_to_reviews[tid].append(umap(rid))

    return treenode_to_reviews

def get_treenodes_to_reviews_with_time(treenode_ids=None, skeleton_ids=None,
                             umap=lambda r: r) -> DefaultDict[Any, List]:
    """ Returns a dictionary that contains all reviewed nodes of the
    passed <treenode_ids> and/or <skeleton_ids> lists as keys. The
    reviewer user IDs are kept in a list as values. A function can be
    passed to which is executed for every reviewer_id to change the
    value stored  result (e.g. to use user names instead of an ID. It
    defaults to the identity and therefore reviewer IDs.
    """
    reviews = Review.objects.all()
    if treenode_ids:
        reviews = reviews.filter(treenode_id__in=treenode_ids)
    if skeleton_ids:
        reviews = reviews.filter(skeleton_id__in=skeleton_ids)
    # Only request treenode ID and reviewer ID
    reviews = reviews.values_list('treenode_id', 'reviewer_id', 'review_time')
    # Build dictionary
    treenode_to_reviews = defaultdict(list) # type: DefaultDict[Any, List]
    for tid, rid, rtime in reviews:
        treenode_to_reviews[tid].append( (umap(rid),rtime) )

    return treenode_to_reviews

def get_review_count(skeleton_ids) -> DefaultDict:
    """ Returns a dictionary that maps skeleton IDs to dictonaries that map
    user_ids to a review count for this particular skeleton.
    """
    # Count nodes that have been reviewed by each user in each partner skeleton
    cursor = connection.cursor()
    cursor.execute('''
    SELECT skeleton_id, reviewer_id, count(*)
    FROM review
    WHERE skeleton_id IN (%s)
    GROUP BY reviewer_id, skeleton_id
    ''' % ",".join(map(str, skeleton_ids)))
    # Build dictionary
    reviews = defaultdict(lambda: defaultdict(int)) # type: DefaultDict
    for row in cursor.fetchall():
        reviews[row[0]][row[1]] = row[2]

    return reviews

def get_review_status(skeleton_ids, project_id=None, whitelist_id=False,
        user_ids=None, excluding_user_ids=None) -> Dict:
    """ Returns a dictionary that maps skeleton IDs to their review
    status as an array of total nodes and number of reviewed nodes
    (integers). If <whitelist_id> is not false, reviews are filtered
    according to the user's whitelist. Otherwise, if <user_ids>
    evaluates to false a union review is returned. Otherwise a list of
    user IDs is expected to create a review status for a sub-union or a
    single user.
    """
    if user_ids and excluding_user_ids:
        raise ValueError("user_ids and excluding_user_ids can't be used at the same time")
    if not skeleton_ids:
        raise ValueError("Need at least one skeleton ID")

    # We need to make sure skeletons are provides as a list like type for
    # PsycoPg.
    if type(skeleton_ids) not in (list, tuple):
        skeleton_ids = list(skeleton_ids)

    cursor = connection.cursor()

    skeletons = {}

    # Get node count for each skeleton
    cursor.execute('''
        SELECT skeleton_id, num_nodes
        FROM catmaid_skeleton_summary s
        JOIN (
            SELECT * FROM UNNEST(%(skeleton_ids)s::bigint[])
        ) query_skeleton(id)
        ON s.skeleton_id = query_skeleton.id
        GROUP BY skeleton_id
    ''', {
        'skeleton_ids': list(skeleton_ids)
    })
    for row in cursor.fetchall():
        skeletons[row[0]] = [row[1], 0]

    query_params = {
        'project_id': project_id,
        'skeleton_ids': skeleton_ids
    }

    query_joins = []
    extra_conditions = ''
    # Optionally, add a filter
    if whitelist_id:
        query_params['whitelist_id'] = whitelist_id
        query_joins.append("""
            JOIN reviewer_whitelist wl
                ON (wl.user_id = %(whitelist_id)s AND wl.project_id = %(project_id)s
                    AND r.reviewer_id = wl.reviewer_id
                    AND r.review_time >= wl.accept_after)
        """)
    elif user_ids:
        # Count number of nodes reviewed by a certain set of users, per
        # skeleton.
        query_params['user_ids'] = list(user_ids)
        query_joins.append("""
            JOIN (
                SELECT * FROM UNNEST(%(user_ids)s::int[])
            ) allowed_user(id)
                ON r.reviewer_id = allowed_user.id
        """)
    elif excluding_user_ids:
        # Count number of nodes reviewed by all users excluding the
        # specified ones, per skeleton.
        query_params['excluding_user_ids'] = list(excluding_user_ids)
        extra_conditions = "WHERE NOT (r.reviewer_id = ANY (%(excluding_user_ids)s::int[]))"

    # Using count(distinct treenode_id) is slightly faster than a nested
    # grouping by skeleton_id, treenode_id, because one HashAggregate node can
    # be avoided.
    cursor.execute('''
    SELECT skeleton_id, count(DISTINCT treenode_id)
    FROM review r
    {}
    JOIN (
        SELECT * FROM UNNEST(%(skeleton_ids)s::bigint[])
    ) query_skeleton(id)
      ON r.skeleton_id = query_skeleton.id
    {}
    GROUP BY skeleton_id
    '''.format('\n'.join(query_joins), extra_conditions), query_params)
    for row in cursor.fetchall():
        skeletons[row[0]][1] = row[1]

    return skeletons

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def reviewer_whitelist(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Allows users to retrieve (GET) or update (POST) the set of users whose
    reviews they trust for a given project.
    """
    # Ignore anonymous user
    if request.user == get_anonymous_user() or not request.user.is_authenticated:
        return JsonResponse({'success': "The reviewer whitelist " +
                "of  the anonymous user won't be updated"})

    if request.method == 'GET':
        # Retrieve whitelist
        whitelist = ReviewerWhitelist.objects.filter(project_id=project_id,
                user_id=request.user.id).values('reviewer_id', 'accept_after')
        # DjangoJSONEncoder is required to properly encode datetime to ECMA-262
        return JsonResponse(list(whitelist), safe=False)

    # Since this is a collections resource replacing all objects, PUT would be
    # correct, but POST is used for consistency with the rest of the API.
    if request.method == 'POST':
        # Update whitelist
        ReviewerWhitelist.objects.filter(
                project_id=project_id, user_id=request.user.id).delete()
        whitelist = [ReviewerWhitelist(
            project_id=project_id, user_id=request.user.id, reviewer_id=int(r),
            accept_after=t) for r,t in request.POST.items()]
        ReviewerWhitelist.objects.bulk_create(whitelist)

        return JsonResponse({
            'success': 'Updated review whitelist'
        })
