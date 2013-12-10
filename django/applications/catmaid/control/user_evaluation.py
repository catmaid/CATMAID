from datetime import datetime, timedelta
from catmaid.models import Treenode, Log
from catmaid.fields import Double3D
from django.db.models import Count
from django.http import HttpResponse
from catmaid.control.tree_util import lazy_load_trees
from collections import defaultdict, namedtuple
from itertools import imap
import json
from operator import attrgetter
from networkx import connected_components
from functools import partial


def _find_nearest(tree, nodes, loc1):
    """ Returns a tuple of the closest node and the square of the distance. """
    min_sqdist = float('inf')
    for node in nodes:
        loc2 = tree.node[node]['location']
        dsq = pow(loc1.x - loc2.x, 2) + pow(loc1.y - loc2.y, 2) + pow(loc1.z - loc2.z, 2)
        if dsq < min_sqdist:
            min_sqdist = dsq
            closest = node

    return node, min_sqdist

def _parse_location(loc):
    return Double3D(*(imap(float, loc[1:-1].split(','))))

def _evaluate_epochs(epochs, skeleton_id, tree):
    """ Evaluate each epoch:
    1. Detect merges done by the reviewer: one of the two nodes is edited by the reviewer within the review epoch (but not both: could be a reroot then), with a corresponding join_skeleton entry in the log table. Perhaps the latter is enough, if the x,y,z of the log corresponds to that of the node (plus/minus a tiny bit, may have moved).
    2. Detect additions by the reviewer (a kind of merge), where the reviewer's node is newer than the other node, and it was created within the review epoch. These nodes would have been created and reviewed by the reviewer within the review epoch.
    3. Detect splits by the reviewer: query the log table for split_skeleton events involving the skeleton, performed by the reviewer within the review epoch.
    Returns a list with one entry per epoch, where each entry is an object with three fields: 
    """

    # review_date_range: list of two dates, for the oldest and newest node creation time.
    # creation_date_range: dictionary of user_id vs dictionary of 'start' and 'end' datetime instances for node creation.
    # user_node_counts: dictionary of user_id vs count of nodes created within the epoch
    # splits: list of dictionary of user_id vs count
    # merges: list of dictionary of user_id vs count
    # appended: similar to merges; list of dictionary of user_id vs count of nodes added by the reviewer within the review epoch
    # node_count: total number of nodes reviewed within the epoch.
    EpochOps = namedtuple('EpochOps', ['review_date_range', 'creation_date_range', 'user_node_counts', 'splits', 'merges', 'appended', 'node_count'])

    # List of EpochOps, indexed like epochs
    epoch_ops = []

    for epoch in epochs:

        reviewer_id, nodes = epoch

        # Range of the review epoch
        start_date = datetime.max
        end_date = datetime.min

        # Range for node creation, per user
        def default_dates():
            return {'start': datetime.max,
                    'end': datetime.min}
        user_ranges = defaultdict(default_dates)

        # Node counts per user
        user_node_counts = defaultdict(int)

        for node in nodes:
            props = tree.node[node]
            # Find out review date range for this epoch
            tr = props['review_time']
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

        def in_range(date):
            return start_date <= date <= end_date

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
        splits = defaultdict(int)
        merges = defaultdict(int)
        appended = defaultdict(list)

        epoch_ops.append(EpochOps(date_range, user_ranges, user_node_counts, splits, merges, appended, len(nodes)))


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
                    node = edges.iterkeys().next()
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
                        parent = edges.iterkeys().next()
                        creator_id = tree.node[parent]['user_id']
                        if creator_id != reviewer_id:
                            appended[creator_id].append(len(addition))
                            break

    return epoch_ops

def _split_into_epochs(skeleton_id, tree):
    """ Split the arbor into one or more review epochs.
    An epoch is defined as a continuous range of time containing gaps of up to 3 days
    and fully reviewed by the same reviewer.
    Treenodes reviewed within an epoch may not form a coherent subset of the arbor,
    given that different subsets of the arbor may have been joined at a later time. """

    # Sort nodes by date
    def get_review_time(e):
        return e[1]['review_time']
    nodes = sorted(tree.nodes_iter(data=True), key=get_review_time)

    # Grab the oldest node
    oldest = nodes[0]
    last = oldest[1] # props of first node 

    # First epoch contains the oldest node
    epoch = [oldest[0]] # id of first node

    # Collect epochs
    epochs = [(last['reviewer_id'], epoch)]
    max_gap = timedelta(3)

    # Iterate from second-oldest node forward in time
    for node, props in nodes:
        if props['reviewer_id'] == last['reviewer_id'] and props['review_time'] - last['review_time'] < max_gap:
            epoch.append(node)
        else:
            # Start new epoch
            epoch = [node]
            epochs.append((props['reviewer_id'], epoch))

        last = props

    return epochs


def _evaluate_arbor(user_id, skeleton_id, tree):
    """ Split the arbor into review epochs and then evaluate each independently. """
    epochs = _split_into_epochs(skeleton_id, tree)
    epoch_ops = _evaluate_epochs(epochs, skeleton_id, tree)
    return epoch_ops


def _evaluate(user_id, start_date, end_date):

    # Obtain neurons that are fully reviewed at the moment
    # and to which the user contributed nodes within the date range.

    # 1. Find out skeleton_ids towards which the user contributed
    #    within the date range
    ts = Treenode.objects.filter(
            user_id=user_id,
            creation_time__range = (start_date, end_date)) \
         .values_list('skeleton') \
         .annotate(Count('skeleton'))

    # Pick only skeletons for which the user contributed more than one treenode
    skeleton_ids = set(skid for skid, count in ts if count > 1)

    if not skeleton_ids:
        return None

    # Find the subset of fully reviewed skeletons
    ts = Treenode.objects.filter(skeleton__in=skeleton_ids) \
         .values_list('skeleton', 'reviewer_id') \
         .annotate(Count('reviewer_id'))

    review_status = defaultdict(partial(defaultdict, int))
    for skid, reviewer_id, count in ts:
        review_status[skid][reviewer_id] = count

    not_fully_reviewed = set()
    for skid, reviewers in review_status.iteritems():
        if -1 in reviewers:
            not_fully_reviewed.add(skid)

    skeleton_ids = skeleton_ids - not_fully_reviewed

    if not skeleton_ids:
        return None

    # 2. Load each fully reviewed skeleton one at a time
    evaluations = {skid: _evaluate_arbor(user_id, skid, tree) for skid, tree in lazy_load_trees(skeleton_ids, ('location', 'creation_time', 'user_id', 'reviewer_id', 'review_time', 'editor_id', 'edition_time'))}

    # 3. Extract evaluations for the user_id over time
    # Each evaluation contains an instance of EpochOps namedtuple, with members:
    # 'review_date_range', 'creation_date_range', 'user_node_counts',
    # 'splits', 'merges', 'appended', 'node_count'

    # The X axis is the last (user) creation date within the review epoch
    # The Y axis is multiple, and includes:
    #  * splits onto the user's nodes
    #  * merges onto the user's nodes
    #  * additions by the reviewer onto nodes of this user (another form of merges)
    #  * nodes contributed by the user that were reviewed within the epoch

    d = []

    for skid, arbor_epoch_ops in evaluations.iteritems():
        for epoch_ops in arbor_epoch_ops:
            if 0 == epoch_ops.user_node_counts[user_id]:
                # user did not contribute at all to this chunk
                continue
            appended = epoch_ops.appended[user_id]
            d.append({'skeleton_id': skid,
                      'timepoint': epoch_ops.creation_date_range[user_id]['end'],
                      'n_created_nodes': epoch_ops.user_node_counts[user_id],
                      'n_total_nodes': epoch_ops.node_count,
                      'n_missed_nodes': sum(x for x in appended),
                      'n_splits': epoch_ops.splits[user_id],
                      'n_merges': epoch_ops.merges[user_id] + len(appended)})

    return d


def _parse_date(s):
    """ Accepts a date as e.g. '2012-10-07' """
    return datetime(*(imap(int, s.split('-'))))

def evaluate_user(request, project_id=None):
    project_id = int(project_id)
    user_id = request.POST.get('user_id')
    # Dates as strings e.g. "2012-10-07"
    start_date = _parse_date(request.POST.get('start_date'))
    end_date = _parse_date(request.POST.get('end_date'))

    return HttpResponse(json.dumps(_evaluate(user_id, start_date, end_date)))

