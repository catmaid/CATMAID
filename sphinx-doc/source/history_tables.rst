.. _history-tables:

History and prevenance tracking
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

By default, all tables of CATMAID itself plus the user table (a Django table)
are set up to track history. To enable this for other tables (e.g. if new tables
are added), the database function ``create_history_table( live_table_name )``
can be used. This will create the history table and sets up all required
triggers. Likewise, there is a ``delete_history_table( live_table_name )``
function, which makes sure a history table is removed cleanly if this is wanted.
The table ``history_table`` keeps track of all currently active history tables.
