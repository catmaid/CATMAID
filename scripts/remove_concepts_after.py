# An entirely untested script to delete all the concepts in the
# CATMAID database for a particular project.

# Mark Longair 2010

import os

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

def run():

    # FIXME: ask in a dialog for the ID instead
    first_id = 3859376

    where = ' where id > %d'%(first_id,))

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
