Frequently Asked (User) Questions
=================================

.. _faq-3dviewer-webm:

Why can I only export WebM movies from the 3D viewer?
-----------------------------------------------------

There is currently no easy way to generate other formats from within a browser.
Besides, WebM is a reasonable effort to standardize and it seems to be the
future play-everywhere codec. However, you can use other tools to convert the
generated WebM movie to your preferred video format (e.g. to play it in
PowerPoint). A convenient GUI tool to do this is
`Handbrake <https://handbrake.fr/>`_. Alternatively, if you prefer the command
line, you could use ``ffmpeg``::

  ffmpeg -y -i input.webm -vcodec libx264 output.mov

or avconv::

  avconv -i input.webm -vcodec copy output.mov

Also note that ``ffmpeg`` (or rather the H264 codec) expects the input to have
a width and height of an even number. To crop the input movie on the fly, the
following option can be added: ``-filter:v "crop=<width>:<height>:0:0"``,
replacing ``<width>`` and ``<height>`` with the desired width and height in
pixels.

.. _faq-source-subscriptions:

What are skeleton source subscriptions?
---------------------------------------

Many tracing related widgets allow to react to changes in skeleton lists in
other widgets. Widgets supporting this got a new small chain icon in their title
bar with which a subscription management user interface can be shown and hidden.
Widgets that contain multiple sources, like the connectivity matrix, have one
icon per source. A hover title will show which one to use for each source.

The UI allows to add subscriptions to multiple sources which can then be
combined through set operations. Currently sources are combined in a strict
left-associative fashion from top to bottom of the list. When "Override
existing" is checked, widget local skeletons are not used when subscriptions are
refreshed and will subsequently be removed. Otherwise, the local set is united
with the first subscription before all other subscription sources are applied.

The scope of individual subscriptions can be adjusted: By default each
subscription reacts to skeletons added, removed and updated in a source. The
"Filter" selection allows to listen to only one of these events. For instance,
subscribing to the active skeleton with the "Only additions" filter, allows to
collect skeletons selected active skeletons without removing them again from a
widget.

By default, only selected skeletons are subscribed to. This means if a skeleton
becomes unselected in a source it is removed from the target widget. If the
"Only selected" checkbox is unchecked, also unselected skeletons are added to a
target widget. They are removed when skeletons are removed from the source and
their selection state is synced.

.. _faq-custom-mirrors:

How to make a local copy of image data available?
-------------------------------------------------

CATMAID represents multiple copies of image data as so-called stack mirrors.
Which mirror is used can be selected in the image layer settings dialog, which
can be opened through the little blue-white square button in the lower left
corner of a stack viewer. Besides mirrors configured by an administrator, it is
also possible to add custom mirrors. Custom mirrors are persisted in a browser
cookie and will be available after reloading CATMAID. The 'Add' button in the
'Custom mirror' section of the layer settings will bring up a dialog where a new
custom mirror can be added. Nearly all required fields are pre-populated from an
existing mirror, only a URL has to be added.

The image data available from this URL has to match the properties in the
dialog, which should normally be the case if the image data is a copy of an
existing image stack. Additionally, it is recommended that this data is made
available through HTTPS. As an example, a common use case is to have a copy of
the image data set on an external USB SSD drive. To make this data available to
CATMAID, a local webserver has to be started. An easy way to do this is to grab
a copy of a simple Python server script available from the
`CATMAID source repository <https://github.com/catmaid/CATMAID/blob/master/scripts/data/serve-directory.py>`_.
Save a copy of this script in the root folder of the USB SDD along with a copy
of the
`certificate <https://github.com/catmaid/CATMAID/blob/master/scripts/data/localhost.pem>`_,
which is available from the same location and should be placed next to the
``serve-directory.py`` script. Next navigate with a terminal to the root of the
image data and execute the Python script::

  python serve-directory.py 8090 ./localhost.pem

The first argument is the port on which the server will be made available and
the second argument is the downlaoded previously SSL certificate. If everything
works as expected, the URL to put in CATMAID's custom mirror dialog should be::

  https://localhost:8090/

If the image data is not directly available in the USB SDD's root, the relative
path has to be added to the URL.
