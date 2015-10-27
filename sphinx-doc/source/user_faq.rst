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
