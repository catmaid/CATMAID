.. _models:
.. _state:
.. _commands:

Models, State and Commands
==========================


Models
------

To talk to CATMAID's back-end, its :ref:`API <api>` is used. To make this more
convenient and provide extra functionality, some of these APIs are abstracted
into front-end models, which are defined in the JavaScript files in the
``models`` sub-folder of the CATMAID library::

  django/applications/catmaid/static/lib/catmaid/models/

The majority of the common front-end operations can be found in there. A typical
function, like node creation, has a signature like this::

  CATMAID.Neurons.create: function(state, projectId, x, y, z, parentId, radius,
      confidence, useNeuron, neuronName)

All back-end parameters are available plus a state object. This state is
required as a safety measure to not accidentally change data that was already
updated by someone else. The next section goes into more detail about that.

State
-----

In a collaborative environment, clients can never be sure if the information
they see is the most recent one. Therefore, some CATMAID APIs support state
checks to prevent changes by a client that was not aware of changes done by
another client. Such a state is sent along with the request created by our
front-end models and consists of information about the node of interest and its
neighborhood.

To represent the (local) state the client sees the world in, the state
generating functions are used. There is a *node state*,  a *parent state*, an
*edge state* and a *neighborhood state*. The first three are subsets of the last
one. A node state represents a node ID along with an edition time, a parent
state encapsulates this information about a parent of a node. An edge state
includes a parent state and a child state. The neighborhoods state includes
both, plus information about children and links, both again represented by an ID
and an edition time. Then there is also a *no chack state*, which causes the
back-end to disable state checking for a request.

Different actions require different states, below you find a list of stateful
endpoints and what they expect. This list isn't complete yet, some functions
don't support state checks, yet.

=============================== =====================================
Operation                       Required state
=============================== =====================================
Delete node                     Neighborhood state for deleted node
Create node                     Parent state for new node
Insert node                     Edge state
Move node                       Node state
Edit node radius                Node state
Edit node confidence            Node state
Create connector                -
Delete connector                Connector state
Update connector confidence     Connector state
Update connector links          Connector and link state
Create/update/remove annotation Node state
Create/update/remove tag        Node state
Change neuron name              Neuron state
Link connector                  Node and connector state
Unlink connector                Node and connector state
=============================== =====================================


Undo
----

Some of the user user actions are reversible, they can be undone and redone.
Undoing a command is as simple as pressing ``Ctrl + Z``. Alternatively, the
history dialog accessible through the ``F9`` key can be used, where a redo can
be issued as well. Actions that can be undone are listed below and CATMAID wraps
these in so called *commands*. These maintain information about the applied
changes and their inverse. This is a list of currently available commands and
what their inverse operation is:

=============================== =====================================
Operation                       Inverse
=============================== =====================================
Delete node                     Create node
Create node                     Delete node
Insert node                     Delete node
Move node                       Move node back
Edit node radius                Set original radius
Edit node confidence            Set original confidence
Create connector                Delete connector
Delete connector                Create connector and links
Update connector confidence     Set original confidence
Update connector links          Restore original links
Create/update/remove annotation Delete/reset/create annotation
Create/update/remove tag        Delete/reset/create tag
Change neuron name              Set original name
Link connector                  Unklink connector
=============================== =====================================

Commands are typically defined in the same file as the model functions they
wrap.
