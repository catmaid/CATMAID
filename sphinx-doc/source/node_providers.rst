.. _node_providers:

Node providers
==============

CATMAID uses so called *node providers* query tracing data from the database.
Depending on the query there are different query strategies that can be useful.
By default CATMAID uses a node provider called ``postgis3d``, which uses a 3D
bounding box query on a PostGIS representation of the tracing data. This works
well with very dense data and seems to be a good average. The ``NODE_PROVIDERS``
setting in ``settings.py`` gives access to the behavior and allows to configure
different node providers along with constraints that would mark them valid or
invalid for a particular request. This allows to e.g. use a caching node
provider that doesn't update immediately for large field of views. For smaller
field of views a regular ``postgis3d`` node provider might be used. These are
the available node providers:

.. glossary::
  ``postgis2d``
      Nodes are queried using a PostGIS 2D index. This seems fast for sparser
      data and large field of views.

.. glossary::
  ``postgis2dblurry``
      Like ``postgis2d``, but one intersection test less, which includes more
      false positives for a given bounding box. It is however also faster.

.. glossary::
  ``postgis3d``
      Nodes are queried using a PostGIS 3D index. This seems fast for denser
      data and smaller field of views.

.. glossary::
  ``postgis3dblurry``
      Like ``postgis3d``, but one intersection test less, which includes more
      false positives for a given bounding box. It is however also faster.

.. glossary::
  ``cached_json``
      A cached version of the data for a given section using the
      ``node_query_cache`` table. It is stored as JSON database object.

.. glossary::
  ``cached_json_text``
      A cached version of the data for a given section using the
      ``node_query_cache`` table. It is stored as JSON text string.

.. glossary::
  ``cached_msgpack``
      A cached version of the data for a given section using the
      ``node_query_cache`` table. It is stored as msgpack encoded binary
      database object.


Cached node queries
-------------------

The caches for use with the last three entries can be populated using the
following management command::

   manage.py catmaid_update_cache_tables

It allows to populate cache data for the formats ``json``, ``json_text`` and
``msgpack`` based on a set of parameters. It can be run for all projects or a
subset. A typical call could look like this::

  manage.py catmaid_update_cache_tables --project_id 1 --type msgpack --orientation xy --step 40 --node-limit 0

The ``--step`` parameter sets the section thickness, i.e. Z resolution in ``xy``
orientation. A ``--node-limit`` of 0 will remove any existing node limits. The
type ``msgpack`` turned out to be the fastest one in our tests so far.

It makes sense to automate this process to run once every night. This can be
done with a cron-job or with predefined :ref:`Celery <celery>` tasks,
which can be added to ``settings.py`` like this::

  CELERY_BEAT_SCHEDULE['update-node-query-cache'] = {
    'task': 'update_node_query_cache',
    'schedule': crontab(hour=0, minute=30)
  }

This would require Celery Beat to run. If it does, it  would update all caches
defined in ``NODE_PROVIDERS`` every night at 00:30.


Using multiple node providers
-----------------------------

It is possible to define multiple node providers that are valid in different or
the same situation. An example could look like this::


  NODE_PROVIDERS = [
      ('cached_msgpack', {
          'enabled': True,
          'min_width': 200000,
          'min_heigth': 120000,
          'orientation': 'xy'
      }),
      ('postgis3d', {
          'project_id': 2
      }),

      # Fallback
      'postgis2d'
  ]

For an incoming request, CATMAID will first find all valid node providers,
depending on e.g. the project ID, or bounding box of the query. It will then
iterate this list and return results from the first node provider that returns
results. The following options are available for all node providers:

.. glossary::
  ``enabled``
      Whether the node provider can be used at all.

.. glossary::
  ``project_id``:
      For which project this node provider can be used.

.. glossary::
  ``orientation``
      For which orientation this node provider can be used.

.. glossary::
  ``min_width``
      Which minimum width the query bounding box must have for this node
      provider (in project coordinates).

.. glossary::
  ``min_height``
      Which minimum height the query bounding box must have for this node
      provider (in project coordinates).

.. glossary::
  ``min_depth``
      Which minimum depth the query bounding box must have for this node
      provider (in project coordinates).

.. glossary::
  ``max_width``
      Which maximum width the query bounding box can have for this node
      provider (in project coordinates).

.. glossary::
  ``max_height``
      Which maximum height the query bounding box can have for this node
      provider (in project coordinates).

.. glossary::
  ``max_depth``
      Which maximum depth the query bounding box can have for this node provider
      (in project coordinates).
