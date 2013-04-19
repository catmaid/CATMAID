.. _tools:

Tools
=====

CATMAID includes a set of tools to navigate, share and annotate large
image data sets. These tools often contain some control elements to
modify certain parameters. This could e.g. be sliders, buttons or input
boxes. Most of the controls offer various ways for changing a value
and so sliders and input boxes can be changed with the help of the mouse
wheel, small buttons or direct input.

The tools visible to a user can be set in the admin interface on a per
user basis. See the section about :ref:`user profiles <user-profiles>` to
learn how to modify the visible tools and how to set defaults suiting
your use case.

Navigation
----------

The navigation tool makes it easy to browse a data set. It allows you to
specify the center of the current view and provides controls to change the
current slice and zoom level. Keep in mind that a zoom-level defines how
often the images dimension get divided by two (i.e. dim/2^zoom). A change
of these controls will redraw the current view.

Clicking and dragging the view with the mouse can be used to move around
on the current slice.

.. _tagging-tool:

Tagging
-------

Projects and stacks can be associated with tags. Tags are basically strings
that capture some property of an object. They can contain spaces and any
other alphanumerical character. CATMAID's tagging tool will allow you to
view and modify the tags of an active stack and of the project it belongs
to. Changes will only be applied when the check icon on the right is
clicked.

Cropping
--------

With the help of the cropping tool it is possible to extract sub-stacks
out of the currently viewed stack and other stacks in the project. The
region of interest can be specified by clicking with the left mouse
button on the view and dragging the created rectangle to the desired shape.
This rectangle can be created and adjusted as well with the help of the
four input boxes in the cropping tool bar.

By default only one slice is created. However, by using the "top z-index"
and "bottom z-index" sliders, the range in the Z dimension can be
modified. The "zoom-level" slider denotes what the zoom level of the
*output image* will be. It is perfectly fine to draw a crop box in a view
with zoom level three and let the cropping tool create an output stack
based on zoom level zero. Note that one can easily increase the output
file size with operations like this.

If there is more than one stack in the current project available, a menu,
labeled "Stacks", is shown as well. All the available stacks of the
project are listed there and can be selected for output. By default
only the current stack is marked. For all the selected stacks the same
region of interest is used. The resulting cropped stack will contain
all the selected stacks and its dimensions are XYCZ ordered. That means,
that the current slice is appended to the output for every stack before
the next Z step is made.

To start the cropping job, one needs to click on the tickmark on the right.
A confirmation message should appear. You will get a notificiation in the
message view once the sub-stack has been cropped. By default, cropped
sub-stacks will remain for two weeks on the server. This can be adjusted
by configuring a periodic task that manages the clean-up. See the section
about :ref:`creating periodic tasks <sec-celery-periodic-tasks>` for an
example how to do this.

The output image is a TIFF file with potentially multiple pages, with each
one being an RGB image. The file contains some meta data: the EXIF tags
``XResolution`` and ``YResolution`` of every image contain the created
image's X and Y resolution, respectively -- in pixel per nanometer (if the
image resolution in the data base is nano meter based). The
``ImageDescription`` tag contains ImageJ specific meta data. It passes
information about the number of images, the channels and whether to use
hyperstacks to ImageJ. For the purpose of creating these meta data tags,
the tool ``exiftool`` is used internally.

Ontology Tools
--------------

The documentation of the ontology tools can be found on a
:ref:`separate page <ontology-tools>`.
