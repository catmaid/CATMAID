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
