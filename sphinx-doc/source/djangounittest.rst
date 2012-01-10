Django unit tests for CATMAID
=============================

Loading the test fixtures (schema and data) into a new CATMAID database
-----------------------------------------------------------------------

Directly editing the data in the test fixtures (`django/applications/vncbrowser/tables.sql` and `django/applications/vncbrowser/data.sql`) would be very error-prone.  A better idea is to create a new CATMAID instance pointing to a database that only contains the fixture data.  Then you should only very carefully make changes to the CATMAID instance where they are required to support a new test you want to add.

To create such an instance, follow the usual installation instructions for CATMAID up to the point where you would use the `createuser.sh` script, and make sure that you specify a new database name, e.g. `catmaid_fixture`::

     scripts/createuser.sh catmaid_fixture catmaid_user p4ssw0rd | sudo -u postgres psql

Then, rather than loading the usual example data, just import the fixture data::

     psql -U catmaid_user catmaid_fixture < django/applications/vncbrowser/tables.sql
     psql -U catmaid_user catmaid_fixture < django/applications/vncbrowser/data.sql

If you want to start again and reload the fixture data into the test database, you can do::

     sudo -u postgres dropdb catmaid_fixture
     scripts/createuser.sh catmaid_fixture catmaid_user p4ssw0rd | sudo -u postgres psql
     psql -U catmaid_user catmaid_fixture < django/applications/vncbrowser/tables.sql
     psql -U catmaid_user catmaid_fixture < django/applications/vncbrowser/data.sql

Dumping changes in a CATMAID instance back to the test fixtures
---------------------------------------------------------------

Suppose that to create the data for your test, you needed to add a skeleton and a neuron in your CATMAID instance.  You should then dump the database back to the fixture files afterwards::

    cd ~/catmaid
    scripts/dump-database-schema.sh catmaid_fixture > django/applications/vncbrowser/tables.sql
    scripts/dump-database-inserts.sh catmaid_fixture > django/applications/vncbrowser/data.sql

Then run `git diff` to check that the additions to the fixtures make sense.  (It's a good idea to check how these changes to the fixtures affect which tests pass.)

Test coverage
-------------

If you install `coverage.py` (`pip install coverage` in your virtualenv) you can generate test coverage statistics with::

    coverage run ./manage.py test vncbrowser

Then run::

    coverage html

... to generate HTML output in `htmlcov/index.html`

