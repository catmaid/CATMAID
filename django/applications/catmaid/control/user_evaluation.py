# -*- coding: utf-8 -*-

from collections import defaultdict, namedtuple
from datetime import datetime, timedelta
from functools import partial
import json
from networkx import connected_components
import pytz
from typing import Any, DefaultDict, Dict, List, Optional, Tuple

from django.db.models import Count
from django.http import HttpRequest, JsonResponse

from catmaid.models import Treenode, Log, Relation, TreenodeConnector, \
        UserRole, Review
from catmaid.control.review import get_review_status
from catmaid.control.authentication import requires_user_role
from catmaid.control.tree_util import lazy_load_trees


def _find_nearest(tree, nodes, loc1) -> Tuple[Any, float]:
    """ Returns a tuple of the closest node and the square of the distance. """
    min_sqdist = float('inf')
    for node in nodes:
        loc2 = (tree.node[node]['location_x'],
                tree.node[node]['location_y'],
                tree.node[node]['location_z'])
        dsq = pow(loc1[0] - loc2[0], 2) + pow(loc1[1] - loc2[1], 2) + pow(loc1[2] - loc2[2], 2)
        if dsq < min_sqdist:
            min_sqdist = dsq
            closest = node

    return closest, min_sqdist

def _parse_location(loc):
    return map(float, loc[1:-1].split(','))

def _evaluate_epochs(epochs, skeleton_id, tree, reviews, relations) -> List:
    """ Evaluate each epoch:
    1. Detect merges done by the reviewer: one of the two nodes is edited by the reviewer within the review epoch (but not both: could be a reroot then), with a corresponding join_skeleton entry in the log table. Perhaps the latter is enough, if the x,y,z of the log corresponds to that of the node (plus/minus a tiny bit, may have moved).
    2. Detect additions by the reviewer (a kind of merge), where the reviewer's node is newer than the other node, and it was created within the review epoch. These nodes would have been created and reviewed by the reviewer within the review epoch.
    3. Detect splits by the reviewer: query the log table for split_skeleton events involving the skeleton, performed by the reviewer within the review epoch.
    Returns a list with one entry per epoch, where each entry is an object with three fields:
    4. Detect synapses added by the reviewer within the epoch. Unfortunately, the removal of synapses has not been logged.
    """

    # TODO extended branches when the last node didn't have an ends tag prior to reviewing should not be considered an error.

    # review_date_range: list of two dates, for the oldest and newest node creation time.
    # creation_date_range: dictionary of user_id vs dictionary of 'start' and 'end' datetime instances for node creation.
    # user_node_counts: dictionary of user_id vs count of nodes created within the epoch
    # splits: list of dictionary of user_id vs count
    # merges: list of dictionary of user_id vs count
    # appended: similar to merges; list of dictionary of user_id vs count of nodes added by the reviewer within the review epoch
    # node_count: total number of nodes reviewed within the epoch.
    EpochOps = namedtuple('EpochOps', ['reviewer_id', 'review_date_range', 'creation_date_range', 'user_node_counts', 'splits', 'merges', 'appended', 'node_count', 'n_pre', 'n_post', 'reviewer_n_pre', 'reviewer_n_post', 'newer_pre_count', 'newer_post_count'])

    # List of EpochOps, indexed like epochs
    epoch_ops = []

    # Synapses on the arbor: keyed by treenode_id
    all_synapses = defaultdict(list) # type: DefaultDict[Any, List]
    for s in TreenodeConnector.objects.filter(skeleton=skeleton_id,
                                              relation__in=(relations['presynaptic_to'],
                                                            relations['postsynaptic_to'])):
        all_synapses[s.treenode_id].append(s)

    for epoch in epochs:

        reviewer_id, nodes = epoch

        # Range of the review epoch
        start_date = datetime.max.replace(tzinfo=pytz.utc)
        end_date = datetime.min.replace(tzinfo=pytz.utc)

        # Range for node creation, per user
        def default_dates():
            return {'start': datetime.max.replace(tzinfo=pytz.utc),
                    'end': datetime.min.replace(tzinfo=pytz.utc)}
        user_ranges = defaultdict(default_dates) # type: DefaultDict[Any, Dict[str, Any]]

        # Node counts per user
        user_node_counts = defaultdict(int) # type: DefaultDict[Any, int]

        # Synapses for the set of nodes reviewed in this epoch, keyed by user_id and relation
        nodes_synapses = defaultdict(partial(defaultdict, list)) # type: DefaultDict

        # Synapses, keyed by user and relation, created by a user other than the user who created the treenode, after the treeenode's creation time
        newer_synapses_count = defaultdict(partial(defaultdict, int)) # type: DefaultDict

        for node in nodes:
            props = tree.node[node]
            # Find out review date range for this epoch, based on most recent
            # reviews
            tr = reviews[node][0].review_time
            start_date = min(start_date, tr)
            end_date = max(end_date, tr)
            # Count nodes created by each user
            user_id = props['user_id']
            user_node_counts[user_id] += 1
            # Find out date range for each user's created nodes
            u = user_ranges[user_id]
            tc = props['creation_time']
            u['start'] = min(u['start'], tc)
            u['end'] = max(u['end'], tc)
            # Synapses
            syns = all_synapses.get(node)
            if syns:
                for s in syns:
                    nodes_synapses[s.user_id][s.relation_id].append(s)
                    # Count synapses created by a user other than the user that created the treenode, after the treenode was created
                    if s.user_id != user_id and s.creation_time > tc:
                        newer_synapses_count[s.relation_id][user_id] += 1


        def in_range(date):
            return start_date <= date <= end_date

        # Total number of synapses related to nodes reviewed within the epoch
        epoch_n_pre = sum(len(r.get(relations['presynaptic_to'], [])) for r in nodes_synapses.values())
        epoch_n_post = sum(len(r.get(relations['postsynaptic_to'], [])) for r in nodes_synapses.values())

        # Find out synapses added by the reviewer within the epoch, keyed by treenode user
        reviewer_n_pre = defaultdict(int) # type: DefaultDict[Any, int]
        reviewer_n_post = defaultdict(int) # type: DefaultDict[Any, int]
        reviewer_synapses = nodes_synapses.get(reviewer_id)

        if reviewer_synapses:
            pre = reviewer_synapses.get(relations['presynaptic_to'])
            if pre:
                for s in pre:
                    if in_range(s.creation_time):
                        reviewer_n_pre[tree.node[s.treenode_id]['user_id']] += 1
            post = reviewer_synapses.get(relations['postsynaptic_to'])
            if post:
                for s in post:
                    if in_range(s.creation_time):
                        reviewer_n_post[tree.node[s.treenode_id]['user_id']] += 1


        date_range = [start_date, end_date]

        log_ops = Log.objects.filter(
                      user_id=reviewer_id,
                      freetext__contains=' %s ' % skeleton_id,
                      creation_time__range=date_range,
                      operation_type__in=('split_skeleton', 'join_skeleton')) \
                   .values_list('operation_type', 'location')

        # Only join_skeleton operations performed by the reviewer
        # within the reviewing epoch are considered.
        # The potential errors arising from the fact that the freetext
        # of the join_skeleton contains two skeleton IDs is solved by
        # the fact that of these, only one skeleton survives the merge,
        # and it is always the one in question by definition.
        splits = defaultdict(int) # type: DefaultDict[Any, int]
        merges = defaultdict(int) # type: DefaultDict[Any, int]
        appended = defaultdict(list) # type: DefaultDict[Any, List]

        epoch_ops.append(EpochOps(reviewer_id, date_range, user_ranges,
            user_node_counts, splits, merges, appended, len(nodes),
            epoch_n_pre, epoch_n_post, reviewer_n_pre, reviewer_n_post,
            newer_synapses_count.get(relations['presynaptic_to'], {}),
            newer_synapses_count.get(relations['postsynaptic_to'], {})))


        for operation_type, location in log_ops:
            # find nearest node to x,y,z of the logged operation
            # NOTE this is a potential source of false positives.
            # For merges, the sqdist should be very close to zero.
            # For splits, the x,y,z are if the splitted node, which may no longer be part of the arbor (but could have been joined again).
            # False positives could originate in splitted and re-joined nodes (invalid split and merge error), and in deleted and re-created nodes (potentially incorrect user attribution).
            node, sqdist = _find_nearest(tree, nodes, _parse_location(location))

            if 'split_skeleton' == operation_type:
                splits[tree.node[node]['user_id']] += 1

            elif 'join_skeleton' == operation_type:
                edges = tree[node]
                if edges:
                    # Replace node with its parent
                    node = next(edges.keys())
                merges[tree.node[node]['user_id']] += 1

        # Count nodes created by the reviewer, as well as
        # the number of connected arbors made by that nodes
        # which will add to the count of merges missed.
        def newlyAdded(node):
            props = tree.node[node]
            return props['user_id'] == reviewer_id and in_range(props['creation_time'])

        owned = filter(newlyAdded, nodes)

        if owned:
            sub = tree.subgraph(owned)
            additions = connected_components(sub.to_undirected())
            for addition in additions:
                # Find a node whose parent's creator is not the reviewer, if any
                # (Could not find any if the reviewer had created that parent node
                # outside of the review epoch, in which case it does not count
                # as an error)
                for node in addition:
                    edges = tree[node]
                    if edges:
                        parent = next(edges.keys())
                        creator_id = tree.node[parent]['user_id']
                        if creator_id != reviewer_id:
                            appended[creator_id].append(len(addition))
                            break


    return epoch_ops

def _split_into_epochs(skeleton_id, tree, reviews, max_gap) -> List:
    """ Split the arbor into one or more review epochs.
    An epoch is defined as a continuous range of time containing gaps
    of up to max_gap (e.g. 3 days) and fully reviewed by the same reviewer.
    Treenodes reviewed within an epoch may not form a coherent subset of the arbor,
    given that different subsets of the arbor may have been joined at a later time. """

    # Sort nodes by date of most recent review (first in list)
    def get_review_time(e):
        return reviews[e[0]][0].review_time
    nodes = sorted(tree.nodes_iter(data=True), key=get_review_time)

    # Grab the oldest node
    oldest = nodes[0]
    last_id = oldest[0] # id of first node
    last = oldest[1] # props of first node

    # First epoch contains the oldest node
    epoch = [last_id]

    # Most recent review of first node
    last_review = reviews[last_id][0]

    # Collect epochs
    epochs = [(last_review.reviewer_id, epoch)]

    # Iterate from second-oldest node forward in time
    for node, props in nodes:
        # Most recent review of current node
        node_review = reviews[node][0]
        # Add to current epoch if same reviewer and we are within max_gap
        if node_review.reviewer_id == last_review.reviewer_id and \
                node_review.review_time - last_review.review_time < max_gap:
            epoch.append(node)
        else:
            # Start new epoch
            epoch = [node]
            epochs.append((node_review.reviewer_id, epoch))

        last_review = reviews[node][0]

    return epochs


def _evaluate_arbor(user_id, skeleton_id, tree, reviews, relations, max_gap) -> List:
    """ Split the arbor into review epochs and then evaluate each independently. """
    epochs = _split_into_epochs(skeleton_id, tree, reviews, max_gap)
    epoch_ops = _evaluate_epochs(epochs, skeleton_id, tree, reviews, relations)
    return epoch_ops


def _evaluate(project_id, user_id, start_date, end_date, max_gap, min_nodes) -> Optional[List[Dict]]:

    # Obtain neurons that are fully reviewed at the moment
    # and to which the user contributed nodes within the date range.

    # 1. Find out skeleton_ids towards which the user contributed
    #    within the date range
    ts = Treenode.objects.filter(
            user_id=user_id,
            creation_time__range = (start_date, end_date)) \
         .values_list('skeleton') \
         .annotate(Count('skeleton'))

    # Pick only skeletons for which the user contributed at least min_nodes
    skeleton_ids = set(skid for skid, count in ts if count > min_nodes)

    if not skeleton_ids:
        return None

    # Find the subset of fully reviewed (union without evaluated user) skeletons
    review_status = get_review_status(skeleton_ids)

    not_fully_reviewed = set()
    for skid, status in review_status.items():
        if status[0] != status[1]:
            not_fully_reviewed.add(skid)

    skeleton_ids = skeleton_ids - not_fully_reviewed

    if not skeleton_ids:
        return None

    # Get review information and organize it by skeleton ID and treenode ID
    reviews = defaultdict(lambda: defaultdict(list)) # type: DefaultDict
    for r in Review.objects.filter(skeleton_id__in=skeleton_ids):
        reviews[r.skeleton_id][r.treenode_id].append(r)

    # Sort all reviews of all treenodes by review time, most recent first
    for skid, tid_to_rs in reviews.items():
        for tid, rs in tid_to_rs.items():
            rs.sort(key=lambda r: r.review_time)
            rs.reverse()

    relations = dict(Relation.objects.filter(project_id=project_id, relation_name__in=['presynaptic_to', 'postsynaptic_to']).values_list('relation_name', 'id'))

    # 2. Load each fully reviewed skeleton one at a time
    evaluations = {skid: _evaluate_arbor(user_id, skid, tree, reviews[skid], relations, max_gap) \
        for skid, tree in lazy_load_trees(skeleton_ids, ('location_x', 'location_y', 'location_z', \
                                                         'creation_time', 'user_id', 'editor_id', \
                                                         'edition_time'))}

    # 3. Extract evaluations for the user_id over time
    # Each evaluation contains an instance of EpochOps namedtuple, with members:
    # 'review_date_range', 'creation_date_range', 'user_node_counts',
    # 'splits', 'merges', 'appended', 'node_count'

    # The X axis is the last (user) creation date within the review epoch
    # The Y axis is multiple, and includes:
    #  * skeleton_id
    #  * reviewer_id
    #  * time of the last node created by the user_id in skeleton_id
    #  * nodes contributed by the user that were reviewed within the epoch
    #  * number of nodes missed by the user (which were added by the reviewer)
    #  * splits onto the user's nodes
    #  * merges onto the user's nodes
    #  * additions by the reviewer onto nodes of this user (another form of merges)
    #  * total number of presynaptic relations of skeleton_id
    #  * total number of postsynaptic relations of skeleton_id
    #  * number of presynaptic_to relations created by the reviewer within the review period onto treenodes created by user_id
    #  * number of postsynaptic_to relations created by the reviewer within the review period onto treenodes created by user_id
    #  * newer_synapses: number of synapses created by someone else onto treenodes created by user_id, after the creation of the treenode

    d = []

    for skid, arbor_epoch_ops in evaluations.items():
        for epoch_ops in arbor_epoch_ops:
            if 0 == epoch_ops.user_node_counts[user_id]:
                # user did not contribute at all to this chunk
                continue
            appended = epoch_ops.appended[user_id]
            d.append({'skeleton_id': skid,
                      'reviewer_id': epoch_ops.reviewer_id,
                      'timepoint': epoch_ops.creation_date_range[user_id]['end'].strftime('%Y-%m-%d'),
                      'n_created_nodes': epoch_ops.user_node_counts[user_id],
                      'n_nodes': epoch_ops.node_count,
                      'n_missed_nodes': sum(appended),
                      'n_splits': epoch_ops.splits[user_id],
                      'n_merges': epoch_ops.merges[user_id] + len(appended),
                      'n_pre': epoch_ops.n_pre,
                      'n_post': epoch_ops.n_post,
                      'reviewer_n_pre': epoch_ops.reviewer_n_pre.get(user_id, 0),
                      'reviewer_n_post': epoch_ops.reviewer_n_post.get(user_id, 0),
                      'newer_pre': epoch_ops.newer_pre_count.get(user_id, 0),
                      'newer_post': epoch_ops.newer_post_count.get(user_id, 0)})

    return d


def _parse_date(s):
    """ Accepts a date as e.g. '2012-10-07' """
    return datetime(*(map(int, s.split('-')))) # type: ignore

# TODO a better fit would be an admin or staff user
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def evaluate_user(request:HttpRequest, project_id=None) -> JsonResponse:
    user_id = int(request.POST.get('user_id'))
    # Dates as strings e.g. "2012-10-07"
    start_date = _parse_date(request.POST.get('start_date'))
    end_date = _parse_date(request.POST.get('end_date'))
    max_gap = timedelta(int(request.POST.get('max_gap', 3)))
    min_nodes = int(request.POST.get('min_nodes', 100))
    if min_nodes < 1:
        min_nodes = 1

    return JsonResponse(_evaluate(project_id, user_id, start_date, end_date,
        max_gap, min_nodes), safe=False)

