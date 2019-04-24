# -*- coding: utf-8 -*-
from django.db import connection
from collections import defaultdict
from itertools import chain
from typing import Any, DefaultDict, List, Set

def find_empty_neurons() -> Set:
    """ Returns a set of empty neurons. Also prints the total
    number of neurons and the total number of neurons for which
    at least one skeleton is a model_of.
    A one-liner would enable deleting them all from the ipython shell:
    ClassInstance.objects.filter(id__in=find_empty_neurons()).delete() """

    cursor = connection.cursor()

    # Select the IDs of all neurons
    cursor.execute("""
    SELECT class_instance.id
    FROM class_instance,
         class
    WHERE class_instance.class_id = class.id
      AND class.class_name = 'neuron'""")
    neuron_ids = set(row[0] for row in cursor.fetchall())

    # Select the IDs of all neurons modeled by a skeleton
    cursor.execute("""
    SELECT ci2.id
    FROM class_instance_class_instance cici,
         class_instance ci1,
         class_instance ci2,
         relation r,
         class c1,
         class c2
    WHERE cici.class_instance_a = ci1.id
      AND cici.class_instance_b = ci2.id
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
      AND ci1.class_id = c1.id
      AND c1.class_name = 'skeleton'
      AND ci2.class_id = c2.id
      AND c2.class_name = 'neuron'""")
    modeled_neuron_ids = set(row[0] for row in cursor.fetchall())

    empty_neuron_ids = neuron_ids - modeled_neuron_ids
    print("Total neurons:", len(neuron_ids))
    print("Neurons with at least one skeleton:", len(modeled_neuron_ids))
    print("Empty neurons:", len(empty_neuron_ids))
    return empty_neuron_ids


def neuron_treenode_counts(neuron_ids) -> DefaultDict[Any, List]:
    """ Given a collection of neuron IDs, check whether a skeleton exists for each,
    and return a map of number of nodes per skeleton as key, and as value a list
    of neuron IDs that have skeletons with that many nodes. Keep in mind that a
    neuron may be modeled by more than one skeleton.
    This function is meant as a sanity check for the empty_neuron_ids() function. """

    cursor = connection.cursor()

    # Find skeletons for each neuron
    cursor.execute("""
    SELECT cici.class_instance_a,
           cici.class_instance_b
    FROM class_instance_class_instance cici,
         relation r
    WHERE cici.class_instance_b IN (%s)
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
    """ % ','.join(map(str, neuron_ids)))
    # Collect a map of skeleton IDs vs neuron IDs
    # (Keep in mind that a neuron may have one skeleton, more than one, or none)
    skeleton_neuron = {row[0]: row[1] for row in cursor.fetchall()}

    # Collect a map of treenode counts vs list of neurons with a skeleton that has that many treenodes
    counts = defaultdict(list) # type: DefaultDict[Any, List]
    neurons_with_treenodes = set()
    if skeleton_neuron:
        cursor.execute("""
        SELECT count(*), skeleton_id
        FROM treenode
        WHERE skeleton_id IN (%s)
        GROUP BY skeleton_id
        """ % ','.join(chain.from_iterable(skeleton_neuron.keys()))) # flatten list of lists
        for row in cursor.fetchall():
            # counts of skeleton treenodes vs list of neuron IDs
            neuronID = skeleton_neuron[row[1]]
            counts[row[0]].append(neuronID)
            neurons_with_treenodes.add(neuronID)

    # Count neurons without skeletons or with empty skeletons
    neuron_ids = neuron_ids if set == type(neuron_ids) else set(neuron_ids)
    counts[0] = list(neuron_ids - neurons_with_treenodes)

    return counts



