# An experimental script to export a TrakEM2 project's annotations
# directly to the CATMAID database.  This is based on Albert Cardona's
# TrakEM2 helper scripts here: https://github.com/acardona/Fiji-TrakEM2-scripts

# Mark Longair 2010

import os

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

radius_node_class = Class.forName('ini.trakem2.display.Treeline$RadiusNode')

# Set up the JDBC connection:

try:
  Class.forName("org.postgresql.Driver")
except:
  IJ.log("Failed to find the postgresql driver...")
  raise

catmaid_db_user = None
catmaid_db_password = None

db_login_filename = os.path.join(os.environ['HOME'],'.catmaid-db')
fp = open(db_login_filename)
for i, line in enumerate(fp):
  if i == 0:
    catmaid_db_user = line.strip()
  elif i == 1:
    catmaid_db_password = line.strip()

c = DriverManager.getConnection("jdbc:postgresql://localhost/catmaid",
                                catmaid_db_user,
                                catmaid_db_password)

required_classes = [
 "skeleton",
 "label",
 "root",
 "synapse",
 "neuron",
 "group" ]

# Fetch all the class names and IDs:
class_to_class_id = {}
s = c.createStatement()
rs = s.executeQuery("SELECT id, class_name FROM class WHERE project_id = "+str(project_id))
while rs.next():
  class_to_class_id[rs.getString(2)] = rs.getLong(1)
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
  "(user_id,project_id,parent_id,location,radius,confidence) "+
  "VALUES (?,?,?,(?,?,?),?,?) "+
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

ps_get_root_nodes = c.prepareStatement(
  "SELECT id FROM class_instance WHERE project_id = ? AND class_id = ?")
ps_get_root_nodes.setInt(1,project_id)
ps_get_root_nodes.setInt(2,class_to_class_id['root'])

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
  root_id = None
  existing_root_ids = get_root_node_ids()
  if len(existing_root_ids) > 1:
    raise Exception, "There is more than one root not in project: "+str(project_id)
  if root_id:
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

# ------------------------------------------------------------------------

# FIXME: when we've finalized the connector / synapse representation,
# use a variant of this method to get the connectors.  (Also needs to
# grab the confidence, create dummy treenodes for endpoints, etc.)

def findConnections(tree):
  """ Return two tables: one of outgoing and one of incomming connections,
  with the name versus the number of connections. """
  outgoing, incomming = tree.findConnectors()
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
  for c in incomming:
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
  root = tree.getRoot()
  if root is None:
    return None
  aff = tree.getAffineTransform()
  table = {}
  for nd in tree.getRoot().getSubtreeNodes():
    x, y, z = node_to_coordinates(aff,nd)
    confidence = nd.getConfidence()
    parent = None
    if nd.parent:
      parent = table[nd.parent]
    radius = 0
    if nd.getClass() == radius_node_class:
      radius = nd.getData()
    new_id = insert_treenode( parent, x, y, z, 0, confidence )
    table[nd] = new_id
    new_treenode_class_instance('element_of',new_id,skeleton_id)

def add_recursively(pt,parent_id,depth=0):
  name_with_id = get_project_thing_name(pt)
  print " "*depth, pt, name_with_id
  new_id = None
  pt_type = pt.getType()
  if not parent_id:
    # Then this should be the root:
    new_id = insert_project_root_node(name_with_id)
  elif pt_type in ("sensory", "class", "vnc", "contour", "group", "neuropile", "synapses", "pre", "post"):
    # Just create all of these as groups for the moment:
    new_id = insert_group(parent_id,name_with_id)
  elif pt_type == "nucleus":
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
  else:
    raise Exception, "Unknown type: "+str(pt_type)
  children = pt.getChildren()
  if children and new_id:
    for c in children:
      add_recursively(c,new_id,depth+1)

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

run()

ps_new_treenode.close()
ps_new_class_instance.close()
ps_class_instance_class_instance.close()
ps_treenode_class_instance.close()
ps_get_root_nodes.close()

c.close()
