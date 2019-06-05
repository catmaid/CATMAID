.. _extensions:

Creating CATMAID extensions
===========================

In the past, anyone wanting to extend CATMAID for their specific use case
would need to fork the main repository, making it difficult to take advantage
of future improvements to mainline CATMAID, and decreasing utility of the
extension to people who may want to make use of it later. Therefore, we have
designed the extension system to allow third parties to create external modules
which interface with mainline CATMAID without having to change it.

Overview
--------

CATMAID extensions are python modules which work as Django apps. When that
module is made available to the python environment, Django can pick up any database
models, API endpoints, and static files associated with the app, and code in the app
can interact with code in mainline CATMAID. This modular approach allows much greater
interoperability between different versions of CATMAID and the extension.

In the documentation below, we use a fictional extension called ``myextension``.

.. _extension-install:

Installing an Extension
-----------------------

#. Install the app into your python environment, either by using ``pip install`` \
    from PyPI, or cloning the repo and using ``pip`` to install from the local \
    ``setup.py``

#. Run ``python manage.py migrate`` to update the database as necessary. WARNING: \
    it is possible for a migration to irreversibly change or delete data in your \
    existing database.

#. Run ``python manage.py collectstatic`` to pick up static files including \
    stylesheets and frontend widgets.

API endpoints should be available at ``BASE_URL/ext/myextension/...``

*N.B. CATMAID will only recognise extensions it knows about - i.e. those listed in*
*``KNOWN_EXTENSIONS`` in ``CATMAID/django/projects/pipelinefiles.py``. Check this if*
*it doesn't seem to be working.*

Creating an extension
---------------------

To quickstart development, you may find this `cookiecutter <https://github.com/audreyr/cookiecutter>`_
template valuable:
`clbarnes/CATMAID-ext-cookiecutter <https://github.com/clbarnes/CATMAID-ext-cookiecutter>`_. To do
it yourself:

#. Decide on a name! We'll use ``myextension`` here.

#. Make a branch of CATMAID, adding ``"myextension"`` to ``KNOWN_EXTENSIONS`` in \
    ``CATMAID/django/projects/pipelinefiles.py``. Make a pull request for this to be \
    included in mainline CATMAID - until then, just use this branch for testing. This \
    should be the only required change.

#. Create a directory which will hold the module and repository-related cruft (we \
    recommend naming it something obvious like ``CATMAID-myextension``), navigate to it, \
    and then create an empty django app with ``django-admin startapp myextension``

#. Add an appropriate ``README``, ``LICENSE``, ``setup.py``, ``MANIFEST.in`` and so on \
    as laid out in \
    `Django's documentation <https://docs.djangoproject.com/en/1.11/intro/reusable-apps/>`_, \
    in ``CATMAID-myextension``. The manifest and setup files are particularly important.

#. If your extension includes javascript and/or stylesheets, create \
    ``myextension/pipelinefiles.py`` to make Django Pipeline aware of them. See \
    `synapsesuggestor <https://github.com/clbarnes/CATMAID-synapsesuggestor/pipelinefiles.py>`_ \
    and \
    `CATMAID <https://github.com/catmaid/CATMAID/blob/master/django/projects/mysite/pipelinefiles.py>`_ \
    for how they interoperate.

#. Develop away! For testing purposes, you will need to `install <extension-install_>`_ \
    the extension in your CATMAID environment - it's convenient to use ``pip install -e`` \
    to install the module in editable mode and ``python manage.py collectstatic -l``.

Examples
--------

- `CATMAID-synapsesuggestor <https://github.com/clbarnes/CATMAID-synapsesuggestor>`_
- `CATMAID-autoproofreader <https://github.com/pattonw/CATMAID-autoproofreader>'_

Community Standards
-------------------

- See the :doc:`contributing <contributing>` page.
- Don't pick an extension name which may clash with other python modules.
- Don't write any migrations which will change data or database tables in the underlying \
    CATMAID installation.
- Be aware of CATMAID's namespace - don't add dependencies or tables which could cause \
    name collisions.
- As per Django's guidelines, namespace all static files, templates and so on to your \
    app - e.g. static files should be in a directory called \
    ``myextension/static/myextension/<files>``
