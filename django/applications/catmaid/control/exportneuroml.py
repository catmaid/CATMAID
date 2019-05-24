# -*- coding: utf-8 -*-

# A file to contain exclusively dependencies of the NeuroML package.
# See:
#    https://github.com/NeuralEnsemble/libNeuroML
#    http://neuroml.org

import logging

from collections import defaultdict
from typing import Any, DefaultDict, Dict, List

try:
    from neuroml import Cell, Segment, SegmentParent, Morphology, \
            NeuroMLDocument, Point3DWithDiam
except ImportError:
    logging.getLogger(__name__).warning("NeuroML module could not be loaded.")

# Because of the conditional imports, full type annotation of this file is not possible

def neuroml_single_cell(skeleton_id, nodes, pre, post) -> Cell:
    """ Encapsulate a single skeleton into a NeuroML Cell instance.
        
        skeleton_id: the ID of the skeleton to which all nodes belong.
        nodes: a dictionary of node ID vs tuple of node parent ID, location as a tuple of 3 floats, and radius. In nanometers.
        pre: a dictionary of node ID vs list of connector ID
        post: a dictionary of node ID vs list of connector ID

        Returns a Cell with id=skeleton_id.
    """

    # Collect the children of every node
    successors = defaultdict(list) # type: DefaultDict[Any, List]
                                   # parent node ID vs list of children node IDs
    rootID = None
    for nodeID, props in nodes.items():
        parentID = props[0]
        if not parentID:
            rootID = nodeID
            continue
        successors[parentID].append(nodeID) 

    # Cache of Point3DWithDiam
    points = {} # type: Dict

    def asPoint(nodeID):
        """ Return the node as a Point3DWithDiam, in micrometers. """
        p = points.get(nodeID)
        if not p:
            props = nodes[nodeID]
            radius = props[2]
            if radius < 0:
                radius = 0.1 # FUTURE Will have to change
            loc = props[1]
            # Point in micrometers
            p = Point3DWithDiam(loc[0] / 1000.0, loc[1] / 1000.0, loc[2] / 1000.0, radius)
            points[nodeID] = p
        return p

    
    # Starting from the root node, iterate towards the end nodes, adding a segment
    # for each parent-child pair.

    segments = [] # type: List
    segment_id = 1
    todo = [rootID]

    # VERY CONFUSINGLY, the Segment.parent is a SegmentParent with the same id as the parent Segment. An unseemly overheady way to reference the parent Segment.

    while todo:
        nodeID = todo.pop()
        children = successors[nodeID]
        if not children:
            continue
        p1 = asPoint(nodeID)
        parent = segments[-1] if segments else None
        segment_parent = SegmentParent(segments=parent.id) if parent else None
        for childID in children:
            p2 = asPoint(childID)
            segment_id += 1
            segment = Segment(proximal=p1, distal=p2, parent=segment_parent)
            segment.id = segment_id
            segment.name = "%s-%s" % (nodeID, childID)
            segments.append(segment)
            todo.append(childID)

    # Pack the segments into a Cell
    morphology = Morphology()
    morphology.segments.extend(segments)
    morphology.id = "Skeleton #%s" % skeleton_id

    # Synapses: TODO requires input from Padraig Gleeson

    cell = Cell()
    cell.name = 'Cell'
    cell.id = skeleton_id
    cell.morphology = morphology

    return cell


def neuroml_network(cells, response):
    """ Write a list of Cell instances.
        
        cells: a list of Cell instances.
        response: somewhere to write to, like an HttpResponse

        Returns nothing.
    """

    doc = NeuroMLDocument()
    doc.cells.extend(cells)
    doc.id = "NeuroMLDocument"

    namespacedef = 'xmlns="http://www.neuroml.org/schema/neuroml2"' \
                   + ' xmlns:xi="http://www.w3.org/2001/XInclude"' \
                   + ' xmlns:xs="http://www.w3.org/2001/XMLSchema"' \
                   + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' \
                   + ' xsi:schemaLocation="http://www.w3.org/2001/XMLSchema"'

    doc.export(response, 0, name_="neuroml", namespacedef_=namespacedef)

    return response
