import sys
import psycopg
import os
import yaml

if 'CATMAID_CONFIGURATION' in os.environ:
    path = os.environ['CATMAID_CONFIGURATION']
else:
    path = os.path.join(os.environ['HOME'], '.catmaid-db')

try:
    with open(path) as f:
        conf = yaml.safe_load(f)
except:
    print('''Your %s file should look like:

host: localhost
port: 5432
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user''' % (path,), file=sys.stderr)
    sys.exit(1)

# Make a variable for each of these so that they can be imported:
db_host = conf['host']
db_port = conf['port'] if 'port' in conf else 5432
db_database = conf['database']
db_username = conf['username']
db_password = conf['password']

db_connection = psycopg.connect(host=db_host, port=db_port, dbname=db_database,
                                user=db_username, password=db_password)
