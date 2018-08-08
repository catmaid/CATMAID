# -*- coding: utf-8 -*-

# An experimental script to export a TrakEM2 project's annotations
# directly to the CATMAID database.  This is based on Albert Cardona's
# TrakEM2 helper scripts here: https://github.com/acardona/Fiji-TrakEM2-scripts

# Mark Longair 2010

import os
import re

from ini.trakem2 import Project
from ini.trakem2.display import Tree, Treeline, AreaTree, Connector
from ini.trakem2.parallel import Process, TaskFactory
from java.lang import StringBuilder
from java.io import File
from ij import IJ
from ij.gui import YesNoCancelDialog
from java.util.concurrent.atomic import AtomicInteger
from jarray import array

from java.sql import DriverManager, Connection, SQLException, Types

cal = None
pw = None
ph = None

# FIXME: Just hardcode the user_id and project_id for the moment

user_id = 3
project_id = 4

fragments_group_name = "Isolated synaptic terminals"

# FIXME: And also hardcode the separation:

x_separation = 4.0
z_separation = 50.0

radius_node_class = Class.forName('ini.trakem2.display.Treeline$RadiusNode')

# Set up the JDBC connection:

try:
  Class.forName("org.postgresql.Driver")
except:
  IJ.log("Failed to find the postgresql driver...")
  raise

conf = {}
fp = open(os.path.join(os.environ['HOME'],'.catmaid-db'))
for line in fp:
  line = line.strip()
  if len(line) == 0:
    continue
  m = re.search('(\S*)\s*:\s*(\S*)', line)
  if m:
    conf[m.group(1)] = m.group(2)
fp.close()

database_url = "jdbc:postgresql://%s/%s" % (conf['host'], conf['database'])

c = DriverManager.getConnection(database_url,
                                conf['username'],
                                conf['password'])

required_classes = [
 "skeleton",
 "label",
 "root",
 "synapse",
 "neuron",
 "group",
 "presynaptic terminal",
 "postsynaptic terminal" ]

# Fetch all the class names and IDs:
class_to_class_id = {}
s = c.createStatement()
rs = s.executeQuery("SELECT id, class_name FROM class WHERE project_id = "+str(project_id))
while rs.next():
  class_name = rs.getString(2)
  class_id = rs.getLong(1)
  if class_name in class_to_class_id:
    raise Exception, "There's are multiple classes called '%s' for project_id %d" % (class_name,project_id)
  class_to_class_id[class_name] = class_id
s.close()

# Insert any that didn't already exist:
ps = c.prepareStatement("INSERT INTO class (class_name,project_id,user_id) VALUES (?,?,?) RETURNING id")
ps.setInt(2,project_id)
ps.setInt(3,user_id)
for new_class in (x for x in required_classes if x not in class_to_class_id):
  ps.setString(1,new_class)
  rs = ps.executeQuery()
  rs.next()
  new_id = rs.getLong(1)
  class_to_class_id[new_class] = new_id
  rs.close()

# FIXME: Don't Repeat Yourself...

# Fetch all the relation names and IDs:
relation_to_relation_id = {}
s = c.createStatement();
rs = s.executeQuery("SELECT id, relation_name FROM relation WHERE project_id = "+str(project_id))
while rs.next():
  relation_to_relation_id[rs.getString(2)] = rs.getLong(1)
s.close()

required_relations = [
  "presynaptic_to",
  "postsynaptic_to",
  "model_of",
  "part_of",
  "labeled_as",
  "is_a",
  "element_of"
]

# Insert any that didn't already exist:
ps = c.prepareStatement("INSERT INTO relation (relation_name,project_id,user_id) VALUES (?,?,?) RETURNING id")
ps.setInt(2,project_id)
ps.setInt(3,user_id)
for new_relation in (x for x in required_relations if x not in relation_to_relation_id):
  ps.setString(1,new_relation)
  rs = ps.executeQuery()
  rs.next()
  new_id = rs.getLong(1)
  relation_to_relation_id[new_relation] = new_id
  rs.close()

# ========================================================================

# Create various prepared SQL statements and helper functions that
# we'll need:

ps_new_treenode = c.prepareStatement(
  "INSERT INTO treenode "+
  "(user_id,project_id,parent_id,location,radius,confidence,skeleton_id) "+
  "VALUES (?,?,?,(?,?,?),?,?,?) "+
  "RETURNING id")

ps_new_treenode.setInt(1,user_id)
ps_new_treenode.setInt(2,project_id)

def insert_treenode( parent_id, x, y, z, radius, confidence, skeleton_id=None ):
  if parent_id == None:
    ps_new_treenode.setNull(3,Types.BIGINT)
  else:
    ps_new_treenode.setInt(3,parent_id)
  ps_new_treenode.setDouble(4,x)
  ps_new_treenode.setDouble(5,y)
  ps_new_treenode.setDouble(6,z)
  ps_new_treenode.setDouble(7,radius)
  ps_new_treenode.setInt(8,confidence)
  ps_new_treenode.setInt(9,skeleton_id)
  rs = ps_new_treenode.executeQuery()
  rs.next()
  new_id = rs.getLong(1)
  rs.close()
  if skeleton_id:
    new_treenode_class_instance('element_of',new_id,skeleton)
  return new_id

# ------------------------------------------------------------------------

ps_new_class_instance = c.prepareStatement(
  "INSERT INTO class_instance " +
  "(user_id,project_id,class_id,name) " +
  "VALUES (?,?,?,?) " +
  "RETURNING id")
ps_new_class_instance.setInt(1,user_id)
ps_new_class_instance.setInt(2,project_id)

def new_class_instance(class_name,class_instance_name):
  ps_new_class_instance.setInt(3,class_to_class_id[class_name])
  ps_new_class_instance.setString(4,class_instance_name)
  rs = ps_new_class_instance.executeQuery()
  rs.next()
  new_id = rs.getLong(1)
  rs.close()
  return new_id

# ------------------------------------------------------------------------

ps_class_instance_class_instance = c.prepareStatement(
  "INSERT INTO class_instance_class_instance " +
  "(user_id,project_id,relation_id,class_instance_a,class_instance_b) " +
  "VALUES (?,?,?,?,?) ")
ps_class_instance_class_instance.setInt(1,user_id)
ps_class_instance_class_instance.setInt(2,project_id)

def new_class_instance_class_instance(relation_name,ci1,ci2):
  ps_class_instance_class_instance.setInt(3,relation_to_relation_id[relation_name])
  ps_class_instance_class_instance.setInt(4,ci1)
  ps_class_instance_class_instance.setInt(5,ci2)
  ps_class_instance_class_instance.executeUpdate()

# ------------------------------------------------------------------------

ps_treenode_class_instance = c.prepareStatement(
  "INSERT INTO treenode_class_instance " +
  "(user_id,project_id,relation_id,treenode_id,class_instance_id) " +
  "VALUES (?,?,?,?,?)")
ps_treenode_class_instance.setInt(1,user_id)
ps_treenode_class_instance.setInt(2,project_id)

def new_treenode_class_instance(relation_name,t,ci):
  ps_treenode_class_instance.setInt(3,relation_to_relation_id[relation_name])
  ps_treenode_class_instance.setInt(4,t)
  ps_treenode_class_instance.setInt(5,ci)
  ps_treenode_class_instance.executeUpdate()

# ------------------------------------------------------------------------

ps_treenode_connector = c.prepareStatement(
  "INSERT INTO treenode_connector " +
  "(user_id,project_id,relation_id,treenode_id,connector_id) " +
  "VALUES (?,?,?,?,?)")
ps_treenode_connector.setInt(1,user_id)
ps_treenode_connector.setInt(2,project_id)

def new_treenode_connector(relation_name,t,ci):
  ps_treenode_connector.setInt(3,relation_to_relation_id[relation_name])
  ps_treenode_connector.setInt(4,t)
  ps_treenode_connector.setInt(5,ci)
  ps_treenode_connector.executeUpdate()

# ------------------------------------------------------------------------

ps_connector_class_instance = c.prepareStatement(
  "INSERT INTO connector_class_instance " +
  "(user_id,project_id,relation_id,connector_id,class_instance_id) " +
  "VALUES (?,?,?,?,?)")
ps_connector_class_instance.setInt(1,user_id)
ps_connector_class_instance.setInt(2,project_id)

def new_connector_class_instance(relation_name,c,ci):
  ps_connector_class_instance.setInt(3,relation_to_relation_id[relation_name])
  ps_connector_class_instance.setInt(4,c)
  ps_connector_class_instance.setInt(5,ci)
  ps_connector_class_instance.executeUpdate()

# ------------------------------------------------------------------------

ps_new_connector = c.prepareStatement(
  "INSERT INTO connector "+
  "(user_id,project_id,location) "+
  "VALUES (?,?,(?,?,?)) "+
  "RETURNING id")

ps_new_connector.setInt(1,user_id)
ps_new_connector.setInt(2,project_id)

def insert_connector_and_synapse( x, y, z, synapse_name ):
  ps_new_connector.setDouble(3,x)
  ps_new_connector.setDouble(4,y)
  ps_new_connector.setDouble(5,z)
  rs = ps_new_connector.executeQuery()
  rs.next()
  connector_id = rs.getLong(1)
  rs.close()
  synapse_id = new_class_instance('synapse',synapse_name)
  new_connector_class_instance('model_of',connector_id,synapse_id)
  return (connector_id, synapse_id)

def new_treenode_class_instance(relation_name,t,ci):
  ps_treenode_class_instance.setInt(3,relation_to_relation_id[relation_name])
  ps_treenode_class_instance.setInt(4,t)
  ps_treenode_class_instance.setInt(5,ci)
  ps_treenode_class_instance.executeUpdate()

def insert_tag_for_treenode( tag, treenode_id ):
  tag_class_instance_id = new_class_instance('label',tag)
  return new_treenode_class_instance('labeled_as',treenode_id,tag_class_instance_id)

# ------------------------------------------------------------------------

ps_get_root_nodes = c.prepareStatement(
  "SELECT id FROM class_instance WHERE project_id = ? AND class_id = ?")
ps_get_root_nodes.setInt(1,project_id)
ps_get_root_nodes.setInt(2,class_to_class_id['root'])

# ------------------------------------------------------------------------

ps_get_class_instance_from_treenode = c.prepareStatement(
  "SELECT class_instance_id FROM treenode_class_instance WHERE project_id = ? AND treenode_id = ? AND relation_id = ?")
ps_get_class_instance_from_treenode.setInt(1, project_id)

def get_class_instance_from_treenode(treenode_id, relation):
  ps_get_class_instance_from_treenode.setInt(2, treenode_id)
  ps_get_class_instance_from_treenode.setInt(3, relation_to_relation_id[relation])
  rs = ps_get_class_instance_from_treenode.executeQuery()
  rs.next()
  class_instance_b_id = rs.getLong(1)
  rs.close()
  return class_instance_b_id

# ------------------------------------------------------------------------

ps_get_treenodes = c.prepareStatement(
  "SELECT id,(t.location).x,(t.location).y,(t.location).z "+
  "FROM treenode AS t WHERE project_id = ? AND "+
  "(t.location).x >= ? AND (t.location).x <= ? AND "+
  "(t.location).y >= ? AND (t.location).y <= ? AND "+
  "(t.location).z >= ? AND (t.location).z <= ?")

ps_get_treenodes.setInt(1,project_id)

class TreeNode:
  def __init__(self,treenode_id,x,y,z):
    self.treenode_id = treenode_id
    self.x = x
    self.y = y
    self.z = z

def get_treenodes_within(x1,x2,y1,y2,z1,z2):
  ps_get_treenodes.setDouble(2,x1);
  ps_get_treenodes.setDouble(3,x2);
  ps_get_treenodes.setDouble(4,y1);
  ps_get_treenodes.setDouble(5,y2);
  ps_get_treenodes.setDouble(6,z1);
  ps_get_treenodes.setDouble(7,z2);
  rs = ps_get_treenodes.executeQuery()
  result = []
  while rs.next():
    result.append( TreeNode(rs.getLong(1),
                            rs.getDouble(2),
                            rs.getDouble(3),
                            rs.getDouble(4)) )
  return result

# ------------------------------------------------------------------------

def insert_group( part_of_group_id, name ):
  new_id = new_class_instance('group',name)
  new_class_instance_class_instance('part_of',new_id,part_of_group_id)
  return new_id

def insert_neuron( part_of_group_id, name ):
  new_id = new_class_instance('neuron',name)
  new_class_instance_class_instance('part_of',new_id,part_of_group_id)
  return new_id

def insert_skeleton( model_of_neuron_id, name ):
  new_id = new_class_instance('skeleton',name)
  new_class_instance_class_instance('model_of',new_id,model_of_neuron_id)
  return new_id

def get_root_node_ids():
  result = []
  rs = ps_get_root_nodes.executeQuery()
  while rs.next():
    result.append(rs.getLong(1))
  return result

def insert_project_root_node( name ):
  existing_root_ids = get_root_node_ids()
  if len(existing_root_ids) > 1:
    raise Exception, "There is more than one root node in project: "+str(project_id)
  elif len(existing_root_ids) == 1:
    root_id = existing_root_ids[0]
    IJ.log("Project root node already existed - just updating the name...")
    ps = c.prepareStatement("UPDATE class_instance SET name = ? WHERE id = ?")
    ps.setString(1,name)
    ps.setLong(2,root_id)
    ps.executeUpdate()
    ps.close()
  else:
    ps = c.prepareStatement("INSERT INTO class_instance (project_id,user_id,class_id,name) VALUES (?,?,?,?) RETURNING id")
    ps.setInt(1,project_id)
    ps.setInt(2,user_id)
    ps.setInt(3,class_to_class_id['root'])
    ps.setString(4,name)
    rs = ps.executeQuery()
    rs.next()
    root_id = rs.getLong(1)
    ps.close()
  return root_id

ps_get_fragments_id = c.prepareStatement("SELECT ci.id from class_instance as ci, class_instance_class_instance as cici WHERE ci.project_id = ? AND cici.project_id = ? AND ci.user_id = ? AND cici.user_id = ? AND ci.name = '%s' AND cici.class_instance_a = ci.id and cici.class_instance_b = ?"%(fragments_group_name,))
ps_get_fragments_id.setInt(1,project_id)
ps_get_fragments_id.setInt(2,project_id)
ps_get_fragments_id.setInt(3,user_id)
ps_get_fragments_id.setInt(4,user_id)

def get_fragments_node_id():
  root_node_id = get_root_node_ids()[0]
  ps_get_fragments_id.setInt(5,root_node_id)
  rs = ps_get_fragments_id.executeQuery()
  fragment_ids = []
  while rs.next():
    fragment_ids.append(rs.getLong(1))
  if len(fragment_ids) > 1:
    raise Exception, "Found more than one id for the class 'Fragments'"
  # Create the group if it doesn't exist:
  if len(fragment_ids) == 0:
    return insert_group(root_node_id,fragments_group_name)
  else:
    return fragment_ids[0]

# ------------------------------------------------------------------------

# FIXME: when we've finalized the connector / synapse representation,
# use a variant of this method to get the connectors.  (Also needs to
# grab the confidence, create dummy treenodes for endpoints, etc.)

def findConnections(tree):
  """ Return two tables: one of outgoing and one of incoming connections,
  with the name versus the number of connections. """
  outgoing, incoming = tree.findConnectors()
  tableOut = {}
  for c in outgoing:
    for targetSet in c.getTargets(Tree):
      for target in targetSet:
        if isinstance(target, Connector):
          continue
        if tableOut.has_key(target):
          tableOut[target] += 1
        else:
          tableOut[target] = 1
  tableIn = {}
  for c in incoming:
    for origin in c.getOrigins(Tree):
      if isinstance(origin, Connector):
        continue
      if tableIn.has_key(origin):
        tableIn[origin] += 1
      else:
        tableIn[origin] = 1
  return tableOut, tableIn

# def getTitle(tree):
#   return tree.project.getMeaningfulTitle2(tree) + " #" + str(tree.id)

def get_project_thing_name(pt):
  return str(pt.getObject())+" #"+str(pt.getId())

def node_to_coordinates(aff,nd):
    fp = array([nd.x, nd.y], 'f')
    aff.transform(fp, 0, fp, 0, 1)
    x = fp[0] * pw
    y = fp[1] * ph
    z = float(nd.layer.z) * pw
    return (x,y,z)

def insertTree(tree,skeleton_id):
  if isinstance(tree, unicode):
    return
  root = tree.getRoot()
  if root is None:
    return None
  aff = tree.getAffineTransform()
  table = {}
  print('number of subtreenodes is:', len(tree.getRoot().getSubtreeNodes()), 'for TrakEM2 treeline', tree.getId())
  for nd in tree.getRoot().getSubtreeNodes():
    x, y, z = node_to_coordinates(aff,nd)
    confidence = nd.getConfidence()
    parent = None
    if nd.parent:
      parent = table[nd.parent]
    radius = -1
    if nd.getClass() == radius_node_class:
      radius = nd.getData()
    # In TrakEM2, 0 is "unset" as well as "radius 0" - in CATMAID,
    # we're making "-1" unset for the moment...
    if radius == 0:
      radius = -1
    new_id = insert_treenode( parent, x, y, z, radius, confidence, skeleton_id )
    table[nd] = new_id
    new_treenode_class_instance('element_of',new_id,skeleton_id)
    # Also try to find any tags:
    all_tags = nd.getTags()
    if all_tags:
      for tag in all_tags:
        tag_as_string = tag.toString()
        print("Trying to add tag: "+tag_as_string)
        insert_tag_for_treenode(tag_as_string,new_id)

def add_recursively(pt,parent_id,depth=0):
  name_with_id = get_project_thing_name(pt)
  print(" "*depth, pt, name_with_id)
  new_id = None
  pt_type = pt.getType()
  if not parent_id:
    # Then this should be the root:
    new_id = insert_project_root_node(name_with_id)
  elif pt_type in ("sensory", "class", "vnc", "contour", "group", "neuropile", "synapses", "trachea", "imported_labels", "commissures"):
    # Just create all of these as groups for the moment:
    new_id = insert_group(parent_id,name_with_id)
  elif pt_type == "nucleus":
    pass
  elif pt_type in ("pre", "post"):
    pass
  elif pt_type == "neuron":
    new_id = insert_neuron(parent_id,name_with_id)
  elif pt_type == "connector":
    # TODO
    pass
  elif pt_type == "treeline":
    skeleton_id = insert_skeleton(parent_id,name_with_id)
    tl = pt.getObject()
    insertTree(tl,skeleton_id)
  elif pt_type == "areatree":
    # FIXME: no proper support for areatrees yet, so just import as a
    # treeline for the moment:
    skeleton_id = insert_skeleton(parent_id,name_with_id)
    tl = pt.getObject()
    insertTree(tl,skeleton_id)
  elif pt_type == "ball":
    # TODO: could just be supported by a treenode, since they
    # have a radius
    pass
  elif pt_type == "profile":
    pass
  elif pt_type == "profile_list":
    pass
  elif pt_type == "area_list":
    pass
  else:
    raise Exception, "Unknown type: "+str(pt_type)
  children = pt.getChildren()
  if children and new_id:
    for c in children:
      add_recursively(c,new_id,depth+1)

class ConnectorNode:
  def __init__(self,t,r):
    self.x, self.y, self.z = t
    self.r = r
  def __str__(self):
    return "(%f,%f,%f) radius: %f"%(self.x,self.y,self.z,self.r)
  def treenode_within_radius(self,treenode):
    if abs(self.z - treenode.z) > (z_separation/2):
      return False
    xdiff = self.x - treenode.x
    ydiff = self.y - treenode.y
    return (xdiff*xdiff + ydiff*ydiff) < (self.r*self.r)
  def find_treenodes_under(self):
    in_cuboid_treenodes = get_treenodes_within(self.x-self.r,self.x+self.r,
                                               self.y-self.r,self.y+self.r,
                                               self.z-(z_separation/2.0),self.z+(z_separation/2.0))
    # That might find some which are with a squared region but not
    # within a circular region, so narrow that down:
    return [ x for x in in_cuboid_treenodes if self.treenode_within_radius(x) ]

class SynapseSides:
  PRE = 0
  POST = 1

def add_synapse( name, connector, pre_nodes, post_nodes ):
  # Find the centroid of those points:
  all_nodes = pre_nodes + post_nodes
  summed_tuple = map(sum,zip(*[(n.x,n.y,n.z) for n in all_nodes]))
  centroid = map(lambda x: x / len(all_nodes), summed_tuple)
  # create a connector at the centroid
  # create a synapse
  # make the connector a model_of the synapse
  # for each node pre and post:
  #    find if there is a treenode in the same layer
  #    and within the right distance
  #    if not:
  #       create one isolated treenode in a skeleton
  #    for each of treenodes:
  #       create a new pre/post synaptic terminal
  #       make the treenode a model_of the pre/postsynaptic terminal
  #       make the terminal pre/postsynaptic_to the synapse
  #       FIXME: TODO make the terminal part_of a skeleton or a neuron
  #
  # Now do these one at a time...
  # * create a connector at the centroid
  # * create a synapse
  # * make the connector a model_of the synapse
  connector_id, synapse_id = insert_connector_and_synapse( centroid[0], centroid[1], centroid[2], name )
  # * for each node pre and post:
  for side in (SynapseSides.PRE,SynapseSides.POST):
    side_string = "pre" if side == SynapseSides.PRE else "post"
    for node in (pre_nodes if side == SynapseSides.PRE else post_nodes):
      # * find if there is a treenode in the same layer
      #   and within the right distance
      treenodes = node.find_treenodes_under()
      # * if not:
      #   * create one isolated treenode in a skeleton
      if not treenodes:
        treenode_id = insert_treenode( None, node.x, node.y, node.z, -1, 5, skeleton_id )
        treenodes.append(TreeNode(treenode_id,node.x,node.y,node.z))
        # * create a skeleton, a neuron and make this part of the 'Fragments' group
        fragments_group_id = get_fragments_node_id()
        neuron_id = insert_neuron(fragments_group_id,'orphaned '+side_string)
        skeleton_id = insert_skeleton(neuron_id,'orphaned '+side_string)
        new_treenode_class_instance('element_of',treenode_id,skeleton_id)
      # * for each of treenodes:
      for tn in treenodes:
        # * create a new pre/post synaptic terminal
        terminal_class_name = side_string + "synaptic terminal"
        terminal_relationship = side_string + "synaptic_to"
        terminal_id = new_class_instance(terminal_class_name,terminal_class_name)
        # * make the treenode a model_of the pre/postsynaptic terminal
        new_treenode_class_instance('model_of',tn.treenode_id,terminal_id)
        # * make the terminal pre/postsynaptic_to the synapse
        new_class_instance_class_instance(terminal_relationship,terminal_id,synapse_id)
        # * make the pre/postsynaptic terminal a part_of the skeleton
        # * find the skeleton ID
        skeleton_id = get_class_instance_from_treenode(tn.treenode_id,'element_of')
        new_class_instance_class_instance('part_of',terminal_id,skeleton_id)
        # * make the treenode pre/postsynaptic_to the connector
        new_treenode_connector(terminal_relationship,tn.treenode_id,connector_id)

def add_connectors_recursively(pt,depth=0):
  name_with_id = get_project_thing_name(pt)
  pt_type = pt.getType()
  prefix = " "*depth
  print(prefix, pt, name_with_id, '::', pt_type)
  if pt_type == "connector":
    c = pt.getObject()
    print(prefix, "#########################################")
    print(prefix, "Got connector: ", c, "of type", type(c))
    aff = None
    try:
      aff = c.getAffineTransform()
    except AttributeError:
      pass
    if not aff:
      print("Connector didn't have getAffineTransform(), probably the type is wrong:", type(c))
    elif not c.root:
      print("Connector had no origin node")
    else:
      connector_target_nodes = c.root.getChildrenNodes()
      originNode = ConnectorNode(node_to_coordinates(aff,c.root),c.root.getData()*x_separation)
      targetNodes = [ ConnectorNode(node_to_coordinates(aff,x),x.getData()*x_separation) for x in connector_target_nodes ]
      print(prefix, "Got originNode:", originNode)
      for t in targetNodes:
        print(prefix, "Got targetNode:", t)
      add_synapse( name_with_id, c, [ originNode ], targetNodes )
  else:
    children = pt.getChildren()
    if children:
      for c in children:
        add_connectors_recursively(c,depth+1)

def run():
  global cal, pw, ph
  projects = Project.getProjects()
  if projects is None or projects.isEmpty():
    IJ.log('No project open!')
    return
  p = projects.get(0)
  ls = p.getRootLayerSet()
  cal = ls.getCalibrationCopy()
  pw = float(cal.pixelWidth)
  ph = float(cal.pixelHeight)
  rpt = p.getRootProjectThing()

  add_recursively(rpt,None)

  add_connectors_recursively(rpt)

run()

ps_new_treenode.close()
ps_new_class_instance.close()
ps_class_instance_class_instance.close()
ps_treenode_class_instance.close()
ps_get_root_nodes.close()

c.close()
