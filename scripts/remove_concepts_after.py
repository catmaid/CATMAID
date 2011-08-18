# An entirely untested script to delete all the concepts in the
# CATMAID database for a particular project.

# Mark Longair 2010

import os
import re

from jarray import array

from java.sql import DriverManager, Connection, SQLException, Types

# FIXME: Just hardcode the user_id and project_id for the moment

user_id = 3
project_id = 4

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

def run():

    # FIXME: ask in a dialog for the ID instead
    first_id = 3859376

    where = ' where id > %d'%(first_id,)

    s = c.createStatement('delete from treenode_class_instance'+where)
    s.executeQuery()

    s = c.createStatement('delete from connector_class_instance'+where)
    s.executeQuery()

    s = c.createStatement('delete from class_instance'+where)
    s.executeQuery()

    s = c.createStatement('alter table treenode drop constraint treenode_parent_id_fkey')
    s.executeQuery()
    s = c.createStatement('delete from treenode'+where)
    s.executeQuery()
    s = c.createStatement('alter table only treenode add constraint treenode_parent_id_fkey foreign key (parent_id) REFERENCES treenode(id)');
    s.executeQuery()

    s = c.createStatement('delete from relation'+where)
    s.executeQuery()

    s = c.createStatement('delete from connector'+where)
    s.executeQuery()

    s = c.createStatement('delete from class_instance_class_instance'+where)
    s.executeQuery()
