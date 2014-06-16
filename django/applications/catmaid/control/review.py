from collections import defaultdict

from catmaid.models import Review

from django.db import connection


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

def get_review_count(skeleton_ids):
    """ Returns a dictionary that maps skelton IDs to dictonaries that map
    user_ids to a review count for this particular skeleton.
    """
    # Count nodes that have been reviewed by each user in each partner skeleton
    cursor = connection.cursor()
    cursor.execute('''
    SELECT skeleton_id, reviewer_id, count(skeleton_id)
    FROM review
    WHERE skeleton_id IN (%s)
    GROUP BY reviewer_id, skeleton_id
    ''' % ",".join(str(skid) for skid in skeleton_ids))
    # Build dictionary
    reviews = defaultdict(lambda: defaultdict(int))
    for row in cursor.fetchall():
        reviews[row[0]][row[1]] = row[2]

    return reviews

def get_review_status(skeleton_ids, user_ids=None, excluding_user_ids=None):
    """ Returns a dictionary that maps skeleton IDs to their review
    status as a value between 0 and 100 (integers). If <user_ids>
    evaluates to false a union review is returned. Otherwise a list
    of user IDs is expected to create a review status for a sub-union
    or a single user.
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
    ''' % ",".join(str(skid) for skid in skeleton_ids))
    for row in cursor.fetchall():
        skeletons[row[0]].num_nodes = row[1]

    # Optionally, add a user filter
    if user_ids:
        # Count number of nodes reviewed by a certain set of users,
        # per skeleton.
        user_filter = " AND reviewer_id IN (%s)" % \
            ",".join(str(uid) for uid in user_ids)
    elif excluding_user_ids:
        # Count number of nodes reviewed by all users excluding the
        # specified ones, per skeleton.
        user_filter = " AND reviewer_id NOT IN (%s)" % \
            ",".join(str(uid) for uid in excluding_user_ids)
    else:
        # Count total number of reviewed nodes per skeleton, regardless
        # of reviewer.
        user_filter = ""

    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM (SELECT skeleton_id, treenode_id
          FROM review
          WHERE skeleton_id IN (%s)%s
          GROUP BY skeleton_id, treenode_id) AS sub
    GROUP BY skeleton_id
    ''' % (",".join(str(skid) for skid in skeleton_ids), user_filter))
    for row in cursor.fetchall():
        skeletons[row[0]].num_reviewed = row[1]

    status = {}
    for skid, s in skeletons.iteritems():
        ratio = int(100 * s.num_reviewed / s.num_nodes)
        status[skid] = ratio

    return status
