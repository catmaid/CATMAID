# -*- coding: utf-8 -*-

# Export functions for NeuroML NetworkML 1.8.1

# TODO Should have been implemented in the client side in javascript
# given that the amount of data to transfer would have been smaller,
# and no computations would bog down the server.
# TODO Synapses are potentially incorrect: the properties of release
# are expected to be the same for all postsynaptic members
# of the polyadic synapse, because NeuroML cannot express polyadic synapses.
# TODO Consider removing segments when the soma segment radius is large.


import time

from collections import defaultdict
from typing import Any, DefaultDict, Dict, List, Tuple

def exportMutual(neuron_names, all_treenodes, connections, scale=0.001):
    """ Export a group of neuronal arbors and their synapses as NeuroML Level 3 v1.8.1.
    all_treenodes: an iterator (can be lazy) of treenodes like [<id>, <parent_id>, <location>, <radius>, <skeleton_id>].
    connections: a dictionary of skeleton ID vs tuple of tuple of tuples, each a pair containing the presynaptic treenode ID and the map of connector ID vs list of postsynaptic treenode IDs.
    scale: defaults to 0.001 to transform nanometers (CATMAID) into micrometers (NeuroML).
    Returns a lazy sequence of strings that expresses the XML. """
    for source in ([header()], bodyMutual(neuron_names, all_treenodes, connections, scale), ["</neuroml>"]):
        for line in source:
            yield line

def exportSingle(neuron_names, all_treenodes, inputs, scale=0.001):
    """ Export a single neuronal arbor with a set of inputs as NeuroML Level 3 v1.8.1. """
    for source in ([header()], bodySingle(neuron_names, all_treenodes, inputs, scale), ["</neuroml>"]):
        for line in source:
            yield line

def header() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<!-- Exported from CATMAID (http://catmaid.org) on %s -->
<neuroml xmlns="http://morphml.org/neuroml/schema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:net="http://morphml.org/networkml/schema"
  xmlns:mml="http://morphml.org/morphml/schema"
  xmlns:meta="http://morphml.org/metadata/schema"
  xmlns:bio="http://morphml.org/biophysics/schema"
  xmlns:cml="http://morphml.org/channelml/schema"
  xsi:schemaLocation="http://morphml.org/neuroml/schema http://www.neuroml.org/NeuroMLValidator/NeuroMLFiles/Schemata/v1.8.1/Level3/NeuroML_Level3_v1.8.1.xsd"
  length_units="micrometer">
""" % time.strftime("%c %z")

def segment(t1, t2, p, q, segmentID, parentSegmentID, cableID, is_first) -> str:
    s = '<segment id="%s" name="s%s"' % (segmentID, segmentID)
    if parentSegmentID:
        s += ' parent="%s"' % parentSegmentID
    s += ' cable="%s">\n' % cableID
    # Fix radius when not set (-1) to 20 nanometers
    r = t1[3]
    if r < 0:
        r = 20
    # Scale radius to micrometers and convert to a diameter
    r *= 0.002
    if is_first:
        s += '<proximal x="%s" y="%s" z="%s" diameter="%s"/>\n' % (p[0], p[1], p[2], r)
    s += '<distal x="%s" y="%s" z="%s" diameter="%s"/>\n' % (q[0], q[1], q[2], r)
    s += '</segment>\n'

    return s

def make_segments(slab, cableID, scale, state):
    nodes = slab.nodes
    points = smooth(nodes, scale)
    if 1 == len(nodes):
        # segment of zero length
        segmentID = state.nextID()
        state.record(nodes[0][0], segmentID)
        lastSegmentIDOfParent = slab.lastSegmentIDOfParent() # prior to setting the slab's last_segmentID, or root would reference itself
        slab.last_segmentID = segmentID
        yield segment(nodes[0], nodes[0], points[0], points[0], segmentID, lastSegmentIDOfParent, cableID, True)
    else:
        previous_segmentID = slab.lastSegmentIDOfParent()
        for i in range(1, len(nodes)):
            segmentID = state.nextID()
            id2 = previous_segmentID
            previous_segmentID = segmentID
            if 1 == i:
                # A synapse could exist at the first node
                # (Realize that CATMAID operates on nodes, and NeuroML on edges aka segments)
                state.record(nodes[i-1][0], segmentID)
            state.record(nodes[i][0], segmentID)
            slab.last_segmentID = segmentID
            yield segment(nodes[i-1], nodes[i], points[i-1], points[i], segmentID, id2, cableID, 1 == i)


def smooth(treenodes, scale) -> List[Tuple[float, float, float]]:
    """ Apply a three-point average sliding window, keeping first and last points intact.
    Returns a new list of points. """
    points = []
    if len(treenodes) < 3:
        for t in treenodes:
            points.append((t[2][0] * scale, t[2][1] * scale, t[2][2] * scale))
        return points

    t = treenodes[0][2]
    ax, ay, az = t

    # Scale first point after having copied its original values
    points.append((ax * scale, ay * scale, az * scale))

    t = treenodes[1][2]
    bx, by, bz = t

    for i in range(1, len(treenodes) -1):
        tc = treenodes[i+1][2]
        cx, cy, cz = tc
        points.append((((ax + bx + cx) / 3.0) * scale,
                       ((ay + by + cy) / 3.0) * scale,
                       ((az + bz + cz) / 3.0) * scale))
        ax, ay, az = bx, by, bz
        bx, by, bz = cx, cy, cz
        t = tc

    # Scale last point
    points.append((cx * scale, cy * scale, cz * scale))

    return points

class Slab:
    def __init__(self, nodes, parent):
        self.nodes = nodes
        self.parent = parent
        self.last_segmentID = None
    def lastSegmentIDOfParent(self):
        if self.parent:
            return self.parent.last_segmentID
        # Root slab
        return self.last_segmentID

def make_slabs(root, root_segmentID, successors, cableIDs, scale, state):
    # Create cables, each consisting of one or more segments. Three types:
    # 1. end node to previous branch node or root
    # 2. branch node to previous branch node or root
    # 3. branch node to root
    root_slab = Slab([root], None)
    root_slab.last_segmentID = root_segmentID
    leads = [root_slab]
    while leads:
        slab = leads.pop(0)
        parent = slab.nodes[-1]
        children = successors[parent[0]] # parent[0] is the treenode ID
        while children:
            if len(children) > 1:
                # Found branch point
                leads.extend(Slab([parent, child], slab) for child in children)
                break
            else:
                parent = children[0]
                slab.nodes.append(parent)
                children = successors[parent[0]] # parent[0] is the treenode ID

        # Add segments
        cableID = state.nextID()
        cableIDs.append(cableID)
        for line in make_segments(slab, cableID, scale, state):
            yield line

def make_cables(cableIDs):
    for i, cableID in enumerate(cableIDs):
        yield '<cable id="%s" name="c%s" fract_along_parent="%s"><meta:group>%s_group</meta:group></cable>\n' % (cableID, cableID, 0.5 if 0 == i else 1.0, "soma" if 0 == i else "arbor")


def make_arbor(neuron_name, treenodes, scale, state):
    """ treenodes is a sequence of treenodes, where each treenode is a tuple of id, parent_id, location. """
    successors = defaultdict(list) # type: DefaultDict[Any, List]
    for treenode in treenodes:
        if treenode[1]:
            successors[treenode[1]].append(treenode)
        else:
            root = treenode

    root_point = smooth([root], scale)[0]
    root_segmentID = state.nextID()
    root_cableID = state.nextID()

    # Accumulate new cable IDs, one for each slab
    cableIDs = [root_cableID]

    for source in [['<cell name="%s">\n' % neuron_name, '<segments xmlns="http://morphml.org/morphml/schema">\n'],
                   # Create zero-length point before root to represent the cell body
                   [segment(root, root, root_point, root_point, root_segmentID, None, root_cableID, True)],
                   make_slabs(root, root_segmentID, successors, cableIDs, scale, state),
                   ['</segments>\n', '<cables xmlns="http://morphml.org/morphml/schema">\n'],
                   make_cables(cableIDs),
                   ['</cables>\n', '</cell>\n']]:
        for line in source:
            yield line

class State:
    def __init__(self, synaptic_treenodes):
        self.ID = 0
        self.synaptic_treenodes = synaptic_treenodes
    def nextID(self):
        self.ID += 1
        return self.ID
    def record(self, treenodeID, segmentID):
        if treenodeID in self.synaptic_treenodes:
            self.synaptic_treenodes[treenodeID] = segmentID

def make_arbors(neuron_names, all_treenodes, cellIDs, scale, state):
    """ Consume all_treenodes lazily. Assumes treenodes are sorted by skeleton_id.
    Accumulates new cell IDs in cellIDs (the skeletonID is used). """
    i = 0
    length = len(all_treenodes)
    while i < length:
        skeletonID = all_treenodes[i][6]
        treenodes = []
        while i < length and all_treenodes[i][6] == skeletonID:
            t = all_treenodes[i]
            treenodes.append((t[0], t[1], map(float, (t[2], t[3], t[4])), t[5]))
            i += 1
        cellIDs.append(skeletonID)
        for line in make_arbor(neuron_name(skeletonID, neuron_names), treenodes, scale, state):
            yield line

def make_connection_entries(pre_skID, post_skID, synapses, state):
    for pre_treenodeID, post_treenodeID in synapses:
        yield '<connection id="syn_%s" pre_cell_id="sk_%s" pre_segment_id="%s" pre_fraction_along="0.5" post_cell_id="sk_%s" post_segment_id="%s"/>\n' % (state.nextID(), pre_skID, state.synaptic_treenodes[pre_treenodeID], post_skID, state.synaptic_treenodes[post_treenodeID])

def make_connection(connection, state):
    pre_skID, m = connection
    for post_skID, synapses in m.items():
        for source in (('<projection name="NetworkConnection" source="sk_%s" target="sk_%s">\n' % (pre_skID, post_skID),
                        '<synapse_props synapse_type="DoubExpSynA" internal_delay="5" weight="1" threshold="-20"/>\n',
                        '<connections size="%s">\n' % len(synapses)),
                       make_connection_entries(pre_skID, post_skID, synapses, state),
                       ('</connections>\n', '</projection>\n')):
            for line in source:
                yield line

def make_connections(connections, state):
    """ Generate connections between neurons. """
    for connection in connections.items():
        for line in make_connection(connection, state):
            yield line

def neuron_name(skeleton_id, neuron_names) -> str:
    """ Generate a valid name for a neuron: must start with [a-zZ-a]
    and not contain any double quotes or line breaks or spaces. """
    name = neuron_names[skeleton_id].replace('"', "'").replace('\n', ' ')
    return "neuron %s - sk_%s" % (neuron_names[skeleton_id], skeleton_id)

def make_cells(cellIDs, neuron_names):
    for cellID in cellIDs:
        name = neuron_name(cellID, neuron_names)
        yield '<population name="%s" cell_type="%s"><instances size="1"><instance id="0"><location x="0" y="0" z="0"/></instance></instances></population>\n' % (name, name)


def bodyMutual(neuron_names, all_treenodes, connections, scale):
    """ Create a cell for each arbor. """
    synaptic_treenodes = {} # type: Dict
    for m in connections.values():
        for synapses in m.values():
            for pre_treenodeID, post_treenodeID in synapses:
                synaptic_treenodes[pre_treenodeID] = None
                synaptic_treenodes[post_treenodeID] = None

    state = State(synaptic_treenodes)

    cellIDs = [] # type: List
    
    # First cells
    sources = [['<cells>\n'],
               make_arbors(neuron_names, all_treenodes, cellIDs, scale, state),
               ['</cells>\n']]

    # Then populations: one instance of each cell
    sources.append(['<populations xmlns="http://morphml.org/networkml/schema">\n'])
    sources.append(make_cells(cellIDs, neuron_names))
    sources.append(['</populations>\n'])

    # Then connections between cells
    if connections:
        sources.append(['<projections units="Physiological Units" xmlns="http://morphml.org/networkml/schema">\n'])
        sources.append(make_connections(connections, state))
        sources.append(['</projections>\n'])

    for source in sources:
        for line in source:
            yield line

def make_inputs(cellIDs, neuron_names, inputs, state):
    cellID = cellIDs[0]
    for inputSkeletonID, treenodeIDs in inputs.items():
        for source in [('<input name="%s">\n' % inputSkeletonID,
                        '<random_stim frequency="20" synaptic_mechanism="DoubExpSynA"/>\n',
                        '<target population="%s">\n' % neuron_name(cellID, neuron_names),
                        '<sites size="%s">\n' % len(treenodeIDs)),
                       ('<site cell_id="0" segment_id="%s"/>\n' % state.synaptic_treenodes[treenodeID] for treenodeID in treenodeIDs),
                       ('</sites>\n',
                        '</target>\n',
                        '</input>\n')]:
            for line in source: # type: ignore
                yield line


def bodySingle(neuron_names, all_treenodes, inputs, scale):
    synaptic_treenodes = {treenodeID: None for treenodeIDs in inputs.values() for treenodeID in treenodeIDs}

    state = State(synaptic_treenodes)

    cellIDs = [] # type: List

    # First cells (only one)
    sources = [['<cells>\n'],
               make_arbors(neuron_names, all_treenodes, cellIDs, scale, state),
               ['</cells>\n']]

    # Then populations: one instance of the one cell
    sources.append(['<populations xmlns="http://morphml.org/networkml/schema">\n'])
    sources.append(make_cells(cellIDs, neuron_names))
    sources.append(['</populations>\n'])

    # Then inputs onto the one cell
    sources.append(['<inputs units="SI Units" xmlns="http://morphml.org/networkml/schema">\n'])
    sources.append(make_inputs(cellIDs, neuron_names, inputs, state))
    sources.append(['</inputs>\n'])

    for source in sources:
        for line in source:
            yield line

