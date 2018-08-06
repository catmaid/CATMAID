# -*- coding: utf-8 -*-

from sqlalchemy import create_engine
from sqlalchemy import Table, Colum, Integer, String, MetaData, ForeignKey
from sqlalchemy.orm import mapper

engine = create_engine('postgresql+psycopg2://catmaid_user:catmaid_user_password@localhost/catmaid', echo=True)
meta = MetaData()
meta.reflect(bind=engine)

class User(object):
    def __init__(self, name):
        self.name = name

    def __repr__(self):
      return "<User('%s')>" % (self.name)

user_table = meta.tables['user']
mapper(User, user_table)

class Instance(object):
    def __init__(self, name):
        self.name = name

    def __repr__(self):
      return "<Instance('%s')>" % (self.name)

class_instance_table = meta.tables['class_instance']
mapper(Instance, class_instance_table)

class Stack(object):
    def __init__(self, title):
        self.title = title

    def __repr__(self):
      return "<Stack('%s')>" % (self.title)

stack_table = meta.tables['stack']
mapper(Stack, stack_table)

class Treenode(object):
    def __init__(self):

    def __repr__(self):
      return "<Treenode('%s')>" % (self.id)

treenode_table = meta.tables['treenode']
mapper(Treenode, treenode_table)

class Project(object):
    def __init__(self, title):
        self.title = title

    def __repr__(self):
      return "<Project('%s')>" % (self.title)

project_table = meta.tables['project']
mapper(Project, project_table)


# talking to the database with session
from sqlalchemy.orm import sessionmaker
Session = sessionmaker(bind=engine)

session = Session()
res = session.query(User)
for ob in res:
    print(ob)
session.close()

# adding many to many relationships with data need the association object pattern
