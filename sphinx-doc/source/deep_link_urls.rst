Deep Link URL Format
====================

CATMAID supports deep link URLs that allow users to share persistent references
to particular stack locations and views. These URLs also support opening tools,
multiple stack viewers, and limited specialized behaviors such as activating
nodes in the tracing tool. Which stack mirror is used for a referenced stack is
up to the client instance.

CATMAID deep link URLs are standard HTTP URLs with query strings, for example:

   ``https://localhost/cat/?pid=1&zp=0&yp=0&xp=0&tool=navigator``

All URLs begin with the protocol, hostname and path (including trailing slash)
of the CATMAID instance :ref:`configured during installation
<basic-installation>`.

Required Query Parameters
-------------------------

``pid`` (integer)
    ID of the project to open.

``zp`` (integer)

``yp`` (integer)

``xp`` (integer)
    Coordinates in project space (nm) to center in the stack viewer.

``tool`` (string)
    Name of the tool to open. Must be one of ``navigator``, ``tracingtool``,
    or ``classification_editor``.

Optional Query Parameters
-------------------------

``active_node_id`` (integer)
    Specifies the ID of a node to activate in the tracing tool.

``sid<n>`` (integer)
    Opens the stack with this ID in a stack viewer. Multiple stacks can be
    opened by passing incremental indexes, i.e., ``sid0``, ``sid1``, etc.
    The index must start at 0.

``s<n>`` (integer)
    Zoom level for the corresponding stack ID above. That is, ``s0`` specifies
    the initial zoom level for the stack viewer viewing the stack ID passed in
    ``sid0``.

``composite`` (integer)
    If ``1``, load all stacks as layers in a single stack viewer rather than
    separate stack viewers.

``sg`` (integer)
    Open a stack group. If present, individual stacks are ignored.

``sgs`` (integer)
    Initial zoom level for a loaded stack group.

``current_dataview`` (integer)
    ID of a data view to switch to.

Legacy Query Parameters
-----------------------

These parameters may be found in old URLs but are no longer generated and may
not be properly processed.

``x`` (integer)

``y`` (integer)

``z`` (integer)
    Coordinates in project space to center the stack viewer. Used in an
    obsolete query format where no project or stack ID were specified and
    defaulted to ``1``.

``s`` (integer)
    Zoom level for the stack viewer.

``active_skeleton_id`` (integer)
    Specifies the ID of a skeleton to activate in the tracing tool.

``account`` (string)
    Username with which to login to CATMAID.

``password`` (string)
    Password with which to login to CATMAID.
