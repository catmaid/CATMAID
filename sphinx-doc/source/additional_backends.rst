.. _additional_backends:

Additional back-ends
====================

CATMAID's front-end can retrieve project and stack information from other
services. To do this, the back-end has to be configured slightly differently to
re-route API endpoints related to information retrieval for both projects and
stacks. In this mode, CATMAID is only useful for image viewing at the moment.
There are currently two web services supported, the
`Janelia Render Service <https://github.com/saalfeldlab/render>`_ and
`DVID <https://github.com/janelia-flyem/dvid>`_. Only one of these options can
be used at a time.

Janelia Render Service
----------------------

Add the following to CATMAID's `settings.py` file and adjust URL, default
resolution as well as tile dimension to your setup::

    # Janelia rendering service
    MIDDLEWARE += ('catmaid.middleware.JaneliaRenderMiddleware',)
    JANELIA_RENDER_SERVICE_URL = 'http://renderer.int.janelia.org:8080/render-ws/v1'
    JANELIA_RENDER_DEFAULT_STACK_RESOLUTION = (4,4,35)
    JANELIA_RENDER_STACK_TILE_WIDTH = 1024
    JANELIA_RENDER_STACK_TILE_HEIGHT = 1024

To also see all projects on the front-end (rather than only in the menus), the
`simple project list view` has to be be used as a data view. This can be done by
either adding it to the list of data views or removing all existing data views,
because it is the default fallback. Both is possible from CATMAID's admin view.
Projects will be organized by owners.

DVID
----

A setup similar to the Janelia Render Serivce can be used with DVID. To do so
add the following to your `settings.py` file and adjust to your setup::

  MIDDLEWARE += ('catmaid.middleware.DVIDMiddleware',)
  DVID_URL = 'http://emdata2.int.janelia.org:7000'
  DVID_FORMAT = 'jpg:80'
  DVID_SHOW_NONDISPLAYABLE_REPOS = True

