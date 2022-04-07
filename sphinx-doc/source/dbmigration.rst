Database Migrations
===================

Historically, keeping your database in sync with what's expected by the code
has been error-prone and annoying, but CATMAID uses a system for schema and
data migrations called `South <http://south.aeracode.org/>`_ which simplifies
and structures this task. In contrast to past versions of CATMAID, South
migrations *won't* get applied automatically. So when updating the code base,
the database has to be updated as well. This page describes what you need to
know about these migrations.


General things about South
--------------------------

South has been built to bring migrations to Django projects. Since CATMAID's
backend is Django based, it can make use of it. South is stable, tries to be
simple and is database-independent. CATMAID, however, depends on some
PostgreSQL specific features and database-independence is therefore not really
important here.

Every migration is kept in its own file. They are stored in a `migrations`
folder within a Django application's directory. In the case of CATMAID this is::

    django/applications/catmaid/migrations

In there you find files like these::

    0005_add_ontology_visibility_setting_to_profile.py
    0006_add_restriction_tables.py
    0007_add_treenode_parent_index.py

Each migration file groups logically connected changes to the database schema
and data. As can be seen above, migrations are ordered by the first characters of
their file name. Obviously, the order is important and when creating migrations
you want to make sure to not create ambiguous file names.

A migration file contains of a class with a ``forward()`` and a ``backward()``
method as well as a dictionary called ``models`` which contains all available
models which were around when the migration was created (i.e. it contains the
changes of the migration; read more about it
`here <http://south.readthedocs.org/en/latest/ormfreezing.html>`__).

The main way to interact with South is with the help of ``manage.py``
commands. South adds multiple commands to it, the most often used will probably
be ``schemamigration`` to create new migrations and ``migrate`` to run
migrations (see below). To use ``manage.py``, you need to be in the
*virtualenv* environment (activate it with ``source /home/alice/catmaid/django/env/bin/activate``). The commands
in other parts of this page assume you are in the *virtualenv* and the folder
where the ``manage.py`` file lives.

Of course, the migration files need to be added to the source code management.


Checking for new migrations and applying them
---------------------------------------------

To check if there are new migrations that need to be applied, run::

    ./manage.py showmigrations

CATMAID utilizes two other applications that use South as well: guardian and
djcelery. If you want to refer only to CATMAID, do::

    ./manage.py showmigrations catmaid

If there is no migration that has not been applied, you will see a list like the
following::

    (*) 0005_add_ontology_visibility_setting_to_profile
    (*) 0006_add_restriction_tables
    (*) 0007_add_treenode_parent_index

The ``(*)`` marks indicate that a migration has been applied. In turn ``( )``
would mean it hasn't. So if migration 0007 wouldn't be applied yet, it would
read::

    (*) 0005_add_ontology_visibility_setting_to_profile
    (*) 0006_add_restriction_tables
    ( ) 0007_add_treenode_parent_index

And if you would then want to apply migration 0007, you would need to either
run::

    manage.py migrate catmaid 0007

to only apply this particular migration. Alternatively, you can apply *all* not
yet applied migrations with::

    manage.py migrate catmaid


I want to make a change to the database
---------------------------------------

Usually, changes to the database are needed because there have been changes to
CATMAID's models in the file (like adding a new field to a class)::

    django/applications/catmaid/models.py

If this is the case, you can let South create a migration for this change by
running::

    manage.py schemamigration catmaid [title] --auto

This will create a new file in CATMAID's migration folder. It will make sure it
has the next free ID and ``[title]`` is the remainder of the file name. If
``[title]`` isn't provided, South will come up with an own name. The parameter
``--auto`` instructs South to inspect the models module of CATMAID and to create
a migration based on the changes with respect to the last migration.

If you in turn wanted to create an empty migration to do changes the database
that are not based on the models module, run::

    manage.py schemamigration catmaid [title] --empty

These commands, however, do only create the migration file. They don't apply it.
This has to be done manually afterwards.


I want to use raw SQL in a migration
------------------------------------

Using raw SQL in a migration is is perfectly possible. Instead of using the
object relational mapper, you can execute SQL statements directly within the
``forward()`` and ``backward()`` methods within the migrations file. To do so
you would first need to create an empty migration by running::

    manage.py schemamigration catmaid [title] --empty

Edit the new file and pass your SQL statements as string arguments to the
``db.execute()`` method. For instance::

    db.execute("DROP INDEX IF EXISTS treenode_parent_id_index")

If you actually add or delete tables or fields, make sure that the ``models``
dictionary is consistent with it (e.g. doesn't state a model has the field you
just deleted manually).


Merge branches with migrations into branches with newer migrations
------------------------------------------------------------------

Of course, it can happen that one works on a branch where new migrations are
added while another branch (e.g. upstream's master) got new migrations added,
too. This might introduce problems when you want to merge one branch into the
other.

For example, let's say the most recent migration on *master* starts with ``0007``.
You create a new topic branch based on this and you add a new migration with a
name starting with ``0008_add_column``. After some time you want to merge this
branch back into *master*, which meanwhile also got a new migration with a name
stating with ``0008_add_table``.

If you just merge your branch, both migration files will be present next to each
other. South loads migrations in ASCII sort order, so in principal both are at
the correct position. This isn't really a problem *if* those migrations don't
modify the same models. You can then simply run ``migrate`` with the ``--merge``
option to apply those out of order migrations.

Though, this works in most situations, it is not very pretty. As an alternative,
you might want to consider the following: Re-create the migration(s) to have the
correct ID, based on the upstream commits. This however needs some manual work.
So before merging a branch, check whether there are conflicting IDs and, if so,
do the following in the topic branch (referring to the example above):

1. Roll back the migrations to the last non-conflicting state, here ``0007``::

       manage.py migrate catmaid 0007

2. Delete all conflicting migrations in the topic branch. If custom migration
   code has been added (like raw SQL), make sure to keep it around.

3. Merge the branch with the newer migrations into your topic branch (e.g.
   upstream/master).

4. Re-create your migrations (the new files will get correct IDs)::

       manage.py schemamigration catmaid [title] --auto

   Note that this will create *one* migration containing all the database
   changes you made. Of course, you can also create migrations for single models
   if you want.

   If you have custom migration code, create new empty migrations and add your
   custom migration code to them::

       manage.py schemamigration catmaid [title] --empty

5. Migrate your database to make sure everything works and if so, create a new
   commit to add the new migrations

6. Merge the topic branch into the target branch

Also note that the South documentation has an own section on team workflows. You
can find it `here <http://south.readthedocs.org/en/latest/tutorial/part5.html>`_.


I just want to drop the database and start from scratch
-------------------------------------------------------

If you're *really* sure that you don't need any of the data in your catmaid
database, you can just drop the database and start again:

Drop the database::

  sudo -u postgres dropdb catmaid

Run the commands generated by the `createuser.sh` script to make sure that the
database, the database user, various functions and the plpgsql language are all
created.  The parameters to that script are the database name, the database
user and the password for that database user::

  scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql

(You may get errors saying that the user role has already been created, and
that the functions already exist.  You can safely ignore these.)

Now visit your CATMAID web page and the schema of the database will be updated.
If you want to add back the example projects, you need to run the script
`scripts/database/insert-example-projects.py`.
