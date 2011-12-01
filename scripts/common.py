import sys
import psycopg2
import os
import yaml

if 'CATMAID_CONFIGURATION' in os.environ:
    path = os.environ['CATMAID_CONFIGURATION']
else:
    path = os.path.join(os.environ['HOME'], '.catmaid-db')

try:
    conf = yaml.load(open(path))
except:
    print >> sys.stderr, '''Your %s file should look like:

host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user''' % (path,)
    sys.exit(1)

db_connection = psycopg2.connect(host=conf['host'],
                                 database=conf['database'],
                                 user=conf['username'],
                                 password=conf['password'])
