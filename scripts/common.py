import sys
import psycopg2
import os
import yaml

try:
    conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
    print >> sys.stderr, '''Your ~/.catmaid-db file should look like:

host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user'''
    sys.exit(1)

db_connection = psycopg2.connect(host=conf['host'],
                                 database=conf['database'],
                                 user=conf['username'],
                                 password=conf['password'])
