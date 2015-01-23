import json

from collections import defaultdict

from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection
from django.http import HttpResponse

from catmaid.models import UserRole, Review, ReviewerWhitelist
from catmaid.control.authentication import requires_user_role


def get_treenodes_to_reviews(treenode_ids=None, skeleton_ids=None,
                             umap=lambda r: r):
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
    treenode_to_reviews = defaultdict(list)
    for tid, rid in reviews:
        treenode_to_reviews[tid].append(umap(rid))

    return treenode_to_reviews

def get_treenodes_to_reviews_with_time(treenode_ids=None, skeleton_ids=None,
                             umap=lambda r: r):
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
    treenode_to_reviews = defaultdict(list)
    for tid, rid, rtime in reviews:
        treenode_to_reviews[tid].append( (umap(rid),rtime) )

    return treenode_to_reviews

def get_review_count(skeleton_ids):
    """ Returns a dictionary that maps skelton IDs to dictonaries that map
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
    reviews = defaultdict(lambda: defaultdict(int))
    for row in cursor.fetchall():
        reviews[row[0]][row[1]] = row[2]

    return reviews

def get_review_status(skeleton_ids, project_id=None, whitelist_id=False,
        user_ids=None, excluding_user_ids=None):
    """ Returns a dictionary that maps skeleton IDs to their review
    status as a value between 0 and 100 (integers). If <whitelist_id> is
    not false, reviews are filtered according to the user's whitelist.
    Otherwise, if <user_ids> evaluates to false a union review is returned.
    Otherwise a list of user IDs is expected to create a review status for a
    sub-union or a single user.
    """
    if user_ids and excluding_user_ids:
        raise ValueError("user_ids and excluding_user_ids can't be used at the same time")
    if not skeleton_ids:
        raise ValueError("Need at least one skeleton ID")

    cursor = connection.cursor()

    class Skeleton:
        num_nodes = 0
        num_reviewed = 0
    skeletons = defaultdict(Skeleton)

    # Count nodes of each skeleton
    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM treenode
    WHERE skeleton_id IN (%s)
    GROUP BY skeleton_id
    ''' % ",".join(map(str, skeleton_ids)))
    for row in cursor.fetchall():
        skeletons[row[0]].num_nodes = row[1]

    query_joins = ""
    # Optionally, add a filter
    if whitelist_id:
        query_joins = """
                JOIN reviewer_whitelist wl
                  ON (wl.user_id = %s AND wl.project_id = %s
                      AND r.reviewer_id = wl.reviewer_id
                      AND r.review_time >= wl.accept_after)
                  """ % (whitelist_id, project_id)
        user_filter = ""
    elif user_ids:
        # Count number of nodes reviewed by a certain set of users,
        # per skeleton.
        user_filter = " AND r.reviewer_id IN (%s)" % \
            ",".join(map(str, user_ids))
    elif excluding_user_ids:
        # Count number of nodes reviewed by all users excluding the
        # specified ones, per skeleton.
        user_filter = " AND r.reviewer_id NOT IN (%s)" % \
            ",".join(map(str, excluding_user_ids))
    else:
        # Count total number of reviewed nodes per skeleton, regardless
        # of reviewer.
        user_filter = ""

    cursor.execute('''
    SELECT skeleton_id, count(*)
    FROM (SELECT skeleton_id, treenode_id
          FROM review r %s
          WHERE skeleton_id IN (%s)%s
          GROUP BY skeleton_id, treenode_id) AS sub
    GROUP BY skeleton_id
    ''' % (query_joins, ",".join(map(str, skeleton_ids)), user_filter))
    for row in cursor.fetchall():
        skeletons[row[0]].num_reviewed = row[1]

    status = {}
    for skid, s in skeletons.iteritems():
        ratio = int(100 * s.num_reviewed / s.num_nodes)
        status[skid] = ratio

    return status

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def reviewer_whitelist(request, project_id=None):
    """ Allows users to retrieve (GET) or update (POST) the set of users whose
    reviews they trust for a given project.
    """
    # Ignore anonymous user
    if not request.user.is_authenticated() or request.user.is_anonymous():
        return HttpResponse(json.dumps({'success': "The reviewer whitelist " +
                "of  the anonymous user won't be updated"}),
                content_type='text/json')

    if request.method == 'GET':
        # Retrieve whitelist
        whitelist = ReviewerWhitelist.objects.filter(project_id=project_id,
                user_id=request.user.id).values('reviewer_id', 'accept_after')
        # DjangoJSONEncoder is required to properly encode datetime to ECMA-262
        return HttpResponse(json.dumps(list(whitelist), cls=DjangoJSONEncoder),
                content_type='text/json')

    # Since this is a collections resource replacing all objects, PUT would be
    # correct, but POST is used for consistency with the rest of the API.
    if request.method == 'POST':
        # Update whitelist
        ReviewerWhitelist.objects.filter(
                project_id=project_id, user_id=request.user.id).delete()
        whitelist = [ReviewerWhitelist(
            project_id=project_id, user_id=request.user.id, reviewer_id=int(r),
            accept_after=t) for r,t in request.POST.iteritems()]
        ReviewerWhitelist.objects.bulk_create(whitelist)

        return HttpResponse(
                json.dumps({'success': 'Updated review whitelist'}),
                content_type='text/json')
