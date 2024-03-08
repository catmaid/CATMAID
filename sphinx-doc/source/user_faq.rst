Frequently Asked (User) Questions
=================================

.. _faq-undelete-neuron:

A neuron was accidentally deleted. Can I undelete it?
-----------------------------------------------------

If history tracking is enabled (default) than this is possible to do for the
admin, using a handful of server-side commands. Note that in their current form,
they can only safely be applied if nothing referencing the skeleton in question
changed (e.g. synapses connected to the neuron prior deletion, which were
deleted separately from the neuron, won't get their other synaptic partners back
if only the neuron is restored). In order to rollback a neuron deletion
transaction it is currently required to do the following steps server-side as an
admin:

1. Make a backup
2. Ideally stop CATMAID to avoid further changes (not strictly required)
3. Look up the transaction ID and timestamp of the transaction that deleted the
   neuron (``neurons.remove`` operation) from the table
   ``catmaid_transaction_info`` or the Log/History Widget in the front-end.
4. On the server, enable CATMAID's Python environment (activate virtualenv)
5. Open ``manage.py shell`` and run the following code::

       from catmaid.history import Transaction, undelete_neuron
       tx = Transaction(<tx-id>, '<tx-execution-time>')
       undelete_neuron(<project-id>, tx, <user-id>, <interactive>)

The interactive flag indicates whether the function should ask for confirmation.
For instance, a real example might look like::

   from catmaid.history import Transaction, undelete_neuron
   tx = Transaction(8477203, '2024-03-08 10:29:07.086284+01')
   undelete_neuron(1, tx, 21, True)

This will insert all historic rows referenced by transaction ``8477203`` on
``2024-03-08 10:29:07.086284+01`` into the respective live tables in project
``1``. Log entries will be created for user ``21``. The same IDs will be used as
before.

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

How to create the small overview images in the lower right corner?
------------------------------------------------------------------

It is possible to show a small overview image of the current section in the
lower right corner. Generally, CATMAID looks for them as ``small.<extension>``
(e.g. ``small.jpg``) using the (remote) path for the current Z coordinate and
makes the file fit into 192x192px. These files can be created of course in many
ways and here is one waay doing ths using ``graphicsmagick`` (or alternatively
``imagemagick``)::

It makes sense to use the highest zoom level as possible, becasue we make the
image only smaller and the less data to process the quicker we have our images.
Also, in this simple example, it means that we don't need to combine tiles and
only have to deal with a single image.

Let's assume we have nine zoom levels and the data will occupy only one tile at
this zoom level, i.e. the highest value displayed in the UI as *z-index* is 8,
because zoom-levels are zero-indexed. Like said above, CATMAID wants these files
to fit into 192x192px, so we need to find out how much we need to scale the
zoom-level. However, at this zoom level, there will be zome extra void data,
because the scaled-down dataset is less wide than the defined tile width. If we
know our image data has a larger width than height, we can compute the actual width
of the data at zoom-level 9 through
``<dataset-width-at-zoom-0>/2**<zoom-level-to-use>)``. This can be used to
obtain the scale factor required for the 192x overview image, which in turn can
be used to find out by how much to scale a tile at that zoom level so that the
data it contains fits into the 192x192px overview image::

  new_tile_width = (192 / (<dataset-width-at-zoom-0>/2**<zoom-level-to-use>)) * <tile-width>

For instance, a dataset that has a width of 135200 at zoom level zero, a tile
size of 1024px and nine zoom levels::

  744.55 = (192 / (135200/2**9)) * 1024

From a tile that is scaled to this width, we would then only use the top left
cutout for the overview, the rest is empty data. This can be done using
``convert`` tool (of the ``graphicsmagick`` or ``imagemagick`` package)::

  convert /path/to/input/tile/ -resize <data-width-at-zoom>x -gravity NorthWest -extent <overview-width>x<overview-height> /path/to/z/directory/small.<extension>

Sticking to the example above, and assuming data in a tile source type type 4
("Backslash tile source") directory structure under ``/data/tiles/`` and file
extension ``jpg``, this command could look like the following to generate the
overview for section 0::

  convert /data/tiles/0/9/0_0.jpg -resize 745x -gravity NorthWest -extent 192x170 /data/tiles/0/small.jpg

To run this for the whole image stack, a small Bash loop can be used::

  for f in (ls /data/tiles/); do convert /data/tiles/$f/9/0_0.jpg -resize 745x -gravity NorthWest -extent 192x170 /data/tiles/$f/small.jpg; done

Note that the 170px height of the the overview image can be computed by
scaling the original data so that its width fits into 192px. If the data was
taller than wide, the height would be 192px and the width adjusted.
