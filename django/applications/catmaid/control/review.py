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
