.. _options:

Configuration options
=====================

A CATMAID instance an be configured mainly through the ``settings.py`` file, which
is located in the ``django/projects/mysite`` directory. Along with
``settings_base.py`` (which is not supposed to be edited) the instance
configuration is defined. Settings defined in ``settings_base.py`` can be
overriden in ``settings.py``. Below is an explanation of all available settings.

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
