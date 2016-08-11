.. _history-tables:

History and provenance tracking
===============================

CATMAID keeps track of all changes to its database tables. If a database row
is changed, all old values will be stored in a so called history table together
with a time range representing the datas validity. This time period is
represented by the half-open interval ``[start, end)`` for which a row is valid
starting from time point ``start`` and is valid until (*but not including!*)
``end``. Keeping track of changes is managed entirely by the database. Besides
disabling or enabling history tracking, the only thing Django can change, is
providing a label for the current transaction, which is useful to give some
semantics to a set of database changes. Currently, all CATMAID tables except
``treenode_edge`` and a few others are versioned, which can typically be
regenerated. CATMAID also keeps track of changes in most non-CATMAID tables,
that is the tables used by Django and Django applications we use, except for
asynchronous task related Celery and Kombu.


History tables
--------------

Each versioned table has a so called history table associated, indicated by the
``__history`` suffix (e.g. ``project`` and ``project__history``). A double
underscore is used to minimize collisions with existing names. This history
table is populated automatically through database triggers: whenever data in a
live table is updated or deleted, the history table will be be updated. It
contains a complete copy of every historic version of each row and specifies a
time period for its validity. This time period is called "system time" and is
represented through the additional ``sys_period`` column in each history table.
This time range spans typically the time of the last edition (or creation) to
the time of change. If a live table doesn't store such a start time stamp, a
separate 1:1 tracking table, which keeps track of editions, is created and
managed. Such tracking tables are named like the original table plus the suffix
``__tracking``.

CATMAID's history system has one requirement for tables it keeps track of: a
single column primary key has to be used. Extending it to support multi-column
primary keys is possible, not needed at the moment.

By default, all tables of CATMAID itself plus the user table (a Django table)
are set up to track history. To enable this for other tables (e.g. if new tables
are added), the database function ``create_history_table( live_table )``
can be used. This will create the history table and sets up all required
triggers. Likewise, there is a ``delete_history_table( live_table )``
function, which makes sure a history table and triggers are removed cleanly if
this is wanted.  The table ``catmaid_history_table`` keeps track of all
currently active history tables.

Transaction log
^^^^^^^^^^^^^^^

Each endpoint of the CATMAID API that changes data is supposed to leave a log
entry in the transaction log. This way, database changes can be associated with
a particular back-end operation. Like explained in the :ref:`contributor
documentation <contributor-backend>`, data changing endpoints in ``urls.py``
are wrapped in a ``record_view`` decorator, which is parameterized with a label.
This label is used by the back-end to find affected tables of a change.

Disabling history tracking
^^^^^^^^^^^^^^^^^^^^^^^^^^

While history tracking is important and in most situations desirable, there are
a few situations where it would beneficial to disable it (e.g. some database
maintenance tasks, potentially more performance). To do this the setting
``HISTORY_TRACKING`` can be set to ``False``, i.e. add the following line to the
``settings.py`` file::

   HISTORY_TRACKING = False

With the next restart of CATMAID, history tracking will be disabled. Likewise,
it can be enabled again by setting ``HISTORY_TRACKING = True`` (or removing the
line). If the history system is enabled after it was disabled (i.e. database
triggers have to be created), all tracking tables are updated to match the live
data again.

Schema migration
^^^^^^^^^^^^^^^^

In case there are schema changes to any of the tracked live tables, the history
tables have to be changed as well and triggers have to be regenerated.
Currently, this happens manually, but is planned to become automated eventually
(using Postgres DDL triggers). This means

* a) if a live table is created, a new history table has to be created for it
  (call ``SELECT create_history_table( <tablename>::regclass,  <timecolumn>,
  <txidcolumn> );``, with ``<timecolumn>`` being an edit reference time and
  ``<txidcolumn>`` being a column tracking a row's transaction ID. For most
  CATMAID tables those parameters are ``edition_time`` and ``txid``,
  respectively. If both ``<timecolumn>`` and ``<txid>`` are ``NULL``, a tracking
  table will be created automatically. Only providing one of the two is
  currently not supported. To let CATMAID know if you expect this table to have
  a history table, add the table to the appropriate list in the
  ``HistoryTableTest`` class. This way you can also mark a table as not
  versioned.
* b) if a live table is renamed, the history table is renamed accordingly, use
  the function ``history_table_name(<tablename>::regclass)`` to create the new name,
* c) if a live table is removed, the history table should be dropped as well

or

* d) if a column is added, the history table should get the new column as well
  (defaulting to ``NULL`` values for previous entries if not manually filled),
* e) if a column is renamed, the history column should also be renamed or
* f) if the data type of a column changes, the original column is renamed (append
  first free "_n" suffix) and the new column is added. If no information loss is
  present (e.g. float to double), the original history column can also just be
  changed without backup to save storage space or
* g) if a column is removed, the history column is removed as well.

These changes should be done as part of the schema modifying migration. For all
changes except live table creation and deletion, triggers have to be
regenerated. To do this, call ``PERFORM update_history_tracking_for_table(
<tablename>::regclass )`` for individual tables or update all tables at once
with ``PERFORM update_history_tracking()``. This should make sure all changes
are baked into the trigger functions.

Below you will find an example of the migration SQL code to update the data
type of a particular column of a table. In this particular case the ``value``
column of the ``client_data`` table changes its type from ``text`` to ``jsonb``,
which should be reflected directly in the history table::

    DO $$
    BEGIN
    -- Update history table
    EXECUTE format(
        'ALTER TABLE %1$s '
        'ALTER COLUMN value '
        'TYPE jsonb '
        'USING value::jsonb',
        history_table_name('client_data'::regclass));
    -- Update triggers
    PERFORM update_history_tracking_for_table('client_data'::regclass);
    END
    $$;
