.. _creating-data-view-types:

Creating New Data View Types
============================

There are currently only rather general data view types available in
CATMAID. If these don't suit your needs, you can just add your own.
A data view can then configure your new data view type and be used
as a CATMAID front page.

To add a new data view type, you basically need to define two things:

* A Django template that defines the internals of your view type and
* an entry in the ``data_view_type`` table to link data views to it.

In the following both steps will be discussed. Details about how to
use data views can be found in the section :ref:`data-views`.

A new Django template
---------------------

Data view types are written in the
`Django template language <https://docs.djangoproject.com/en/dev/topics/templates/>`_.
To make a new template accessible to CATMAID, put it in the
``django/templates/catmaid`` directory. There reside the templates
for the already available data view types as well. Obviously, it
is good practice to choose a template name that has something to
do with what it does. E.g., the *Project List* data view template is
called ``project_list_data_view.html``.

Data view templates get passed a context in which they live. There
you have access to the variables ``data_view``, ``projects`` and
``config``. With ``data_view`` the template gets access to the
current ``DataView`` model for which it is the data view type. A
list of all projects is available in the ``projects`` variable. If
you have a look at the existing templates you can see that this
list is usually walked (e.g. with a ``for`` tag) to render each
project and its stacks. Also, you need not to deal with the ``sort``
option yourself. This is already dealt with in the Django view.
Therefore, ``projects`` is already sorted when requested. In the
``config`` variable one gets access to the already parsed
configuration for the data view to render. This will keep the
options defined for a data view.

A template can now do whatever it wants with these variables. The
available templates start with these lines::

    {% load data_view_config %}
    {% include "catmaid/common_data_view_header.html" %}

The first thing is to load custom template tags and filters to make
e.g. option handling easier. The file lives in the folder
``django/applications/catmaid/templatetags/`` and you might want to
have a look at it.

Next, another template (``common_data_view_header.html``) is included.
This just prints a simple CATMAID header text.

The available templates then start with option parsing, e.g::

    {% with opt1=config|get_or_none:"opt1"|default_if_none:0 %}
    {% with opt2=config|get_or_none:"opt2"|default_if_none:"center" %}
    ...
    {% endwith %}
    {% endwith %}

There is made use of Django's template filters and a custom one
(``get_or_none``) to get a configuration option or a default.
Let's take the first line as an example: within this ``with``-block
a new variable variable is assigned: ``opt1``. It's value is created
as follows: Use ``config`` (see above) as the input for the ``get_or_none``
filter, parametrized with ``"opt1"``. This filter checks if its
argument (``opt1``) exists in the input dictionary (``config``) and
returns its value if that is the case. If is not found, ``None`` is
returned. This result is then passed to the ``default_if_none`` filter
which in turn is parametrized with the option's default value (``0``
in that case). It checks if the input is none and if, this is the
case, returns the parameter, otherwise the input.

*Note: By default, Django doesn't support the Python keywords None,
True and False in templates. Therefore, you might use 0 as False
and 1 as True.*

Within those ``with``-blocks you can then write your actual presentation
logic. Have a look at the existing templates to get an idea how this could
be done.

A new table entry
-----------------

If your template is ready, you can make it known to CATMAID and
thereby usable by data views. To do so you need to add an entry to the
table ``data_view_type``. This is currently not available from within
the Django admin interface, so you have to do it manually.

A data view type needs basically three things there:

* Name it, give it a ``title``, e.g. "Filtering data view type".
* It needs a so called ``code_type``. This is the template name without file extension, e.g. "filtering_data_view".
* Also, provide a descriptive help text that explains what this view type does, what options it has and maybe provide an example. Put this into the ``comment`` field.

As an example, in the following the entry in the ``data_view_type``
table of the *Project List* data view type is shown:

``title``::

    Project list view

``code_type``::

    project_list_data_view

``comment``::

    A simple adjustable list of all projects and their stacks.
    This view is rendered server side and supports the display
    of sample images. The following options are available:
    "sample_images": [true|false], "sample_stack": ["first"|"last"],
    "sample_slice": [slice number|"first"|"center"|"last"]. By
    default projects are sorted. Use "sort":false to turn this
    off. Thus, a valid sample configuration could look like:
    {"sample_images":true,"sample_stack":"last","sample_slice":"center"}

Having done this, a data view should then be able to use your
data_view_type (also from within Django admin).
