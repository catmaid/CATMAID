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

To represent the (local) state the client sees the world in, different state
implementations can be used. The tracing layer, for instance, has its own
implementation and undo/redo utilizes a much sparser representation. States
provide access to nodes, their state information and special serialization
methods. State information on various parts of a local node neighborhood can be
represented in parallel. This allows for flexibility and granular access
control. Information on individual nodes, their parents, children and links can
be stored. Connectors are supported as well.

A complete node *neighborhood state* consists of the *node*, *children*,
*parent* and *links*. A node state represents a node ID along with an edition
time, a parent state encapsulates this information about a parent of a node.
Then there is also a *no chack state*, which causes the back-end to disable
state checking for a request.

Different actions require different states, below you find a list of stateful
endpoints and what they expect. This list isn't complete yet, some functions
don't support state checks, yet.

=============================== =====================================
Operation                       Required state
=============================== =====================================
Delete node                     Neighborhood state for node to node
Create node                     Parent state for node append, else none
Insert node                     Node state and children of edge
Move node                       Node state
Edit node radius                Node state
Edit node confidence            Node state
Create connector                For initial links partner node states, else none
Delete connector                Connector neighborhood state
Update connector confidence     Connector node state
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
history dialog accessible through the ``F9`` key can be used, where redo can
be selected as well. Actions that can be undone are listed below and CATMAID
wraps these in so called *commands*. These maintain information about the
applied changes and their inverse. This is a list of currently available
commands and what their inverse operation is:

=============================== =====================================
Operation                       Inverse
=============================== =====================================
Delete node                     Create node, along with connectors
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
Split skeleton                  *Block undo*
Join skeletons                  *Block undo*
=============================== =====================================

Splitting and joining skeletons results at the moment in undo being blocked for
this point in history. That is, commands executed before splitting or joining,
can't be undone for now.

Commands are typically defined in the same file as the model functions they
wrap.
