.. _catmaid_and_rds:

Installing Catmaid with an RDS database backend
===============================================

Catmaid can be installed (usually in AWS) using Amazon RDS as its backend, with
a few small changes to the install/upgrade procedure. 

Things to note
^^^^^^^^^^^^^^
* On RDS you don't get full admin over your database. The admin account for your database has sufficient privileges for most things you will need to do
* You can use AWS security groups to restrict access to your database to the EC2 instance your Catmaid is in (if you are in EC2) or to the IP your Catmaid has (if you are not)

The process
^^^^^^^^^^^

#. On a Catmaid host that's not running a local PostgresSQL server, you only need to install the Postgresql client libraries and commandline tools. The PostgreSQL server components should not be installed.
#. When making the RDS instance, a m4.large (or equivalent) should be sufficient for most use. If you ever need more performance you can easily up the stats on the host with a modify operation. Unless your Catmaid is outside of EC2, you should allocate the host without a public IP.
#. If your Catmaid host is in EC2, put it in a security group called "catmaid" (do not attach a policy directly to this SG - it is just for grouping), and allocate your RDS host in a security group called "catmaid-db". In the security group settings for catmaid-db, write an inbound policy allowing inbound 5432/TCP from the catmaid security group.
#. If your Catmaid host is not in EC2, you only need a catmaid-db security group, with an inbound policy allowing inbound 5432/TCP from the IP of your Catmaid server.
#. The choice between production and testing setup for the Catmaid RDS is up to you; the multi-zone settings in AWS's production setup get you higher uptime, but the difference is small and having your RDS more reliable than your (single-homed) Catmaid serves no actual purpose.
#. The admin user might be named catmaid; the database made in the instance should be named catmaid (it is fine to let the AWS console make this)

After you have the RDS instance up, connect to the catmaid database using the postgres command from your catmaid server, verify connectivity, and then setup GIS as follows::

        CREATE EXTENSION postgis;
        CREATE EXTENSION fuzzystrmatch;
        CREATE EXTENSION postgis_tiger_geocoder;
        CREATE EXTENSION postgis_topology;
        
        ALTER SCHEMA tiger OWNER TO catmaid;
        ALTER SCHEMA tiger_data OWNER TO catmaid;
        ALTER SCHEMA topology OWNER TO catmaid;
        
        CREATE FUNCTION exec(text) returns text language plpgsql volatile AS $f$ BEGIN EXECUTE $1; RETURN $1; END; $f$;
        SELECT exec('ALTER TABLE ' || quote_ident(s.nspname) || '.' || quote_ident(s.relname) || ' OWNER TO rds_superuser;')
          FROM (
            SELECT nspname, relname
            FROM pg_class c JOIN pg_namespace n ON (c.relnamespace = n.oid) 
            WHERE nspname in ('tiger','topology') AND
            relkind IN ('r','S','v') ORDER BY relkind = 'S')
        s;

This is necessary to make the permissions appropriate for GIS support.

Next, to migrate to RDS (or between RDS instances during an upgrade), one must use pg_dump (in text format, not custom format) during an upgrade, and use the psql command to load the data into the new (RDS) instance.

To tell Catmaid how to connect to the database, set the following two fields in configuration.py::

        catmaid_database_host = 'my-catmaid-rds.c99999hh4gfj.us-east-2.rds.amazonaws.com'
        catmaid_database_port = '5432'

(adjusting the former for the RDS endpoint your instance has). Do NOT replace the RDS endpoint hostname with its IP (in the long term the IP is not guaranteed to be stable).
