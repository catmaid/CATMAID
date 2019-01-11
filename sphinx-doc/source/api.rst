.. _api:

Using the CATMAID API
=====================

You may want to query data or perform analyses in ways that are not possible
through the CATMAID client. `Scripting the CATMAID client
<https://github.com/catmaid/CATMAID/wiki/Scripting>`_ is sufficient for some
cases, but others require direct access to annotation data, especially
for use in a programming environment like Python or R. For these cases, the
same HTTP API that the CATMAID client uses is exposed to other clients.

API Documentation
-----------------

Documentation for endpoints exposed by the HTTP API is available :ref:`here
online <api-doc>` and from the CATMAID server itself via the ``/apis/`` page::

    http://localhost:8000/apis/

... or, for custom configurations::

    http://<catmaid_servername>/<catmaid_subdirectory>/apis/

The API documentation list groups of related endpoints, like "skeletons",
and specific HTTP methods ("GET", "POST", etc.) and URIs for calling each
endpoint.

.. figure:: _static/screenshots/api-docs.png

Clicking on one of these endpoints opens detailed documentation including
a description of what the endpoint does, what parameters is expects and
accepts, and how the response is structured. The form at the bottom of the
endpoint documentation allows it to be invoked directly using values provided
in the form fields.

.. warning::

   Remember that API documentation forms operate on actual data on the
   CATMAID server. Be careful not to unintentionally destroy or modify data.

.. figure:: _static/screenshots/api-docs-endpoint.png

Changes to the API are documented in the `API changelog
<https://github.com/catmaid/CATMAID/blob/master/API_CHANGELOG.md>`_.

Undocumented API
----------------

Only a subset of the HTTP endpoints exposed by CATMAID are documented. While
the documentation attempts to cover endpoints most likely to be useful for
external analysis, undocumented endpoints can still be accessed if they are
useful.

Undocumented endpoints can be discovered by looking through `urls.py
<https://github.com/catmaid/CATMAID/blob/master/django/applications/catmaid/urls.py>`_
in the CATMAID source. This file routes URI patterns to Python functions, e.g.:

.. code-block:: python

    urlpatterns += patterns('catmaid.control.treenode',
        #...
        (r'^(?P<project_id>\d+)/treenode/delete$', 'delete_treenode'),
    )

routes a URI like ``/{project_id}/treenode/delete`` to Python function
``delete_treenode``, which is in the file
``django/applications/catmaid/control/treenode.py``.
Using an undocumented endpoint requires inspecting the Python function to
see what parameters it expects.

Note that the undocumented API is considered volatile and changes to it are
not included in the API changelog.

.. _api-token:

API Token
---------

The CATMAID API authorizes requests using an API token tied to user
account instead of a username and password. To obtain your API token,
open the CATMAID client in your browser, hover your cursor over your name
(next to the "Logout" link), and click "Get API token".

.. figure:: _static/screenshots/api-token.png

As a security measure, you will be prompted to re-enter your password,
then shown your token string.

To use the API token, set the HTTP ``X-Authorization`` header on all of your
API requests to be "Token", a space, and the token string, e.g.::

    X-Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b

CATMAID uses ``X-Authorization`` rather than ``Authorization`` so that it
does not conflict with server-level HTTP authorization.

.. warning::

    Requests using your token can do anything your account can do, so
    **do not distribute your token or check it into source control.**

Example API Use
---------------

Command line
^^^^^^^^^^^^

The perhaps easiest way to talk to the CATMAID API is to use the ``curl``
command line tool::

    curl --header 'X-Authorization: Token <auth-token>' -X GET '<catmaid-url>'

If the CATMAID instance requires basic HTTP authentication, you can add the ``-u
<user>:<pass>`` parameter to the ``curl`` command. For intance, to get all
currently available node tags in a project with ID ``1`` from the CATMAID
instance hosted at ``https://example.com/catmaid/`` using basic HTTP
authentication with user "myuser" and password "mypass", you can do the
following::

    curl --header 'X-Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b' \
        -u myuser:mypass -X GET 'https://example.com/catmaid/1/labels'

Python
^^^^^^

The lowest-friction way to access the CATMAID API using python is through the ``catpy`` package,
which handles all of the boilerplate, includes a number of tools for working with CATMAID
data, and is just a ``pip install catpy`` away.
For more information, see `the catpy docs<https://catpy.readthedocs.io>`_.

If for some reason you are unable to use ``catpy``,
below is a minimal example of accessing the API of a CATMAID server
running on ``localhost`` using the `Requests Python package
<http://docs.python-requests.org/en/latest/index.html>`_:

.. code-block:: python

    import requests
    from requests.auth import HTTPBasicAuth

    class CatmaidApiTokenAuth(HTTPBasicAuth):
        """Attaches HTTP X-Authorization Token headers to the given Request.
        Optionally, Basic HTTP Authentication can be used in parallel.
        """
        def __init__(self, token, username=None, password=None):
            super(CatmaidApiTokenAuth, self).__init__(username, password)
            self.token = token

        def __call__(self, r):
            r.headers['X-Authorization'] = 'Token {}'.format(self.token)
            if self.username and self.password:
                super(CatmaidApiTokenAuth, self).__call__(r)
            return r

    # Replace these fake values with your own.
    token = "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b"
    project_id = 1
    object_ids = [42]

    label_response = requests.get(
            'https://localhost/{}/labels'.format(project_id),
            auth=CatmaidApiTokenAuth(token))

    annotation_response = requests.post(
            'https://localhost/{}/annotations/query'.format(project_id),
            auth=CatmaidApiTokenAuth(token),
            data={'object_ids': object_ids})

Other API Clients
-----------------

A partial listing of libraries or programs that consume the CATMAID HTTP API:

`catpy <https://catpy.readthedocs.io>`_
   Official python 2.7 and 3.4+ client by `members of the Cardona lab <https://catpy.readthedocs.io/en/latest/authors.html>`_

`RCATMAID <https://github.com/jefferis/rcatmaid>`_
   R bindings for the CATMAID API by
   `Gregory Jefferis <http://www2.mrc-lmb.cam.ac.uk/group-leaders/h-to-m/gregory-jefferis/>`_.

`CATMAID-to-Blender <https://github.com/schlegelp/CATMAID-to-Blender>`_
   A Blender-Plugin to pull data from CATMAID by Philipp Schlegel
