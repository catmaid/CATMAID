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
