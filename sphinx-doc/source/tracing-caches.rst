.. _tracing-caches:

Tracing data caching
====================

For setups with a large amount of tracing data it can be helpful to setup
intersection caching, especially for larger fields of view (FOV). Such caches
store precomputed results to spatial queries for the respective container. There
currently two types of node caches (as they are called) available:
``node-query-cache`` and ``node-query-grid-cache``. The former stores
intersection results for whole sections and the latter one allows to specify a
regular grid for which results will be precomputed. They are generally populated
using the Django management command ``catmaid_update_cache_tables``. It allows
to specify the type of cache using the ``--cache`` option, which can be
``section`` or ``grid``.

Caches can be automatically updated on data changes as long as the variable
``SPATIAL_UPDATE_NOTIFICATIONS`` is set to ``True`` (disabled by default). If
caches are not used on a CATMAID instance with a large amount of tracing data,
it might make sense to disable this setting to improve the speed of operations
like skeleton joins.

Both cache types support level of detail (LOD) configurations. This allows to
access cached data in terms of a set of an ordered set of buckets. Being able to
access only a part of all caches consistently, allows for quicker browsing of
larger data sets and maintaining more detail on lower zoom levels.

All caches can store the data in either simple *JSON text*, as *JSON database
object* or a binary *msgpack* representation. The ``msgpack`` version seems to
be the fastest in most situations.

Node Query Cache
----------------

For a given orientation this cache stores the intersections with a full section,
i.e. all nodes intersecting the plane at a given depth (Z for XY, etc.). To
enable this cache for look-up, add a section like this to your
``NODE_PROVIDERS`` array in the ``settings.py`` file::

  ('cached_msgpack', {
        'enabled': True,
        'orientation': 'xy',
        'step': 40
  }),

This will make the back-end look for a msgpack format section cache. If nothing
is found, the next available node provider will be checked. Besides
``cached_msgpack`` there is also ``cached_json`` and ``cached_json_text``. The
regular node provider options like ``min_x``, ``max_z``, etc. are supported as
well. Also this entry indicates the cache is only defined for the XY orientation
and assumes a section thickness of ``40 nm``. These values are also used as
defaults for the refresh of the cache.

This cache is fast for large field of views that cover most of a section or has
to be limited clearly for limit the node count. Otherwise it can cause too many
nodes to be loaded.

To populate the cache, the ``catmaid_update_cache_tables`` command can be used
for instance like this::

  ./manage.py catmaid_update_cache_tables --type msgpack --orientation xy \
      --step 40 --node-limit 0 --min-z 80000 --max-z 8400 --noclean \
      --n-largest-skeletons-limit 1000

This will ask interactively for the project you want to the create the cache
for. With this done a whole section query for each Z in XY orientation is
created. The distance between to sections is set to be ``40 nm``. Also, only a
range of Z values is computed, which is sometimes useful for testing different
configurations. The ``--noclean`` option ensures CATMAID isn't removing existing
cached data. Additionally, only the 1000 largest skeletons are displayed.

There are more options available, which can be read on using::

  ./manage.py catmaid_update_cache_tables --help

Node Query Grid Cache
---------------------

The ``grid`` cache option for the ``catmaid_update_cache_tables`` populates a
grid made out of cells, each with the same height, width and depth. For each of
these cells a separate spatial query is cached, which also allows independent
updates. In its simplest form, the cache can be enabled for lookup by adding an
entry like the following to the ``NODE_PROVIDERS`` array in ``settings.py``::

  ('cached_msgpack_grid', {
        'enabled': True,
        'orientation': 'xy',
  }),

This will make node queries look for grid caches for the XY orientation. Like
with the section cache, there are options like ``min_x``, ``max_x``, etc. can be
used to limit for which volume the cache should be defined.

To create this cache, the ``catmaid_update_cache_tables`` management command can
be used like this::

  ./manage.py catmaid_update_cache_tables --project=1 --cache grid \
      --type msgpack --cell-width 20000 --cell-height 20000 --cell-depth 40

As a result a uniform msgpack encoded grid cache with cells with the dimensions
20um x 20um x 40 nm (w x h x d).

The optional settings parameter ``DEFAULT_CACHE_GRID_CELL_WIDTH``,
``DEFAULT_CACHE_GRID_CELL_HEIGHT`` and ``DEFAULT_CACHE_GRID_CELL_DEPTH`` allow
to define defaults for the above management command.

Updating caches
---------------

Functionality to update cells automatically is available as well. CATMAID uses
Postgres' ``NOTIFY``/``LISTEN`` feature, which allows for asynchronous event
following the *pubsub* model. To lower the impact on regular tracing operations
(especially joining), an insert/update/delete trigger for treenode and connector
will execute a conditional trigger function, which is set on CATMAID startup.

These events ("catmaid.spatial-update" and "catmaid.dirty-cache") are disabled by
default, because they add slightly to the query time, even if not used. To
enable these database events and allow automatic cache updates, set the
``settings.py`` variable `SPATIAL_UPDATE_NOTIFICATIONS = True`. Once enabled,
these events can be consumed by third party clients as well.

Cache updates work by running two additional worker processes in the form of
management commands: `catmaid_spatial_update_worker` and
`catmaid_cache_update_worker`. The former is responsible for listening to the
"catmaid.spatial-update" Postgres event and adds entries to the table
`dirty_node_grid_cache_cell` for each intersected cache cell in an enabled grid
cache. Upon inserts and updates this table issues the "catmaid-dirty" cache
event, which the second management command will listen to. It's its
responsibility to update the respective cache cells and remove entries from the
dirty table. If single worker processes aren't enough, more workers need to be
started.

When treenodes are created, moved or deleted the database emits the event
"catmaid.spatial-update" along with the start and end node coordinates. The same
happens with changed connectors and connector links. Other processes can use
this to asynchronously react to those events without writing to another table or
blocking trigger processing in other ways.

Alternatively, it is possible to monitor the ``catmaid_transaction_info`` table
and see which entries caused spatial changes and recompute selectively.

Level of detail
---------------

The node query result for either a whole section or a single grid cell is not
stores as a single big entry in the cache. Instead it is stored in level of
detail (LOD) buckets, each one only allowing a maximum amount of nodes except
for the last one, which takes all remaining nodes. This allows requests that
make use of this cache declare they are only interested in e.g. 5 nodes per grid
cell. With small enough grid size dimensions this allows for a uniform control
of reasonable node distributions for each zoom level in the front-end.

To configure LOD relevant parameters during cache constructions the options
``--lod-levels``, ``--lod-bucket-size`` and ``--lod-strategy`` can be used with
the ``catmaid_update_cache_tables`` management command. The options are optional
and have defined defaults.

The first option defines how many LOD levels there should be. By default only one
level is defined, which effectively means there are no levels of detail.

The second option defines how many nodes are allowed in every bucket (except the
last one). The default here is a bucket size of ``500``.

The last option allows to select between the strategies ``linear``,
``quadratic`` and ``exponential``. Each one defines a way how the bucket size of
every bucket will be computed based on the last one. In linear mode, each bucket
has the same size, the one defined with ``--lod-bucket-size``. In quadratic
mode, the first bucket has the passed in size, the following are computed by
multiplying the initial bucket size with ``lod-level ** 2``, i.e. the second
bucket allows for the square of the initial bucket size. This mode is also the
default. In exponential mode, the initial bucket size is multiplied with ``2 **
lod-level``, i.e. buckets grow faster.

To create a usable LOD configuration for a grid cache, the command line could
look like this::

  ./manage.py catmaid_update_cache_tables --project=1 --cache grid \
      --type msgpack --cell-width 20000 --cell-height 20000 --cell-depth 40 \
      --lod-levels 50 --lod-bucket-size 5 --lod-strategy quadratic

This will start with the first level of detail with a bucket of size 5, then 25,
125 and so on up to 12,500 in bucket 50.

The front-end allows to set a "Level of detail" (LOD) value in the tracing layer
settings. By default, this is set to "max", which causes all LOD levels to be
included. Setting this to 1, will include only the first level. The font-end
also allows to map zoom levels to particular LOD levels. This allows flexible
zooming behavior with adaptive display limits using cached data.
