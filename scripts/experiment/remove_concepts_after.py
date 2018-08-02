# -*- coding: utf-8 -*-
# An entirely untested script to delete all the concepts in the
# CATMAID database for a particular project.
#
# Mark Longair 2010
#

import os, re, sys, ij

from jarray import array

from java.sql import DriverManager, Connection, SQLException, Types

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

def run(project_id, last_untouched_id):

    where = ' where id > %d and project_id = %d' % (last_untouched_id, project_id)

    ij.IJ.showStatus("Removing concepts from treenode_class_instance")
    s = c.createStatement()
    s.executeUpdate('delete from treenode_class_instance')
    s.close()

    ij.IJ.showStatus("Removing concepts from connector_class_instance")
    s = c.createStatement()
    print >> sys.stderr, 'delete from connector_class_instance'+where
    s.executeUpdate('delete from connector_class_instance'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from treenode_connector")
    s = c.createStatement()
    print >> sys.stderr, 'delete from treenode_connector'+where
    s.executeUpdate('delete from treenode_connector'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from class_instance_class_instance")
    s = c.createStatement()
    print >> sys.stderr, 'delete from class_instance_class_instance'+where
    s.executeUpdate('delete from class_instance_class_instance'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from class_instance")
    s = c.createStatement()
    print >> sys.stderr, 'delete from class_instance'+where
    s.executeUpdate('delete from class_instance'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from treenode")
    s = c.createStatement()
    s.executeUpdate('alter table treenode drop constraint treenode_parent_id_fkey')
    s.close()
    s = c.createStatement()
    print >> sys.stderr, 'delete from treenode'+where
    s.executeUpdate('delete from treenode'+where)
    s.close()
    s = c.createStatement()
    s.executeUpdate('alter table only treenode add constraint treenode_parent_id_fkey foreign key (parent_id) REFERENCES treenode(id)')
    s.close()

    ij.IJ.showStatus("Removing concepts from relation")
    s = c.createStatement()
    print >> sys.stderr, 'delete from relation'+where
    s.executeUpdate('delete from relation'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from connector")
    s = c.createStatement()
    print >> sys.stderr, 'delete from connector'+where
    s.executeUpdate('delete from connector'+where)
    s.close()

    ij.IJ.showStatus("Removing concepts from class")
    s = c.createStatement()
    print >> sys.stderr, 'delete from class'+where
    s.executeUpdate('delete from class'+where)
    s.close()

gd = ij.gui.GenericDialog('Remove CATMAID Concepts')
gd.addNumericField("CATMAID Project ID:", 4, 0)
gd.showDialog()
if not gd.wasCanceled():

  project_id = int(gd.getNextNumber())

  s = c.createStatement()
  rs = s.executeQuery('SELECT id FROM concept WHERE project_id = %d ORDER BY id LIMIT 1' % (project_id,))
  rs.next()
  first_id = rs.getLong(1)
  rs.close()
  s.close()

  gd = ij.gui.GenericDialog('Remove CATMAID Concepts')
  gd.addNumericField("Last concept ID to keep:", first_id - 1, 0)
  gd.showDialog()
  if not gd.wasCanceled():
    last_untouched_id = int(gd.getNextNumber())
    run(project_id, last_untouched_id)
    ij.IJ.showMessage("Finished removing concepts.")

c.close()
