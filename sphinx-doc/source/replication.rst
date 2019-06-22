.. _replication:

Data replication
================

CATMAID is designed for collaborative work, possibly from many different places
around the world. The latency that users experience to load data increases with
the distance they are away from both the server hosting a CATMAID instance and
the source of the image data. In order to speed up read access to the data, both
image data and the CATMAID database can be replicated (mirrored) to other
locations, that would be closer to the users. Below, both image stack mirrors
and database replication is discussed in more detail.

Stack mirrors
-------------

Multiple image mirrors can be configured for each stack in CATMAID through the
admin interface. All stack mirrors are available to the front-end when loading a
particular stack. If its **canary location** is reachable, the stack is used.
Otherwise the next one is tried and so on. This makes it possible to have also
network internal mirrors for faster access, parallel to slower public hosts.

Database replication
--------------------

The CATMAID front-end can read data from different servers. This is mainly
useful for large amounts of data, e.g. neuron reconstructions, meshes or large
connectivity matrices. For writing and reading of most small information,
CATMAID will still talk to the primary server though. The replication server
(replica) will mirror data from the primary server and update automatically
using the physical replication capabilities of Postgres. Still, the replication
server needs to run a regular CATMAID instance (possibly through Docker), which
effectively is read-only.

Physical replication in Postgres performs a byte-by-byte copy of the database,
based on the Write Ahead Log (WAL). Therefore it is important that both the
primary server and all replicas run the same Postgres version. CATMAID requires
Postgres 11 at the moment.

Reachability and secure communication
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Replica servers need to be able to log in to the primary Postgres server. This
means there needs to be an open port that makes the primary server reachable
from the replicas. This could mean opening a port in the server or network
firewall, depending on the setup. If the firewall can be configured to only
allow incoming requests from the particular replica IP, then is typically a good
idea to do for the sake of security. One other aspect is, that it often reduces
server load if non-standard ports are used (to lower random login requests),
especially if popular applications like Postgres are involved. For instance,
Postgres' default port is 5432, so a pragmatic unassigned public port might be
7432. To allow Postgres to only listen on the local loopback interface and route
incoming traffic on port 7432, the following ``stream`` block can be used in an
Nginx configuration on the primary server, after the respective streaming module
was loaded::

  # Enable TCP streaming
  load_module modules/ngx_stream_module.so

  stream {
    upstream postgres_db {
      server 127.0.0.1:5432;
    }

    server {
      # Forward this port to the internal Postgres database. This is
      # used for the replication user.
      listen 7432
      proxy_pass postgres_db;
    }
  }

In case Postgres should be reachable directly, make sure the
``listen_addresses`` setting in ``postgresql.conf`` is set to your network
interface correctly. With a port forwarding like above, this is not needed.

With Postgres being reachable from the outside, the primary server can now be
configured for replication. Given that data is transmitted to replication
servers, it is a good idea to encrypt this traffic. For this a self-signed
certificate can be used, but if the server has already a certificate, this can
be used as well. The private key and certificate need to readable by Postgres,
which is typically run by the ``postgres`` user. Then SSL can be enabled in the
``postgresql.conf`` file::

  ssl = on
  ssl_cert_file = '/etc/ssl/postgresql/cert/server.crt'
  ssl_key_file = '/etc/ssl/postgresql/private/server.key'

Let the point to the respective files on your system and make sure Postgres can
read them.

Configure the primary
^^^^^^^^^^^^^^^^^^^^^

If replicas can connect to Postgres, they need to login. Use a dedicated
replication user for this. Login to Postgres (``sudo -u postgres psql``) and
create a new user, enable proper password encryption and set a strong password::

  CREATE ROLE replication_user WITH REPLICATION LOGIN;
  SET password_encryption = 'scram-sha-256';
  \password replication_user

Next, Postgres needs to be told to use the WAL for replication. Edit
``postgresql.conf`` and apply the following settings::

  wal_level = replica
  max_wal_senders = 3 # max number of walsender processes
  wal_keep_segments = 64 # in logfile segments, 16MB each; 0 disables

The ``replica`` value for the ``wal_level`` is the default. The number of kept
WAL segments should be enough for most setups, but on write heavy setups, it is
advisable to also enable *WAL archiving*, using the placeholders ``%p`` for the
full path of the archive file and ``%f`` for the filename only::

  archive_mode = on
  archive_command = 'rsync -a %p postgres@replica:/opt/postgresql_wal/%f'

This copies the WAL segments to a place that has to be accessible by all
replicas. If e.g. ``rsync`` is used like above, make sure to setup SSH access by
public key. On most setup, WAL archiving is likely not needed though.

The last step on the primary server is to allow the replication user to login.
Add the following line to your ``pg_hba.conf`` file::

  hostssl     replication     replication_user    xxx.xxx.xxx.xxx/yy      scram-sha-256

Replace ``xxx.xxx.xxx.xxx/yy`` with the IP of the replica or the subnet of
multiple replicas are used.

Finally, Postgres on the primary server has to be restarted.

Configure the replica
^^^^^^^^^^^^^^^^^^^^^

With the primary server ready, the replica has to be configured as well. First,
the replica Postgres has to be stopped. Edit ``postgresql.conf`` and give the
same (or similar, depending on hardware) configuration as on the primary. This
way, this server can act as a failover server of the primary goes down. Also,
add the following line::

  hot_standby = on

Next the Postgres data directory (``data_directory`` in ``postgresql.conf``)
will be prepared for the replication. If it contains your ``postgresql.conf``,
``pg_hba.conf`` and/or certificates, make a backup of those files. Now this is
done, *delete* all files in this data directory. Warning: this will remove all
databases in this Postgres instance!

Now the data of the primary server has to be copied over using
``pg_basebackup``. This has to be done as the ``postgres`` user::

  sudo -u postgres pg_basebackup -h my.primary.db.xyz -p 7432 \
      -P --checkpoint=fast -U replication_user  -D /var/lib/postgresql/11/main/

Assuming ``/var/lib/postgresql/11/main/`` is our data directory and
``my.primry.db.xyz`` is the primary database server, listening on port ``7432``,
this command should ask you for the password of the replication user on the
primary and print progress information. This will take a while, depending on
your database size, because all the data from the primary server is copied over.

Of course the replica shouldn't write on its own to the database, instead it
should follow the primary. This is done by creating a file named
``recovery.conf`` in the Postgres data directory
(``/var/lib/postgresql/11/main/`` in this example)  with the following content::

  standby_mode          = 'on'
  primary_conninfo      = 'host=my.primary.db.xyz port=7432 user=replication_user password=<password>'
  trigger_file = '/tmp/MasterNow'
  #restore_command = 'cp /opt/postgresql_wal/%f "%p"

This file needs to be owned by the ``postgres`` user and the ``postgres`` group.
This configuration makes Postgres start as a standby (read-only) server. It will
automatically contact the primary server to stay up-to-date. If the file
``/tmp/MasterNow`` exists, Postgres will stop replication and become a primary.
If ``archive_command`` was used on the primary, the ``restore_command`` has to
be uncommented and configured.

Now the replica can be started. A line similar to the following should show up
in the log::

  started streaming WAL from primary at FD6/EB000000 on timeline 1

On the primary server, replicas should be visible in a query like this::

  select * from pg_stat_activity  where usename = 'replication_user' ;

Configure CATMAID
^^^^^^^^^^^^^^^^^

To load all neuron reconstruction data from a replica instead of the primary,
open the *Settings Widget* and find the *Read-only CATMAID mirrors* setting
in the *Tracing Overlay* section. This field contains a list of read-only
CATMAID mirror servers and API keys that can be used to query tracing data from.
This can be enabled using the *Read-only mirror index* below. Individual entries
are separated by commas and have The form ``url|apikey``. The API key (including
"|" is optional. URLs need to include the protocol, e.g.::

  https://example.com/catmaid/, https://example2.com/catmaid2/|apikey

The *Read-only mirror index* setting below, selects a mirror by index from the
above mirror list, starting with 1. Empty values, -1 or 0 will disable the use
of a database replica.
