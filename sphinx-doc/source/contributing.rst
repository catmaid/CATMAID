.. _contributing:

Contributing to CATMAID
=======================

CATMAID is open source software and welcomes contributions. This document
provides a brief overview of the structure of CATMAID and guidelines
contributing developers follow to help keep the codebase easy to understand and
easy to extend.

If you are considering contributing a feature to CATMAID, you can get guidance
from other active developers through the `CATMAID mailing list
<https://groups.google.com/forum/#!forum/catmaid>`_ and `GitHub repository
<https://github.com/catmaid/CATMAID>`_. Always check the `list of open issues
<https://github.com/catmaid/CATMAID/issues>`_ as there may be valuable
discussion relevant to your plans.

Before developing any features you should follow the
:doc:`basic installation instructions <installation>` to set up your development
environment.

Architecture Overview
---------------------

CATMAID is a distributed client-server application. The backend HTTP API, hosted
by the server, retrieves and stores information about projects, image stacks,
and annotations. The client frontend, which runs in the browser, provides an
interface and suite of analysis tools which interact with the backend's HTTP
API. The frontend also has its own APIs which allow new tools to be quickly
constructed or expert users to perform novel analysis using the browser console.

The backend is written primarily in Python 3.6 using the Django web framework.
Annotations and metadata about stacks are stored in a PostgreSQL database. Most
endpoints in the backend API expect and return JSON.

The frontend is written primarily in Javascript and makes use of a several
external libraries. Most interfaces are built dynamically through Javascript;
few HTML templates are used.

.. figure:: _static/architecture.svg

A core philosophy of this architecture is to keep the backend API fast and
minimal. The primary purpose of the backend is to mediate the database. Complex
analysis and data processing is performed on the client whenever possible. This
allows large scale collaboration with constrained server resources. Distributing
computation this way also exploits CATMAID's implementation choices, as modern
Javascript VMs are typically much faster than Python.

CATMAID is not an image host. Rather, the CATMAID backend provides resource,
spatial, and semantic metadata about image stacks hosted elsewhere, while the
CATMAID frontend is capable of rendering and navigating these image stacks. More
information about the types of image hosts CATMAID supports is available in the
:doc:`tile source conventions documentation <tile_sources>`.

Project Organization
--------------------

Code you are likely to be interested in is under the ``django`` folder in the
repository root. The sections below outline basic folder, file, and module
structure for the backend and frontend, as well as primers on a few common data
structures.

.. _contributor-backend:

Backend
#######

All of the relevant backend code is in the ``django/applications/catmaid``
folder. Within this folder, ``models.py`` defines the database schema and
logical objects on which the back API operates, while ``urls.py`` maps URI
endpoints in the API to Python methods. Both are useful starting points when
locating particular functionality or determining where to add new functionality.
In case an endpoint changes data, a transaction log entry is added. This way
semantic information can be linked to individual database changes.

Most of the API routes to the ``catmaid.control`` module and folder. Within this
module API functions are organized into logical units like skeleton or
connector, which are grouped into corresponding Python modules. These often
contain utility functions not exposed by the API that may be useful, so when
developing a new API endpoint be sure to check related modules for reusable
utilities.

Back-end errors should always be signaled to the front-end with the help
of Exceptions. Regardless whether an argument is missing, permissions are
lacking or something went wrong otherwise. A dedicated middleware will catch
them and return them in an expected format to the front-end.

..
    TODO: organization of controls/views, urls ("Where to look and where to add")
    TODO: basic overview of schema, esp. understanding how classinstance, etc.
        relates to treenodes, connectors and tags

Frontend
########

If developing frontend functionality, a good strategy is to start by running
scripts in the browser console to quickly prototype and become familiar with
client APIs. The `scripting wiki
<https://github.com/catmaid/CATMAID/wiki/Scripting>`_ provides an introduction
to these APIs and snippets for common scripting tasks.

Javascript source files should be placed in the
``django/applications/catmaid/static/js`` folder. External libraries are located
in the ``django/applications/catmaid/static/libs`` folder, although there is
also a special CATMAID library for shared, stable components. Javascript and CSS
assets from these locations are managed by django-pipeline. When you add a
Javascript file to the ``static/js`` folder and then run::

    ./manage.py collectstatic -l

from the project folder, pipeline detects these assets, compiles and compresses
them (if configured to do so), then passes them to Django to be linked from the
configured static server directory. Assets for this pipeline are configured in
``django/projects/mysite/pipelinefiles.py``. Source files placed in
``static/js`` will be detected automatically, but any external libraries added
to the ``static/libs`` folder must also be added to ``pipelinefiles.py``.

Within the ``static/js`` folder and within the CATMAID frontend there is a
distinction between *tools* and *widgets*. A tool contains a suite of
annotations, interfaces and analyses. A widget, meanwhile, provides a single
specific interface. Most likely you are familiar with a single tool in CATMAID,
the tracing tool, but many widgets within the tracing tool, such as the 3D
viewer, connectivity widget, and selection table.

Widgets are generally prototyped objects that extend ``InstanceRegistry``, which
provides an easy means to track open instances of a particular widget. Rather
than construct their own DOM, most widgets' DOM is built by a corresponding
method in ``WindowMaker``. ``WindowMaker`` binds events from the DOM it
constructs to relevant handlers in the widget object.

..
    TODO: primer on skeletonmodels, skeletonsources, API calls via requestQueue
    TODO: trivial example on how to make a widget: where to put source, checking
        pipelinefiles, using WindowMaker, making it an instance registry, getting info
        about a skeleton, calling an API

Code Style and Conventions
--------------------------

Over the history of its development, CATMAID has accumulated a mixture of many
coding styles. To improve the consistency and clarity of code going forward, as
well as to prevent some common technical pitfalls, the core developers now
follow some simple guidelines for new code. These guidelines are relaxed and
permissive.

If modifying existing code, feel free to imitate the style of the surrounding
code if it conflicts with these guidelines.

Python
######

CATMAID does not currently adhere to a specific Python style convention like
PEP8. However, code should still follow common Python conventions and idioms
including:

* 4 spaces (not tabs) for indentation
* Maximum line length of 79 characters for comments
* Maximum line length of 120 characters for code
* `PEP8 naming conventions <https://www.python.org/dev/peps/pep-0008/#naming-conventions>`_

All new code should include docstrings that follow `PEP257
<https://www.python.org/dev/peps/pep-0257/>`_ and use `Google's argument
formatting
<http://sphinxcontrib-napoleon.readthedocs.org/en/latest/example_google.html>`_.

HTTP API
********

Documentation for endpoints exposed by the HTTP API is available from the
CATMAID server itself via the ``/apis/`` page::

    http://localhost:8000/apis/

... or, for custom configurations::

    http://<catmaid_servername>/<catmaid_subdirectory>/apis/

Functions that are exposed as HTTP API endpoints should declare what HTTP
methods they accept using the :code:`@api_view` decorator. Endpoints' docstrings
should define what parameters they accept and the strucuture of their response
in `Swagger spec
<https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md>`_
using django-rest-swagger's `YAML hooks
<http://django-rest-swagger.readthedocs.org/en/latest/yaml.html>`_:

.. code-block:: python

    @api_view(['GET', 'POST'])
    def api_endpoint(request):
        """Short endpoint description.

        Longer description of the endpoint's purpose, expectations and behavior.

        This endpoint returns an array of objects, so the model of the objects
        in the array must be specified in a separate ``model`` stanza.
        ---
        parameters:
            - name: resource_id
              description: ID of a resource.
              required: true
              type: integer
              paramType: form
        models:
          api_endpoint_inner_type:
            id: api_endpoint_inner_type
            properties:
              name:
                description: Name of some example type that this endpoint
                type: string
                required: true
        type:
        - type: array
          items:
            $ref: api_endpoint_inner_type
          required: true
        """
        #...

API URLs should prefer plural resource names and use hyphens rather than
underscores. Non-terminal endpoint paths that represent resources should have a
trailing slash, e.g., ``GET http://localhost/{project_id}/skeletons/``, but not
terminal operations on that resource collection like
``GET http://localhost/{project_id}/skeletons/review-status``.

Parameters that are not resource identifiers should be passed as
query or form parameters, not in the URL path. If an endpoint accepts an array
of parameters, it should support receiving the array encoded as JSON; form
array parameters may be accepted, but a JSON array in a single form parameter
must be accepted for ease of use.

Prefer descriptive, consistent names for parameters. For example, an endpoint
receiving a list of skeleton identifiers should prefer a parameter named
``skeleton_ids`` over ``skids`` or ``ids``; a few bytes in the header are not
going to have a performance impact relative to the packaging of HTTP and
transport, much less when HTTP/2 and modern compression-aware browsers are
involved. However, abbreviated property names or array-packed values are
acceptable for the responses of performance-critical endpoints.

Date and time response values should be in UTC and formatted as ISO 8601.

Endpoints containing write operations should be decorated with a ``record_view``
decorator in ``urls.py``, which expects a label as argument. This label should
follow the pattern ``resource.action`` and just like URI itself, the
``resource`` is expected to be in its plural form. Make sure to follow this
convention for new endpoints.

Javascript
##########

New code in CATMAID is styled similar to the `Google Javascript style guide
<https://google-styleguide.googlecode.com/svn/trunk/javascriptguide.xml>`_, with
notable exceptions that:

* CATMAID does not use any Google libraries
* CATMAID does not use any requirements/dependency libraries
* CATMAID uses CamelCase namespace naming

New javascript files should place all code inside an `IIFE
<http://en.wikipedia.org/wiki/Immediately-invoked_function_expression>`_ to
namespace it inside the ``CATMAID`` object and use `ES5 strict mode
<https://developer.mozilla.org/en-
US/docs/Web/JavaScript/Reference/Strict_mode>`_:

.. code-block:: javascript
    :emphasize-lines: 1,3,13

    (function (CATMAID) {

      "use strict";

      var variableNotExposedOutsideFile;

      var ClassExposedOutsideFile = function () {
        //...
      };

      CATMAID.ClassExposedOutsideFile = ClassExposedOutsideFile;

    })(CATMAID);

This prevents unintentional leaking of variables into the global scope and
possible naming conflicts with other libraries.

CATMAID makes full use of ES5 language features and allows the following ES6
features:

* `Promises <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise>`_
* `Maps <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map>`_
  and `Sets <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set>`_
  (IE11-supported ``get``, ``has``, ``set``, ``delete`` and ``forEach`` only)
* ``const`` and ``let`` declarations (in strict mode contexts only)

All features must work correctly in recent versions of Chrome and Firefox, while
core browsing features must work in IE11. Requiring polyfills for IE is
acceptable.

Git
###

Try to follow the `seven rules of great git commit messages
<http://chris.beams.io/posts/git-commit/#seven-rules>`_:

#. Separate subject from body with a blank line
#. Limit the subject line to 50 characters
#. Capitalize the subject line
#. Do not end the subject line with a period
#. Use the imperative mood in the subject line
#. Wrap the body at 72 characters
#. Use the body to explain what and why vs. how

That said, always prefer clarity over dogma. The core CATMAID contributors break
#2 frequently to keep messages descriptive (apologies to our VAX users). If a
commit focuses on a particular component or widget, prefix the commit message
with its name, such as "Selection table:" or "SVG overlay:".

Granular commits are preferred. Squashes and rollups are avoided, and rebasing
branches then fast-forwarding is preferred over merge commits when merging,
except for large feature branches.

Development occurs on the ``dev`` branch, which is merged to ``master`` when a
release is made. It is usually best to develop new features by branching from
``dev``, although critical fixes or extensions to particular releases can be
based on ``master`` or the appropriate release tag.

Never rewrite history of ``master``, ``dev``, or any other branch used by
others.

Linting and Testing
-------------------

As part of the `continuous integration build <https://travis-
ci.org/catmaid/CATMAID/branches>`_, several automated processes are performed
to help verify the correctness and quality of CATMAID:

* :doc:`Unit and integration tests for Django backend <djangounittest>`
* Linting (static analysis) of the javascript code with JSHint
* Linting of CSS with csslint
* Unit tests of javascript code with QUnit

If you `enable Travis-CI for your fork of CATMAID on GitHub <http://docs.travis-
ci.com/user/getting-started/#Step-two%3A-Activate-GitHub-Webhook>`_, Travis will
run all of these checks automatically. However, Travis builds take a long time,
and you may want feedback before committing and pushing changes. Luckily all of
these checks are easy to run locally.

Django tests are run through Django's admin commands::

        cd /<path_to_catmaid_install>/django/projects
        ./manage.py test catmaid.tests

JSHint can be `installed from NPM or your platform's package manager
<http://jshint.com/install/>`_ and should use CATMAID's config settings::

    cd /<path_to_catmaid_install>
    jshint --config=.travis.jshintrc --exclude-path=.travis.jshintignore django/applications

If you do not want to configure your own JSHint settings, you can set these as
defaults::

    ln -s .travis.jshintrc .jshintrc
    ln -s .travis.jshintignore .jshintignore
    jshint django/applications

CSS linting is performed by running `csslint` from the static CSS directory::

    cd django/applications/catmaid/static/css
    csslint .

QUnit tests can be run from the browser while your Django server is running. For
example, with the default configuration this would be::

    http://localhost:8000/tests

... or, for custom configurations::

    http://<catmaid_servername>/<catmaid_subdirectory>/tests

Alternatively, the front-end tests can be run in a terminal (as it is done in
our CI setup). To do so, first a few dependencies have to be installed and then
`karma` is used to execute the tests from the CATMAID root directory::

    cd /<path_to_catmaid_install>
    npm install --only=dev
    karma start karma.conf.js

Documentation
-------------

In addition to the backend, HTTP API, and frontend documentation mentioned
above, CATMAID provides a general documentation manual for users,
administrators, and developers (including this page) and in-client
documentation for keyboard shortcuts and widget help.

General Documentation
#####################

General documentation is part of the CATMAID repository under the ``sphinx-doc``
folder. This documentation is written in `Sphinx <http://www.sphinx-doc.org/>`_
ReStructured Text. Documentation from commits pushed to the official CATMAID
repository are built by `Read the Docs <https://readthedocs.org/>`_ and hosted
at `catmaid.org <http://catmaid.org>`_.

To build the general documentation from within your pip virtualenv, run::

    cd sphinx-doc
    make html

The built documentation is now in ``sphinx-doc/build/html/index.html``.

In-Client Documentation
#######################

Documentation is provided from within the web client through tool-scoped mouse
and keyboard shortcut documentation (accessed by pressing :kbd:`F1`) and
per-widget help accessible through the question mark icon in the title bar of
some widgets.

If you find that widget help documentation is missing, incomplete, confusing,
or incorrect, you can contribute better documentation by
`creating an issue on GitHub <https://github.com/catmaid/CATMAID/issues/new>`_
or editing the ``helpText`` property of the widget and creating a pull request.

Other Policies
--------------

Security
########

The disclosure policy of the CATMAID developers for vulnerabilities is that
arbitrary SQL execution by anonymous users or users with "browse" permissions
must be notified to the mailing list simultaneous with patch publication.
Vulnerabilities only exploitable by users with "annotate" permissions will
be noted in the release changelog but will not be sent to the mailing list.
