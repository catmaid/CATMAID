.. _history-tables:

History and provenance tracking
===============================

CATMAID keeps track of all changes to its database tables. Each row has a time
range associated that denotes when this particular row was valid. This time
period is represented by the half-open interval ``[start, end)`` for which a row
is valid starting from time point ``start`` and is valid until (*but not
including!*) ``end``. Keeping track of changes is managed entirely in the
database. Currently, all CATMAID tables except ``treenode_edge`` are versioned,
which can always be regenerated from the ``treenode`` table. CATMAID als keeps
track of changes in non-CATMAID tables, that is the tables used by Django and
Django applications we use, except for Celery and Kombu tables.

History tables
--------------

Each versioned table has a so called history table associated, indicated by the
``_history`` suffix (e.g. ``project`` and ``project_history``). This history
table is populated automatically through database triggers: whenever data in the
live table is inserted, updated or deleted, the history table will be be
updated. It contains a complete copy for each version of each row and specifies
a time period for its validity. This time period is called "system time" and is
represented through the additional ``sys_period`` column in each history table.

CATMAID's history system has one requirement for tables it keeps track of: a
single column primary key has to be used. Extending it to support multi-column
primary keys is possible, not needed at the moment.

By default, all tables of CATMAID itself plus the user table (a Django table)
are set up to track history. To enable this for other tables (e.g. if new tables
are added), the database function ``create_history_table( live_table_name )``
can be used. This will create the history table and sets up all required
triggers. Likewise, there is a ``delete_history_table( live_table_name )``
function, which makes sure a history table is removed cleanly if this is wanted.
The table ``history_table`` keeps track of all currently active history tables.

Disabling history tables
^^^^^^^^^^^^^^^^^^^^^^^^

While history tracking is important and in most situations desirable, there are
a few situations where it would beneficial to disable it (e.g. some database
maintenance tasks). To do this the setting ``HISTORY_TRACKING`` can be set to
``False``, i.e. add the following line to the ``settings.py`` file::

   HISTORY_TRACKING = False

With the next restart of CATMAID, history tracking will be disabled. Likewise,
it can be enabled again by setting ``HISTORY_TRACKING = True`` (or removing the
line). If the history system is enabled after it was disabled (i.e. database
triggers have to be created), all history tables are synchronized so that they
contain the most recent live data as well.

Schema migration
^^^^^^^^^^^^^^^^

In case there are schema changes to any of the tracked live tables, the history
tables have to be changed as well. Currently, this happens manually, but will
become automated eventually (using Postgres DDL triggers). This means

* a) if a live table is created, a new history table has to be created for it
  (call `SELECT create_history_table(<schema>, <tablename>::regclass,
  <timecolumn>);`, with `<timecolumn>` being an edit reference time, e.g.
  `edition_time` for most CATMAID tables)
* b) if a live table is renamed, the history table is renamed accordingly, use
  `history_table_name(<tablename>::regclass)` to create the new name,
* c) if a live table is removed, the history table should be dropped as well,

or

* d) if a column is added, the history table should get the new column as well
  (defaulting to NULL values for previous entries if not manually filled),
* e) if a column is renamed, the history column should also be renamed or
* f) if the data type of a column changes, the original column is renamed (append
  first free "_n" suffix) and the new column is added. If no information loss is
  present (e.g. float to double), the original history column can also just be
  changed without backup to save storage space or
* g) if a column is removed, the history column is removed as well.

These changes should be done as part of the schema modifying migration
