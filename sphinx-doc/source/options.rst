.. _options:

Configuration options
=====================

A CATMAID instance can be configured mainly through the ``settings.py`` file, which
is located in the ``django/projects/mysite`` directory. Along with
``settings_base.py`` (which is not supposed to be edited) the instance
configuration is defined. Settings defined in ``settings_base.py`` can be
overridden in ``settings.py``. Below is an explanation of all available settings.

.. glossary::
  ``CELERY_WORKER_CONCURRENCY``
      Controls how many asynchronous Celery workers are allowed to run. This
      controls how many asynchronous tasks can be processed in parallel.

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
      postgis2d, postgis2dblurry, postgis3d and postgis3dblurry. In addition to
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
      ``CELERY_WORKER_CONCURRENCY`` is set to ``2``, asyncronous processing in
      CATMAID can be expected to use a maximum of ``6`` processes.

.. glossary::
  ``DATA_UPLOAD_MAX_MEMORY_SIZE``
      This option controls the maximum allowed request size that the client
      application is allowed to send, in bytes. By default this is set to 10 MB.
      If a request exceeds this limit, error code 400 is returned.

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

.. glossary::
  ``CLIENT_SETTINGS``
      Can be a JSON string or dictionary that keeps default values for the whole
      instance for the client settings. Keys of the dictionary are the
      client-settings values, e.g. "neuron-name-service". The values are the
      settings values in the format the front-end expects. For instance, to show
      by default all annotations that are labeled with "neuron name" as textual
      representation of neurons, this line could be used::
      
      CLIENT_SETTINGS = '{"neuron-name-service": {"component_list": [{"id": "skeletonid", "name": "Skeleton ID"}, {"id": "neuronname", "name": "Neuron name"}, {"id": "all-meta", "name": "All annotations annotated with \\\"neuron name\\\"", "option": "neuron name"}]}}'

      By default, no settings are set and this value is `None`.

.. glossary::
  ``FORCE_CLIENT_SETTING``
      By default, existing client settings won't be replaced if they exist
      already. To force a replace, set this variable to `True`.

.. glossary::
  ``CMTK_TEMPLATE_SPACES``
      A list that defines folders with additional CMTK template spaces that can
      be used with e.g. elmr or the nat.virtualflybrains R packages. Empty by
      default.

.. glossary::
  ``STATIC_EXTENSION_ROOT``
      The absolute local path where the static extension files are kept. These can
      be loaded by the front-end to include custom out-of-source extensions in the
      front-end (e.g. a custom widget). Defaults to ``<catmaid-paith>/django/staticext``.

.. glossary::
  ``STATIC_EXTENSION_URL``
      The URL under which custom front-end code can be made available. It is
      expected to map to ``STATIC_EXTENSION_ROOT`` and is by default set to to
      ``<catmaid-subdir>/staticext/``.

.. glossary::
  ``STATIC_EXTENSION_FILES``
      A list of file names that are allowed to be loaded by the front-end through
      ``STATIC_EXTENSION_URL`` and ``STATIC_EXTENSION_ROOT``. Empty by default.

.. glossary::
  ``NEW_USER_CREATE_USER_GROUP``
      Whether or not a matching user group should be created for every newly
      created user. This can make user management easier if a lot of shared data
      access is configured.

.. glossary::
  ``USER_REGISTRATION_CONFIRM_TERMS``
      Whether or not a user registration form requires users to accept a set of
      terms and conditions. Disabled by default.

.. glossary::
  ``USER_REGISTRATION_CONFIRM_TERMS_TEXT``
      The terms and conditions users need to accept upon registering, if this
      confirmation is required.

.. glossary::
  ``PROJECT_TOKEN_USER_VISIBILITY``
      If enabled, logged in users will only see other users when they share a
      project token. Disabled by default.
