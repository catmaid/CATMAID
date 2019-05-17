.. _options:

Configuration options
=====================

A CATMAID instance an be configured mainly through the ``settings.py`` file, which
is located in the ``django/projects/mysite`` directory. Along with
``settings_base.py`` (which is not supposed to be edited) the instance
configuration is defined. Settings defined in ``settings_base.py`` can be
overridden in ``settings.py``. Below is an explanation of all available settings.

.. glossary::
  ``CELERY_WORKER_CONCURRENCY``
      Controls how many asyncronous Celery workers are allowed to run. This
      controls how many asyncronous tasks can be processed in parallel.

.. glossary::
  ``NODE_LIST_MAXIMUM_COUNT``
      The maximum number of nodes that should be retrieved for a bounding box
      query as it is used to render tracing data. If set to ``None``, no limit
      will be applied which can be slighly faster if node limiting isn't
      necessary in most cases.

.. glossary::
  ``NODE_PROVIDERS``
      This variable takes a list of node provider names, which are iterated
      during a node query as long as no result data is found. The next provider, if
      any, is only used if the current node provider either doesn't match the request
      or decides it can't provide a useful answer. An entry can either by a single
      node provider name (e.g. "postgis2d") or a tuple (name, options) to pass in
      additional options for a node provider. Possible node provider names are:
      postgis2d, postgis2dblurry, postgis3d ans postgis3dblurry. In addition to
      these, cache table can be configured, which allows the use of the following
      node proviers: cached_json, cached_json_text, cached_msgpack.

.. glossary::
  ``CREATE_DEFAULT_DATAVIEWS``
      This setting specifies whether or not two default data views will be
      created during the initial migration of the database and is ``True`` by
      default. It is typically only useful if the ``DVID`` or ``JaneliaRender``
      middleware are in use and doesn't have any effect after the initial
      migration.

.. glossary::
  ``MAX_PARALLEL_ASYNC_WORKERS``
     Control how many co-processes can be spawned from an async (Celery) worker.
     This means if ``MAX_PARALLEL_ASYNC_WORKERS`` is set to ``3`` and assuming
     ``CELERY_WORKER_CONCURRENCY`` is set to ``2``, asyncronous procerssing in
     CATMAID can be expected to use a maximum f ``6`` processes.

.. glossary::
  ``DATA_UPLOAD_MAX_MEMORY_SIZE``
     This option controls the maximum allowed requests size that the client
     application is allowed to send in bytes. By default this is set to 10 MB.
     If a requests exceeds this limit, error code 400 is returned.

.. glossary::
   ``REQUIRE_EXTRA_TOKEN_PERMISSIONS``
     To write to CATMAID through its API using an API token, users need to have
     a dedicated "API write" permission, called "Can annotate project using API
     token" in the admin UI. To allow users with regular annotate permission to
     write to the backend using the API, this variable can be set to `False`.
     The default value is `True`.

.. glossary::
   ``SPATIAL_UPDATE_NOTIFICATIONS``
      If enabled, each spatial update (e.g placing, updating or deleting
      treenodes, connectors, connector links) will trigger a PostgreSQL event
      named "catmaid.spatial-update". This allows cache update workers to update
      caches quickly after a change. Disabled by default.
