## Under development


### Notes

- A virtualenv update is required.

- All \*.pyc files in the folders `django/applications/catmaid/migrations/`,
  `django/applications/performancetests/migrations/` and
  `django/applications/pgcompat/migrations/` need to be deleted.

- Python 3.7 is now supported.

- Heads-up: The next CATMAID version will require Postgres 11 and Python 3.6.

- Should migration 0057 fail due a permission error, the Postgres extension
  "pg_trgm" has to be installed manually into the CATMAID database using a
  Postgres superuser: CREATE EXTENSION pg_trgm;

- CATMAID's version information changes back to a plain `git describe` format.
  This results overall in a simpler setup and makes live easier for some
  third-party front-ends, because the commit counter is included again. The
  version display is now the same `git describe` format for both regular setups
  and Docker containers.

- Tile loading is clamped to (0,0) again, i.e. there are no negative tile
  coordinates anymore by default. If you need them, set the respective stack's
  `metadata` field to `{"clamp": false}`.

- To write to CATMAID through its API using an API token, users need to have
  now dedicated "API write" permission, called "Can annotate project using
  API token" in the admin UI. To restore the previous behavior (regular annotate
  permission allows API write access) the settings.py variable
  `REQUIRE_EXTRA_TOKEN_PERMISSIONS` can be set to `False`. This is done as a
  safety measure to prevent accidental changes through automation.

- If R based NBLAST is used, make sure to execute to update all dependencies:
  `manage.py catmaid_setup_nblast_environment`.

- The main documentation on catmaid.org has now a place for widget specific
  documentation as well. Only a few widgets have been updated yet, but more will
  follow.


### Features and enhancements

Tracing tool:

- Add a new Tracing Tool icon button to compute the distance between two nodes
  on a skeleton. Respects virtual nodes.

- The globally nearest node can now be selected and brought into view using
  Alt + G, as opposed to selecting the nearest node in the current section
  using the G key without modifier.

- Using the H shortcut now without an active skeleton, the most recently edited
  node of the current user (Alt: anyone) in the last active skeleton will be
  selected. Using Shift will look in all skeletons.

- Using Shift + Alt + Click with a connector selected, will will now create a
  presynaptic node. This is consistent with the already existing Shift + Alt +
  Click behavior with a treenode selected, which creates a presynaptic
  connector.

Measurement table:

- Node filters are now supported. Like in other widgets, the respective panel
  can be opened through the funnel icon in the widget title bar. Measurements
  are displayed for all independent fragments of a skeleton after a set of node
  filter rules has been applied.

- With the help of the "Sum fragments" toggle all fragments that result from a
  node filter application can be aggregated into one row by summing individual
  values.

Remote CATMAID instances

- Some tools in CATMAID gained support to communicate with other CATMAID
  instances, e.g. the Landmark Widget (see below). To enable this functionality,
  remote CATMAID instances can now be added to the user settings.

- The Settings Widget contains now a section labeled "Other CATMAID instances".
  It allows to manage a list of other CATMAID servers based on their URL, an API
  key and optional HTTP authentication. This information is stored under an
  alias.

Landmarks:

- Clicking on the name of a landmark group in the Landmarks tab will now open
  the group member edit dialog that was previously accessible by clicking any
  landmark name. Clicking a landmark name will now show a new dialog, which
  allows to specify of which landmark groups the clicked landmark is a member
  of.

- The color of each active display transformation can be established separately
  in the respective table row. Color changes are now also visible in the 3D
  Viewer.

- It is now possible to load skeletons and landmarks from other CATMAID
  instances. Point matches are done on the basis of matching landmark names. To
  enable the UI for this, check the "Source other projects" checkbox in the
  Display tab.

- With the "other projects" UI enabled and a remote CATMAID instance configured
  in the Setting Widget (see above), it is now possible to select a remote
  CATMAID instance from the "Source remote" dropdown menu. Alternatively, the
  local instance can be selected if another project from the same instance
  should be used.

- Next the source project in the selected instance needs to be specified. This
  list is updated when a different remote instance is selected.

- Skeletons from a remote instance are collected through annotations. The
  respective annotation has to be entered in the "Source skeleton annotation".
  With the help of the "Preview" button it is possible to load the matching
  skeletons from their remote CATMAID to inspect if the correct ones are
  selected.

- As a last step for the remote data configuration, the source landmark group
  has to be defined. This list is updated if the source project changes.
  Landmarks from this group are mapped to the selected target group. The
  matching is done by name, i.e. no landmarks can have the same names in a
  group.

- Adding such a transformation adds it to the list at the bottom of the widget,
  just like with regular transformations and they can be used in the same way.
  The can be shown in 3D Viewers, superimposed on the Tracing Layer and used in
  NBLAST queries from the Neuron Similarity Widget (see below).

- The new checkbox 'Multiple mappings' displays additional user interface
  elements to add multiple source and target landmark group mappings for a
  single display transformation. Point matches are created independently for
  each pair and only merged for finding the final transformation.

Neuron Similarity:

- The computation of the default "mean" normalized similarity scores is now
  considerably faster.

- The new "Top N" option allows to store only the Top N best matches in the result
  set. For "mean" normalization, it will also only compute the mean score for
  the top N forward hits (mean is the average between forward and backward
  score). A value of zero disables this cutoff (default). This cutoff can be
  used speed up computation for very large sets of neurons or large point
  clouds.

- The new "Reverse" option allows to rank similar objects by there reverse
  score. That means that the stored score for a particular object pair is target
  versus query rather than query versus target. NBLAST ues the query neuron as
  reference, and thereforoe the reverse option can make a difference as long as
  no "mean" scoring is used.

- It is now possible to use display transformations defined in the Landmark
  Widget that reference another CATMAID server as their data source. They can be
  used both as source and target for NBLAST comparisons. This makes it
  essentially possible to compare skeletons from another CATMAID project,
  possibly on another CATMAID server, to local skeletons using NBLAST.

- Similarity matrices can now include transformed skeletons in their set of
  similar objects. To do so, create a Display Transformation in the Landmark
  Widget that represents the wanted transformation and the select it from the
  "Sim. transformed skeletons" drop down in the Configurations tab of the Neuron
  Similarity Widget when creating a similarity matrix.

- Similarity matrices can now be created with more control over which skeletons
  are looked at as similar. The drop down menu "Similarity mode" allows to
  select different groupings of the input skeletons (and transformed skeletons).
  It is for instance possible to group a neuron and its contralateral partner
  that has been transformed to the side of the first neuron as similar. A
  confirmation dialog presents the computed grouping before actually creating a
  similarity matrix.

Graph widget:

- GraphML files can now be imported, positions and colors are respected. This is
  useful if layouting is done in e.g. Gephi and coloring should be done in
  CATMAID. The help page explains a possible workflow for this.

- The button "Group equally colored" in the "Main" tab will group all skeletons
  with the same color into a single group. The user is asked for group names for
  each color.

3D viewer:

- A new synapse coloring mode has been added: polyadicity. The number of partner
  nodes for each connector is color coded (for synaptic connectors, this is the
  number of postsynapses). The colors and ranges can be configured through the
  "Polyadicity colors" button in the "Shading parameters" tab. This is basically
  a configurable version of an absolute "N with partner" coloring.

- Branches with leaf nodes tagged "not a branch" can now be collapsed using the
  'Collapse "not a branch"' checkbox in the Skeleton Filters tab.

- History animations can now be exported in full length without requiring to
  guess the number of frames for the export. The animation export dialog will
  show an additional checkbox ("Complete history") if a history animation should
  be exported.  If complete history is enabled, CATMAID will export the complete
  history of the exported skeletons.

- Animations can now be exported as stream directly to a file, which allows for
  much larger exports (32GB maximum at the moment).

- Fractional rotations are now allowed in the animation export.

- The default time per rotatio in the animation export is set to 15 seconds now,
  slowing down the default by a factor of 3, which makes it easier to look at.

- Stack Z slices can now be animated. Configurable are the change frequency and
  the change step in terms of sections. This is available for animation exports
  as well.

- Stack Z slices can now be thresholded to replace a background color with
  another color. If enabled and the sum of all channels is in a configurable
  range [a,b] it will be replaced with another color.

- The rotation time for animations can now specified in seconds rather than
  angular distance.

Skeleton history widget:

- A basic view of the change of a set of skeleton IDs over time based on all
  nodes that are part of a given skeleton ID or that have been in the past.

- Skeleton history can also be used with past skeleton IDs to see into what
  skeleton they changed (if any).

- All past and present treenodes with a passed in skeleton ID are tracked
  through the complete history and their path of skeleton ID changes is
  recorded along with the number of treenodes following a given skeleton path.

- The widget shows a graph from origin skeletons to the final skeleton IDs in
  every available path, summing the treenode counts for each contributing path.

- Existing skeletons are colored in yellow, past skeletons are colored in cyan.
  Selected skeletons are colored green.

- Ctrl+Click on skeleton will select it and go to the closest location in it.
  Shift+Click allows selecting multiple skeletons. All selected skeletons are
  available through the Skeleton Source interface.

Node and skeleton filters:

- Filter rules support now an "invert" option during creation, which allows to
  create filters that include everything but whatever is matched by a particular
  filter strategy. This can be useful e.g. during neuron review to only look at
  segments that have been created by people other than oneself or connectivity
  everywhere excluding a particular compartment.

System check widget:

- A subset of important database statistics are now displayed if a user has the
  "can_administer" permission in a project. These statistics include e.g. cache
  hit ratio, temporary files, requested checkpoints and replication lag. For
  most of them a rule of thumb suggestion on how a value should behave is
  provided as well.

Administration:

- A grid based node query cache can now be used to speed up tracing data
  retrieval by precomputing intersection results. This can be useful for larger
  field of views in big data set. It supports multiple levels of detail per grid
  cell and can therefore provide a somewhat uniform sampling when limiting the
  number of displayed nodes. The sorting of this LOD configuration can be
  controlled so that e.g. only the top N largest skeletons will be shown per
  cell with growing LOD. The documentation has more details. This cache can be
  kept up updated using two extra worker processes that listen to database
  changes, implemented as management commands `catmaid_spatial_update_worker`
  and `catmaid_cache_update_worker`.

- The database can now emit notifications on tracing data changes using the
  "catmaid.spatial-update" channel and when grid cache cells get marked dirty
  on the "catmaid.dirty-cacche" channel. These can be subscribed to using
  Postgres' LISTEN command. To enable emitting these events and let cache update
  workers work, set `SPATIAL_UPDATE_NOTIFICATIONS = True` in `settings.py`. This
  is disabled by default, because sending events for spatial cache updates can
  add slightly more time to spatial queries, which will mainly be relevant for
  importing and merging large skeleotons.

- Projects can now be deleted along with the data that reference them (e.g.
  treenodes, ontologies, volumes). To do so select the projects to delete in the
  admin project list and select "Delete selected" from action drop down.

- Users can now be set to an inactive state after a specified amount of time.
  This time is configured for a user group and it applies to users if they are
  members of such a group. A message can optionally be displayed as well as
  users to contact that could potentially help. This is configurable as "Group
  inactivity period" in the admin view. Users to contact for support, can be
  either configured there or from individual user views.

CLI Exporter:

- If both required annotations and exclusion annotations are provided, the
  importer will now only exclude a skeleton if it is not also annotated with a
  sub-annotation of the required annotations set. This behavior can be disabled
  and exclusion can be enforced when a skeleton is annotated with the exclusion
  annotation or one of its sub-annotations. To do so, use the new
  "--exclusion-is-final" switch.

- Volumes can now be exported by using the `--volumes` switch. By default all
  volumes of the exported project will be included. This can be further
  constrained by using `--volume-annotation <annotation-name>` arguments.

- The way she exported objects are specified through the command line interface
  changed. Instead of writing e.g. `--notreenodes` to not import treenodes from
  a source, `--treenodes false` has to be used now. This is the case for
  treenodes, connectors, tags and annotations. The defaults (when the argument
  is not provided) stay the same. To explicitly disable the export of a type
  `false`, `no`, `f`, `n` and `0` can be provided as argument, e.g. `-treenodes
  false` or `--users n`. For a positive parameter use `true`, `yes`, `t`, and
  `1`.

CLI Importer:

- Precompute materializations (edges, connectors) explicitly only for imported
  data, which improves performance in typical scenarios (import is small
  compared to existing data). If the old behavior of recomputing everything in
  the target project should be used in cases where a full data base is imported,
  the --update-project-materializations switch can be used.

- The way she imported objects are specified through the command line interface
  changed. Instead of writing e.g. `--notreenodes` to not import treenodes from
  a source, `--treenodes false` has to be used now. This is the case for
  treenodes, connectors, tags and annotations. The defaults (when the argument
  is not provided) stay the same. To explicitly disable the import of a type
  `false`, `no`, `f`, `n` and `0` can be provided as argument, e.g. `-treenodes
  false` or `--users n`. For a positive parameter use `true`, `yes`, `t`, and
  `1`.

- It is now possible to import volumes from CATMAID export files and other
  projects..

Miscellaneous:

- Tracing layer: a minimum skeleton length can now be specified in the layer
  options, causing the Tracing Layer to show only nodes of skeletons of at least
  this cable length (nm).

- Tracing layer: a minimum number of nodes can now be configured to only show
  skeletons of at certain minimum size (just like the existing minimum cable
  length constraint). This is configurable through the layer configuration,
  accessible by clicking the blue/white box in the lower left corner of stack
  viewers.

- Settings widget: visibility group conditions can now be inverted.

- Confirming a radius selection (Shift + Y) can now also be done using the Enter
  key.

- Neuron name searches and annotations should be much faster on larger
  instances.

- Basic support for touch screens (e.g. phones and tablets) is now implemented.

- CATMAID can now export files (e.g. CSVs, videos, etc.) of much larger size
  than before, if "Save exported files in streaming mode" is enabled in the
  Settings Widget. To make this work, the browser settings (chrome://settings)
  "Ask where to save each file before downloading" has to be enabled.

- Context aware help: by clicking the new question mark icon in the upper right
  corner, a context aware help dialog can be displayed on top of all other
  CATMAID tools. It provides some general guidance for the intended workflow
  with individual tools. This can be enable to be displayed by default as part
  of the Settings Widget. The display of this can also be enabled in a link to a
  view by appending `&help=true`. This will be added automatically if a help
  dialog is open during URL creation.

- Connectivity widget: the new "List links' button will open a Connector List
  with all links of the selected neurons.

- Selection table: the new checkbox "Link visibility" allows to change the
  behavior of the visibility checkboxes. So far the pre/post/text/meta
  select-all controls were only affecting the respective visibility options of
  visible/selected skeletons (default). With unlinked visibility
  pre/post/text/meta can also be controlled for all neurons, regardless of their
  visibility. This allows e.g. to only show synapses, but no skeletons.

- General search widget: a more flexible table is now used for display, which
  allows sorting, filtering and pagination.

- Neuron dendrogram: select currently active node by default when loading the
  dendrogram for the active skeleton.

- The right end of the status bar contains now a button to toggle the visibility
  of the top toolbars.

- Updating the copy of client side annotations will only request new data if
  there are actually new annotations. This makes loading of e.g. the Neuron
  Search widget faster.

- Boss databases can now be used as tile source type so that image data is
  loaded from them. More details: https://docs.theboss.io/docs/image.

- Docker: HTTP basic authentication can be configured by using the environment
  variables HTTP_AUTH_ENABLED, HTTP_AUTH_USER and HTTP_AUTH_PASS in the web
  container of the `docker-compose.yml` file (an example is given).

- Performance: selecting the closest node in a skeleton should now be faster.

### Bug fixes

- A race condition has been fixed that could in rare cases lead to inconsistent
  skeleton IDs in a skeleton that is merge into different skeletons by different
  requests.

- Landmark transformations: fix Moving Least Square transformations for skeleton
  fragments outside of source group bounding box.

- The Connectivity Graph Plot draws now individual bars in each sub-plot
  side-by-side and uses the same neuron names as other widgets (from CATMAID's
  neuron name service).

- Information based on historic information like the history animation in the 3D
  Viewer and the Neuron History widget includes merge information now correctly.
  Before, merge nodes were represented twice in a time slice that included the
  merge.

- The default connector type is now properly persisted as a setting.

- Neuron search: no duplicate entries are shown anymore, which could result e.g.
  when sub-annotations where allowed.

- Neuron similarity: when showing result skeletons in 3D, skeletons are now
  appended to the Selection Table of a 3D Viewer, rather than the 3D Viewer
  directly.

- Connecitivity widget: the auto-connectivity CSV will now use formatted neuron
  names as column and row headers.

- Graph widget: ungrouping of one-element groups is now allowed.

- Graph widget: merging of grouped skeletons is now handled properly.

- 3D viewer: the depth test for connector partner spheres is now performed
  correctly and spheres should be rendered in the correct Z order.

- 3D viewer: mouse controls now work correctly in fullscreen mode.

- 3D viewer: the suggested width and height of the animation export are now by
  default a factor of two. This is required by the WebM encoder. Off values are
  reduce by one.

- 3D viewer: spatial select works now also without the active node highlighted.

- 3D viewer: no error is shown any more when attempting to move while in radius
  edit mode.

- 3D viewer: landmark transformed skeletons show now also radius spheres.

- Connector table: the section and tag columns are now part of the CSV export.

- Tracing tool: unneeded node updates are removed from initial tracing layer
  loading.

- Selection table: don't try to load missing skeletons from JSON file.

- Settings widget: default values for tracing layer skeleton limits can now be
  configured under Tracing Overlay > Tracing layer skeleton filters.

- The numpad delete key is now recognized as regular delete (if numlock is off).

- SWC neuron import: providing a neuron ID for an import works again and will
  now also set an optionally provided neuron name. Additionally, it is now
  required that a user importing skeleton data for an existing neuron ID has
  the rights to edit the skeleton instance as well as all its treenodes.

- Volume widget: volumes/meshes with annotation can now be removed properly.

- Volume widget: editing a volume by double clicking its table entry works
  again.

- Neuron dendrogram: correctly reload skeleton if it changes as a result of a
  split or merge. If a dendrogram node is selected, the respective skeleton will
  be reloaded after a split, even if its ID changed.

- The Notification Table can be opened again without errors.

- Exporter: connector links are now exported properly if the parameter
  --original-placeholder-context is used.

- Docker: the docker-compose setup now uses Postgis 2.5 internally and therefore
  allows upgrades from Postgres versions < 10 with Postgis 2.4.

- Docker: stale Postgres PID files will now be removed during a database upgrade
  in a docker-compose setup. PID files without actually running database
  processes prevented some updates before.

- Initial setup: create_configuration.py now also prints the media files
  directory as part of the webserver example configuration. This is the folder
  where e.g. some exported files are made available.


## 2018.11.09

Contributors: Andrew Champion, Chris Barnes, Tom Kazimiers, William Patton, Eric Trautman


# Notes

- Python 3 is now required for the back-end. We recommend the use of Python 3.6.

- CATMAID's version information is now presented in a different form. It follows
  the pattern `<base-version>[-dev]-<commit>`. The `<base-version>` is baked
  into the source code on a release. The `-dev` part will only be present if
  CATMAID's `dev` branch is used for deployment. It won't be present for
  `master` branch based setups. The `<commit>` part is the 10 digit version of
  the Git commit ID. This version representation is now also consistent with
  what is display in Docker images. In the rare event that no commit information
  can be found, `<commit>` will fallback to "unknown". This version will now
  also logged during start-up of the back-end.

### Features and enhancements

Connectivity matrix:

- The new checkbox labeled "Fractions" in the "Main" tab makes it now possible
  to display connector fraction instead of an absolute link number in each cell.
  The number of connections from one source row to a target column is divided by
  the number of total posynaptic connections that are made to the target
  skeleton (column). This makes columns better comparable to each other.

- The auto-connectivity matrix of a large set of skeletons can now be exported
  as CSV without displaying it using the "Auto-connectivity CSV" button. This
  makes it possible to export larger connectivity matrices in a usable format.

- The aggregation method for the connectivity count in groups can now be
  selected. Available are: sum (default), min, max and average.

3D viewer:

- Treenodes that are linked to connector nodes can now be scaled independently
  from other node handles using the "Link node scaling" option.

- Volume picking is now optional and disabled by default, i.e Shift + Click will
  go through volumes. To enable volume surface location selection, the
  "Pickable" checkbox needs to be checked.

- If Reconstruction Sampler domain shading or interval shading is used, a list
  of valid domains and intervals can now be specified in the "Shadings
  parameter" tab.

- The X/Y/Z rainbow coloring modes are now also available normalized to each
  individual skeleton.

- Add custom connector coloring. The pre and post colors can be adjusted in the
  "Shading parameters" tab.

- The X/Y/Z/ axes can now be displayed in the lower right corner using the
  "Axes" checkbox in the "View settings" tab.

Reconstruction sampler:

- Improve performance of interval length computation

- Sampled skeletons can now be split after the users confirm this is their
  intention. The split-off part of the skeleton will not contain any sampler
  information anymore. Intervals on the split-off part are removed, split-point
  crossing intervals are shortened and domain end points will be removed and
  recreated as needed.

- Sampled skeletons can now be merged into. All samplers that reference the
  merged-in fragment are deleted. If the merged fragment is merged outside
  of a domain, nothing special is happening---it is a regular merge. If the
  merge treenode is in a sampler domain, there are currently three options,
  "Branch", "Domain end" and "New domain": 1. Branch: add the new fragment to the
  skeleton without changing domain end nodes or intervals. This is only allowed
  if the merge target is not the start or end of an interval. 2. Domain end: add
  a new domain end node right where the merged in fragment starts. This keeps
  the new fragment isolated from the sampled domain. 3. New domain: a new
  domain is created for the merged in fragment. This also adds the domain end
  node from (2).

- Domain completion is now shown in percent along with interval coverage of the
  domain in "Interval" step.

- Merge decisions can now be limited when the 'merge' or 'merge-or-create' leaf
  handling mode is selected. This means a percentage can be specified which
  defined below which ratio of extra cable versus interval length the extra
  cable should be merged into the previous interval (if possible) rather than a
  new interval is created.

- Ignored lead segments can now be inspected in more detail using the
  "Uncovered domain parts" button the "Interval" step. This will open a dialog
  window with a histogram on all ignored leaf segments in the current domain.
  Clicking on individual bins will open a treenode table containing the
  respective start nodes of the ignored leaf segments. From this dialog, it is
  also possible to list all downstream/upstream partners linked to nodes in
  ignored segments of a domain.

- For samplers using the 'ignore' leaf handing mode, it is now possible to
  update this to 'short-interval' mode including the generation of missing
  intervals for existing domains. A visual confirmation dialog is shown. To use
  this, press the "Set short-interval leaf mode" button in the Domain tab.

- The Synapse tab now also shows all leaf nodes of an interval. This makes it
  easier to find the places where an interval needs to be continued.

Tracing layer:

- Tracign layer: cycle open end in reverse using Shift + Alt + R.

- Alt + Click now opens consistently the link type context menu, regardless of
  whether a treenode or connector node is currently selected.

- The layer options now allow to select a user who's tracing data won't be
  fetched from the server. The main motivation is to hide data imported by a
  dedicated import user by default and not even fetch it from the server.

- Similar to image data mirrors, it is now possible to configure read-only
  tracing data mirror servers from which the tracing data will load all data
  except for the active node, which will be read from the main server. This is
  particularly useful if connecting to the main server from a remote location.
  To make this work reliably, it is expected that physical replication is setup
  on the database level that mirrors the main server constantly. A separate
  CATMAID instance needs to be setup on the mirror server as well. To configure
  this, the "Read-only CATMAID mirrors" option in the settings widget can be
  used together with the "Read-only mirror index".

Neuron similarity:

- The new Neuron Similarity Widget makes it possible to compare neurons to each
  other, to neurons transformed based on landmarks as well as to arbitrary point
  clouds. Point clouds can for instance be created from light microscopy data.
  It creates a similarity ranking based on NBLAST. To open the widget, use Ctrl
  + Space or the Open Widget button and then search for "Neuron similarity".

- To compare two different objects, NBLAST will compare a query object pairwise
  with potential target objects. It iterates over each point of the query
  object, find the closest point in a target object and computes a score based
  on the distance of these points and their orientation to each other.

- This scoring is done based on a scoring matrix, which needs to be created
  before any comparisons can be made. Scoring matrices are typically reused and
  don't need to be recomputed every time. The "Configurations" tab allows to
  create new similarity matrices and lists existing ones. For a new scoring
  matrix, probabilities for distance and orientation are computed for both a set
  of of similar neurons and a representative sample of random neurons. Both are
  combined into a single matrix in which a value of zero makes a particular a
  pair of points equally likely to be random or to be a match. Values above zero
  make a match more likely. Computed similarity matrices can be visualized by
  clicking the "View" link in the Scoring column of the respective similarity
  configuration.

- With a similarity matrix computed, similarity queries ca be performed from the
  "Neuron similarity" tab. In its most basic form, this compares neurons to
  other neurons. It is also possible to select transformed neurons and point
  clouds as query type or target type in a search. This however requires
  additional setup (see below). Query and target skeletons can be selected by
  selecting a skeleton source for each. A similarity matrix has to be selected
  as well, but all other options have reasonable defaults. A click on "Compute
  similarity" queues a new similarity request, which is computed asynchronously.
  Once the task is complete its table entry will switch its status to
  "complete".

- Once completed, the similarity query results can be viewed by clicking on
  "View" in the "Scoring" column. This will open a new result window (or
  dialog, if selected in the "View" option), which shows the similarity ranking.

- To query with or against transformed skeletons, a landamark based "display
  transformation" has to be created. To do so, open the Landmark Widget, and
  create a transformation in its "Display" tab. Transformations created this way
  are selectable from the Similarity Widget, if "transformed skeletons" is
  selected for either query or target. Depending on available landmark groups,
  this could be for instance a skeleton transformation to its contralateral
  location.

- The Point cloud tab allows to import individual point clouds, along with an
  optional transformation and representative images. It also provides a list of
  all point clouds that are visible to the current user. A group visibility
  option during import allows to restrict visibility of imported point clouds to
  selected groups (which need to be added from the admin interface).

- The "Point cloud import" tab allows to import many point clouds at the same
  time, optionally transformed and with linked representative images.

Volumes:

- The general widget controls are now distributed across tabs.

- Annotations can now be used on volumes too. The "Annotate" button in the
  Volume Manager can be used to annotate all selected volumes.

- The "Add from file" button in the Volume Manager can now be used to import
  volumes from STL files.

- The "Skeleton innervations" tab allows to search for volumes that intersect
  with a set of query skeletons. A volume annotation can be specified to look
  only at volumes having this annotation. Optionally, exact result computation
  can be disabled to only compute skeleton/bounding-box intersections. This is
  slightly faster, but leads to false positives.

Docker:

- More CATMAID configuration options are now accessible through Docker
  environment cariables: CM_DEBUG, CM_FORCE_CONFIG_UPDATE, CM_WRITABLE_PATH,
  CM_NODE_LIMIT, CM_NODE_PROVIDERS, CM_SUBDIRECTORY, CM_CSRF_TRUSTED_ORIGINS.

- The Git commit from which a Docker image was built is now preserved and
  included in the CATMAID's version information.

CLI importer:

- If no user information except for IDs is present in the imported data, the
  importer will by default ask for a username and create new inactive users for
  those IDs (and update the referenced IDs). Alternatively, the --map-user-ids
  parameter can be specified, which will make the importer map referenced IDs to
  existing users. If an existing user with the respective ID is not available,
  the user is asked for a username and a new user will be created.

- With the help of a few additional progress bars, import progress can be better
  monitored.

- Database statistics are now automatically recomputed after an import, i.e.
  ANALYZE is run.

Miscellaneous:

- Each Tracing Layer is now listed as a skeleton source. All skeletons visible
  in their fields of view are made available to other widgets that way.

- Tracing tool: add icon button to toggle a node coloring mode in which each
  node is colored according to the length of their respective skeleton. The
  colors and cable length values when to use it can be set for three colors in
  the Settings Widget in the "Skeleton length coloring" section.

- The SWC exporter can now optionally mark a node as soma if it either is tagged
  as "soma", if it has a radius larger than a defined value or if it is the root
  node. All three conditions can be selected, and they will be applied in the
  order they are listed above. If selected, a soma tagged node will always take
  precedence.

- There is small copy-to-clipboard button left to the "URL to the view" link in
  the upper right corner of the user interface.

- The Ctrl modifier can now be used with - and + to animate zooming.

- New widget: stack info, which displays properties for stacks related to the
  active project.

- The node cache update management command `catmaid_update_cache_tables` can now
  update all caches configured in the NODE_PROVIDERS settings variable
  automatically when the `--from-config` option is provided.

- Admin: a projects/export JSON export of the visible project/stack structure
  can now be used directly in the Project/stack Importer by selection "JSON
  representation" as source and pasting the data into the text field.

- Neuron search: regular expressions are now optional for the neuron name.
  Unless the search string starts with '/', no regular expressions are used,
  but a regular case insensitive text search.

- Two new connector types are available: "tight junction" and "desmosome". Both
  can be created through the Alt + Click menu, are reciprocal and two links at
  one connector are allowed for each type.

- Connectivity widget: all available link types can no be selected to be
  displayed. Both the gapjunction and attachment checkboxes have been removed in
  favor of a more generic list select element.

- Tracing layer: the displayed tracing data can now be constrained to show only
  the N most recently edited skeletons. This settings adds to the skeletons
  selected by the N largest skeletons filter.

- Many tables should now allow for larger CSV exports.

- Connector table: the exported CSV file has now a more reasonable name and
  doesn't include all skeleton IDs anymore (this became impractical with larger
  sets).

- WebGL layers are now preferred by default.

- Project statistics: a top ten of the largest neurons is now displayed.

- Admin: a user import view is now available to import users from other CATMAID
  instances. It requires superuser permissions on the remote instance.

- DB integrity check management command: volumes are now checked to make sure
  all faces are triangles. The --tracing [true|false] and --volumes [true|false]
  command line parameters now allow to explicitly test only some parts of the
  database. By default all is tested.


### Bug fixes

- 3D viewer: loading a single node skeleton with smoothing enabled no longer
  causes an error.

- 3D viewer: nodes taged with 'uncertain' can be loaded again.

- 3D viewer: various rendering bugs for Reconstruction Sampler domains and
  intervals have been fixed.

- 3D viewer: stored node scaling settings are now properly restored.

- 3D viewer: TODO tag coloring doesn't override custom label colors anymore.

- 3D viewer: all synaptic site spheres are created and colored again.

- 3D viewer: camera won't flip anymore if it is upside down during animations.

- Tracing overlay: the border of the tracing window is now properly rendered.

- Tracing overlay: child node edition times are now correctly updated if the
  parent is deleted, which fixes occasional state matching errors.

- Tracing overlay: Shift + Click now works also with attachment connectors,
  should they be selected as default connector type in the settings.

- Reconstruction sampler: deleting samplers while other samplers on the same
  neuron refer to the same created boundary nodes no longer causes an error.

- Reconstruction sampler: cable length columns are now sorted numercially.

- Reconstruction sampler: all settings are now correctly reset when a sampler is
  selected or "New session" is pressed.

- Reconstruction sampler: a few corner cases for binary interval coloring have
  been fixed. Colors should now alternate in most cases.

- Connectivity matrix: synapse count based ordering works again.

- Connectivity widget: annotations on neurons (used for filtering) are now
  properly updated when they are changed in another part of CATMAID.

- Graph widget: edge color updates now trigger a redraw operation again.

- CLI importer: the ID sequence for the auth_user table is now properly reset
  after an import.

- CLI importer: missing treenode-connector links are now imported between
  connectors and placeholer nodes.

- CLI impoerter: the ID of reused objects is now proplery updated in imported
  data when --preserve-ids is used.

- CLI importer: skeleton summaries and edge tables aew correctly created again.

- CLI importer: unmapped imported users are now correctly saved.

- The error dialog prints now linen breaks and spaces correctly again, which
  improves its formatting.


## 2018.07.19

Contributors: Albert Cardona, Andrew Champion, Pat Gunn, Tom Kazimiers, Will Patton, Eric Trautman


### Notes

- Both the standalone Docker image and the Docker-compose setup can now be
  updated after a Postgres version change. This makes it possible again to use
  CATMAID versions after 2018.02.16 with Docker. The documentation has more
  information.

- This is the last CATMAID version with support for Python 2.7. Starting from
  next version, only Python 3 will be supported.


### Features and enhancements

Volume widget:

- Add a "List connectors" link to each volume, to show all connectors in a
  volume bounding box.

- The new "Min skeleton nodes" and "Min skeleton length" options allow to
  further constrain volume based skeleton selections ("List skeletons").

- The Connector List widget that is shown when clicking on "List connectors",
  now supports connector filtering. The volume of the link's row is now
  automatically set as filter in the new Connector List widget. This means
  connector links in this table are now shown only if they intersect exactly
  with the volume (and not only with the bounding box like before).

- State saving is now supported.

3D Viewer:

- The line width of skeletons can be adjusted again on platforms other than
  Linux. This Requires "Volumetric lines" in the "View settings" tab to be
  enabled (it is by default). Unchecking this option brings back the previous
  line rendering behavior.

- The new "Focus skeleton" button in the "View" tab will look at the active
  skeleton's center of mass from the current camea location.

- Volumes can now be smoothed by subdivision. The volume option panel available
  from the View Settings tab now contains a "Subdivide" checkbox.

- A volume's bounding box can now be displayed using the "BB" checkbox that is
  available for visible volumes in the volume option panel.

- New coloring option: X/Y/Z rainbow lookup table coloring for active stack
  dimensions.

- The active node respects now a node radius by default and is scaled to 1.5x
  its size. This behavior can be disabled using the "Radius adaptive active
  node" checkbox in the "View settings" tab.

- Catalog export: use global neuron name for sorting and display by default.

- Catalog export: support for multiple neurons per panel has been added
  (separate from pinned neurons). The export dialog contains now a "Skeletons
  per panel" input field. Essentially, the displayed skeletons can bow be
  iterated in batches.

- Catalog export: individual skeleton panels can now also be exported as PNG
  instead of SVG, which reduces the file size, export time, parsing time. Plus
  it allows for an exact copy of what is shown in the 3D Viewer.

- Catalog export: in orthographic mode it is now possible to export a scale bar
  on either none, the first or all exported panels.

- If the estimated size of the tiles to load for a Z plane exceeds 100 MB, users
  are asked for confirmation.

Connectivity matrix:

- Connector node filters can now be applied using the funnel icon in the widget
  title bar.

- The new "Groups" tab allows to group rows, columns or both by their displayed
  name.

- State saving is now supported.

Reconstruction sampler:

- Different leaf handling strategies are now available to be selected for a
  sampler. The behavior so far (and current default) is to just ignore leaf
  segments that are shorter than the interval length minus the error margin.
  Alternatively, it is now possible to merge the leaf segment into the last
  interval, to create new shorter intervals for the leaf segments or, combining
  both, it is possible to try to merge it into the last interval and if that's
  not possible (e.g. on a small twig with no previous interval on the same
  segment), then create a new short interval. This option is available in the
  Sampler tab.

- Both the domain table and the interval table now show the cable length of each
  domain and interval in nanometers, respectively. Additionally, the interval
  tab also show the aggregated cable length of all completed intervals.

Tracing layer:

- The new option "Update tracing data while panning" allows to configure weather
  the tracing data on the layer will be updated when the view is panned around.

- A set of new options allows now to configure a "tracing window", which will
  restrict tracing data loading by allowing it only in view centered rectangle.
  Width and height can be configured independently. This is useful for remote
  review and tracing.

- A new option to show only the N largest skeletons in a field of view is now
  available for the layer settings (and the API).

Miscellaneous:

- The behavior of the Ctrl modifier on section navigation with , and . can now
  be inverted using the "Animate section change by default" option in the
  Settings Widget.

- Connectivity widget: annotations can now be used for additional filtering per
  partner table.

- Split/merge dialog: the node count of the individual parts is now shown when
  hovering over their cable length information.

- Review widget: the user who created the last node of each segment is now
  displayed in the review table. This allows to focus review on segments not
  created by oneself.

- A skeleton cable length limit can be set so that a warning is displayed if a
  change to the skeleton morphology results in a cable length larger than the
  limit. This is available in the Warnings section of the Settings Widget.

- Node filters: if a neuron name is provided for a rule, the rule is now valid
  for all neurons with neuron names that include the provided name and not only
  exact matches.

- Neuron name display: neighboring duplicate name components are now removed by
  the default. This setting can be adjusted from the Annotation sections in the
  Settings Widget.

- Boolean parameters for API endpoints are no case-insensitive, allowing the use
  of regular boolean values in requests from Python.

- CLI exporter: the new --excluded-annotation parameter can be used to exclude
  neurons from the export based on annotations.

- CLI exporter: placeholder nodes are now exported as completely new skeletons
  that are not linked to their original skeleton, unless it is part of the set
  of exported skeletons or the --original-placeholder-context flag is provided.


### Bug fixes

- Measurements table: column headers in CSV export are now quoted.

- Export management command: the default output filename can be used again.

- Export management command: class instances and links of skeletons and neuronsa
  are now exported alongside treenodes.

- Neuron name service: missing naming components don't lead to removal of all
  whitespace between neighbors anymore.

- Initial skeleton coloring of merge dialog when merging from smaller into
  larger skeletons is fixed.

- 3D viewer: refreshing the active skeleton does not refresh all skeletons
  anymore.

- 3D viewer: connector restrictions like "show only shared connectors" now
  respect the pre/post visibility toggles in the Selection Table.

- 3D viewer: the initial text scaling for label text is now correctly set again.

- Reconstruction sampler: during interval creation preview, only intervals from
  the currently active domain are now shown.

- Graph Widget: when subscribed to other widgets, their skeletons are not
  removed anymore from the Graph Widget when the other widget is closed.

- Neuron Search: annotation data range can be used again.

- The Strahler number computation no correctly increases the Strahler number
  when two more children have the local maximum number rather than requiring all
  children to share the same number.

- Radius editing: using undo (Ctrl + Z) after editing the radius of a node works
  now without an error message.


## 2018.04.15

Contributors: Albert Cardona, Andrew Champion, Chris Barnes, Rob Court, Tom Kazimiers


### Notes

- Requires a virtualenv update.

- A new management command "catmaid_find_node_provider_config" is available,
  which can be used to compare different node providers on existing data, which
  is useful to configure the NODE_PROVIDERS setting.

- The Docker images now support the options CM_HOST and CM_PORT to configure
  where uwsgi is listening.

- When using the Javascript console, node positions returned from tracing
  overlays are now in project space coordinates (physical nm), not stack space
  voxel coordinates. Transformation to project space is no longer necessary.

- Postgres 10+ is now required.

### Features and enhancements

Layouts:

- A new "Layouts" menu is shown in the top bar when a project is opened. It
  allows to save the current window layout under a name, it provides an option
  to close all widgets and will show all available layouts as menu entries.

- Layouts store window arrangement, window sizes, tabs and subscriptions.

- Saved layouts can also be manually configured from the "Custom layouts"
  setting in the Settings Widget.

- Tabbed windows are now supported in layout specs by using "t([a, b, c])" where
  a, b, c or any other number of elements can be children of the tabbed window.

Landmarks:

- Support transformation of nodes that cross space between landmark groups and
  even reach into target groups. This allows to e.g. transform skeletons that
  cross the midline. Doing this is enabled by default, but can be disabled
  through the "Interpolate between groups" option.

- Virtual transformed skeletons are now also shown on a separate layer in all
  open Stack Viewers. Nodes of those skeletons can currently not selected. To
  disable the Landmark Layer, uncheck the "Show landmark layers" checkbox in the
  Display tab's button panel.

- The new "Edit landmark" tab provides a simpler interface to add new landmark
  locations to landmark groups. If the option "Update existing landmark
  locations" is selected, new landmark locations will replace existing ones
  shared between the provided landmark and the selected group. The lower
  section of this tab allows to edit links between landmark groups, which can
  be used for rule based display transformations.

- As an alternative to selecting a target landmark group explicitly to create a
  display transformation, it is now possible to instead select a target relation
  in the Display tab. Doing so will automatically create all display
  transformations from the source group to all landmark groups transitively
  linked to the source group using the selected relation. The reciprocity of
  relations is respected.

- The new "Create groups" tab provides an option to create landmark groups along
  with required landmarks from the bounding boxes of two volumes. This allow to
  quickly create simple landmark group mappings.

- The color and extra scaling for nodes on Landmark Layers can be adjusted from
  the widget.

- All 3D Viewers are now enabled by default as transformation display target.

- State saving is now supported.

3D Viewer:

- A scale bar can now be displayed when in orthographic mode. The scale bar
  can disabled via a checkbox in the View Settings tab.

- PNG and SVG exports offer now a filename input field.

- Loaded volumes are now stored along with their styling in the widget state.

- Landmark groups are now show with landmark name labels. This can be disabled
  from the landmark menu.

- Text scaling can be adjusted from the View tab.

- The width and height of animation exports are now restricted to even numbers.
  This is required by the H264 codec we refer to in our documentation.

Graph widget:

- The old "Graph" tab was split into two: "Nodes" and "Edges", each with the
  corresponding functionality.

- New feature: color edges with the same color as the source node, the target
  node, or the general color specified in the "Properties" menu (from the "Main"
  tab). See the "Edges" tab.

- New feature: change the arrow shape to a circle, diamond, tee, etc. The new
  "Set" button in the "Edges" tab applies the change to selected nodes.

- New feature: the new "Selections" tab can record sets of nodes, stored as a
  named selection. Then these can be selected or deselected.  The "Select all"
  button selects all nodes from all created selections.

- Basic state saving is now supported.

Reconstruction Sampler:

- Intervals are now displayed with only two colors by default, it makes
  distinguishing many intervals easier. The previous multi-color mode can be
  reactivated from the preview window.

Tracing general:

- The settings widget allows now to configure a "fast split mode" and a "fast
  merge mode" to allow particular groups of skeletons to be split and  merged
  without confirmation. Similarly to Visibility Groups, these Fast Split/Merge
  Groups can be defined in terms of a universal match (all skeletons), a
  required meta-annotation or a creator ID.  In fast split mode, all annotations
  from the split skeletons are copied over to the split off part. In fast merge
  mode, all annotations are taken over from a skeleton merged in without
  confirmation.

- The `P` shortcut (peek) will now show the closest skeleton to the cursor in
  all open 3D Viewers. To show the active skeleton use `Shift + P`.

- A move/navigation mode can now be used using the new (third) button in the
  tracing tool bar. If enabled, no mouse based node actions will be performed
  anymore. Left mouse button clicks/movements are handled like right mouse
  button clicks/movements.

- The Split Neuron Dialog has now "select all" checkboxes for annotations.

Statistics widget:

- Statistics widget: The new option "All" in the time unit selection control
  allow to aggregate user data for the whole time range.

- The number of newly created treenodes is now displayed alongside the cable
  length in the contribution table.

- Each user can now be included in an aggregate statistics row at the end of the
  table by checking the checkbox in front of the username.

- Add extra Refresh button to top bar.

Volume widget:

- The new link "List skeletons" in each volume table row allows to open a new
  Selection Table containing all skeletons the bounding box of the respective
  volume intersects. Due to large numbers of skeletons in bigger volumes, this
  is currently mainly useful for smaller volumes.

- When creating box volumes, the new button "Define cube at
  current location" allows to conveniently create a cube with a configurable
  edge length at the current location.

Miscellaneous:

- Basic Search: allow search for treenode IDs and connector IDs.

- Project administration: selected projects can now be exported as JSON or YAML
  file using the respective action from the drop-down menu.

- In addition to the '/apis' endpoint, the API documentation is now also
  available as part of the general documentation.

- Connectivity Widget: partner header indexes can now optionally be replaced
  with the neuron name and rotated by 90 degrees.

- The Keyboard/Mouse Help Widget has now a text filter, which allows to show
  only items containing a particular text.

- The Tracing Overlay has a new setting "Allow lazy node updates", available in
  the Settings Widget. If enabled (default), stack viewers can skip node updates
  if a change didn't occur in the Viewer's field of view. This is useful when
  e.g. the Connector Viewer is open while tracing, because not all viewers get
  update due to the addition of a node.

- Selection Table: Skeletons can now be imported from CSV files.

- The status bar shows now both stack space and project space coordinates of the
  mouse cursor.

- The skeleton projection layer works now with orthogonal views.

- Detailed review colors are now enabled by default. To get the old behavior
  back, adjust your settings (admins can do this for the whole project or
  server).

- Stacks can now be created whose planar axes have anisotropic resolution.
  The stack viewer will display these stacks correctly by scaling tiles
  separately along each axis. The tracing overlay is also compatible with these
  stacks in all orthoviews.

- Added H2N5 tile source type.

- Due to the new skeleton summary tables, some APIs are much faster now:
  1. Obtaining review info skeletons with /{project_id}/skeletons/review-status,
  2. API and connectivity information through /{project_id}/skeletons/connectivity,
  3. Listing skeletons with a minimum node count with /{project_ids}/skeletons/
  4. Getting skeleton node count with /{project_id}/skeleton/{skeleton_id}/node_count.

  In consequence the following widgets became faster too: Connectivity Widget,
  Selecting skeleton counts in the Statistics Widget, Review count based
  coloring (e.g. in Graph Widget). Opening the Merge Dialog is also faster due
  to this change.


### Bug fixes

- Reconstruction Sampler: 3D visualizations for interval preview and color mode
  were sometimes wrong and showed additional intervals. This is fixed now.
  Actual interval boundaries were not affected and are correct.

- Reconstruction Sampler: Individual intervals are not silently deleted anymore
  if referenced start or end node is deleted. As consequence interval start and
  end nodes can't be deleted anymore.

- Measurement table: no error is shown anymore after merging two listed
  skeletons.

- Radio button drop-downs and checkbox drop-downs now hide on a mouse click
  outside of the control.

- Review: fix node selection error appearing during review of some virtual
  nodes.

- Tracing layer: when trying to create a second presynaptic node to a connector,
  a warning is now shown instead of a full error dialog. Also the previously
  created target treenode isn't created anymore in this case.

- Tracing layer: prevent browser context menu on tracing overlay right click.


## 2018.02.16

Contributors: Andrew Champion, Albert Cardona, Chris Barnes, Tom Kazimiers

## Notes

- Three new OS package dependencies have been added (due to a Django framework
  upgrade), make sure they are installed:

  sudo apt-get install binutils libproj-dev gdal-bin

- Python 3.6 is now supported. Make sure to update your settings.py by replacing
  the line

  COOKIE_SUFFIX = hashlib.md5(CATMAID_URL).hexdigest()

  with the following line:

  COOKIE_SUFFIX = hashlib.md5(CATMAID_URL.encode('utf-8')).hexdigest()

- A virtualenv upgrade is required. To correctly install one updated dependency,
  the django-rest-swagger Python package has to be removed first from from the
  virtualenv, before the virtualenv is updated:

  pip uninstall django-rest-swagger
  pip install -r requirements.txt

- `requirements` files now inherit from each other: `-test.txt` includes
 the production requirements, `-dev.txt` includes test (and therefore
 production) and doc.

- CATMAID extensions no longer require users to manually edit their
  `INSTALLED_APPS` in `settings.py`. Remove if they are already in use.

- The NODE_PROVIDER settings variable (settings.py) is replaced with the
  NODE_PROVIDERS variable. The new variable takes a list of node provider names,
  which are iterated as long as no result nodes are found. Replace the former
  single string value with a list with this name as single element, e.g. if
  the current setting reads NODE_PROVIDER = 'postgis2d', replace it with
  NODE_PROVIDERS = ['postgis2d'].

- Three new types of cache backed node providers have been added: cached_json,
  cached_json_text, cached_msgpack. Tests suggest that cached_msgpack is the
  fastest.


### Features and enhancements

Reconstruction Sampler:

- 3D previews now allow to use a white background and toggle meta spheres.

- To match a given interval length, the Reconstruction Sampler will now create
  new nodes during interval creation. This allows better sampling on long
  straight lines without intermediate nodes. To disable this behavior uncheck
  the "Create bounding nodes" setting. Newly created nodes are automatically
  labeled with the "sampler-created" tag.

- By adjusting the new interval "max error" setting, it is possible to only
  create bounding nodes (if enabled) if the closest existing node is farther
  away from the ideal location than the max error value. This allows better
  reuse of existing nodes.

- Created interval boundary nodes are also automatically deleted on sampler
  removal, if possible. If a created node has not been altered in any way during
  its life time and it still forms a straight line with its parent and single
  child, it can be removed. Otherwise the node is kept.

- A new "Partner" step has been added. After a connector is selected at random,
  users are now asked to add all partner nodes to the synapse and let the widget
  choose a partner site for them.

- Sections that should be interpolated (e.g. because of large tracing data
  shifts due to image data shifts) are now respected and not over-sampled
  anymore.

- Completed intervals can now be optionally excluded from random selection.

Node Search:

- Tagged connector nodes are now shown in search results.

- Annotation search results allow now to open the Neuron Navigator page for the
  respective annotation.

Graph Widget:

- It is now possible to show links of all connector types. By default, only
  synaptic connectors are available, but this can be changed using the "Link
  types" drop down control in the Graph tab. There also the edge color for
  particular link types can be set.

- The edge color button in the option dialog has been replaced with a link type
  drop down which allows to set color and visibility per connection type.

3D Viewer:

- Stored interpolatable sections are now loaded by default. Additional project
  space sections can be configured from the Skeleton filters tab.

- Custom tags can now also apply to predefined labels like TODO or
  uncertain_end.

Miscellaneous:

- The maximum number of frames per second rendered by a stack viewer window can
  now be adjusted through the Settings Widget > Stack view > Max frames per
  second.

- The Open Widget dialog is now only opened with Ctrl + Space when no other keys
  are pressed. This allows to use key combinations like Ctrl + Shift + Space + >
  to browse smoothly through the image stack while hiding the tracing layer.

- The active node can now be moved in Z by holding the `Alt` key and
  using `,`/`.`. The stack viewer follows the node.

- Filters: a Reconstruction Sampler Domain node filer is now available. The
  required node ID can be optained from the Reconstruction Sampler Widget.

- Neuron History: a lower and upper bound for the time window in which changes
  are respected and counted can now be set.

- On CATMAID front-pages (project overview) the keys 0-9 can now be used to open
  the n-th stackgroup or stack, stackgroups have precedence.

- Sections in which nodes should be interpolated for various displays can now be
  persisted in the database using the "interpolatable sections" data model from
  the admin interface.


### Bug fixes

- Reconstruction sampler: Strahler shading color updates work now reliably.

- Reconstruction sampler: connectors in neighboring intervals are now not
  included anymore in connector listing.

- 3D Viewer: SVG export styles are correctly applied again, the exported data
  isn't transparent anymore.

- 3D Viewer: custom label matches are now always given precedence when multiple
  labels are matched on a node.


## 2017.12.07

Contributors: Albert Cardona, Andrew Champion, Chris Barnes, Tom Kazimiers
### Notes

- PostgreSQL 9.6 and Postgis 2.4 are now required.

- A virtualenv upgrade is required. To correctly install one updated dependency,
  the django-rest-swagger Python package has to be removed first from from the
  virtualenv, before the virtualenv is updated:

  pip uninstall django-rest-swagger
  pip install -r requirements.txt

- New settings field: CROPPING_VERIFY_CERTIFICATES. This controls whether SSL
  certificates should be verified during cropping and defaults to True.

- The NODE_LIST_MAXIMUM_COUNT setting can now be set to None, which disables
  node limiting. If node count limiting isn't really needed in most cases, this
  can slighly improve query performance.

- The file `UPDATE.md` will now list all administration related changes for each
  release, including required manual tasks. These changes also continue to be
  part of this change log.

- Requires running of: manage.py catmaid_update_project_configuration

- Tracing data is now by default transmitted in a binary form, please make
  therefore sure your web-server applies GZIP not only to the "application/json"
  content type, but also to "application/octet-stream". For Nginx this would be
  the gzip_types setting.


### Features and enhancements

Node filters:

- A new node filter called "In skeleton source" has been added. This allows to
  add a filter which only allows nodes of a particular set of skeletons,
  accessed through a skeleton source. This can be useful to look at connectivity
  of a particular set of neurons. It can of course be combined with other
  filters like volume intersection.

- New filter: Pruned arbor, which keeps the arbor proximal to the (tagged) cut
  points, discarding distal subarbors.

Connector table:

- Node filters are now supported.

- Attachment connectors are now supported.

Landmarks:

- The new "Landmark Widget" allows to create landmarks, form groups of them and
  use these groups to virtually transform skeletons from one landmark group into
  another one. This can be used e.g. to find homologues neurons. Virtual
  skeletons can currently displayed in the 3D Viewer.

- Defining landmarks and their groups is done in two stages: 1. define abstract
  landmarks and group those abstract landmarks. 2. link locations to individual
  landmarks and their presence in a group.

- Abstract landmarks represent e.g. a feature that can be found at multiple
  places in the data set, like the entry point of a particular neuron on the
  left and right side of a Drosophila brain. The left and right side of the
  brain would then be represented as groups, each one having expected abstract
  landmarks as members.

- Creating new abstract landmarks and groups can be done through the respective
  "Name" fields and "Add" buttons in the Landmarks tab. To link an abstract
  landmark to a group, click on either an existing landmark group member in the
  landmark groups table or on the "(none)" placeholder. The newly opened dialog
  will allow to associate landmarks with groups. Landmarks can be member of
  multiple groups.

- Linking locations to landmarks and the groups they are member of is done by
  using the right click context menu on either an existing location in the
  "Locations" column of the Landmarks table or the displayed "(none)"
  placeholder. Currently, the location of the active node or the center of the
  stack viewer can be linked. When using the latter option, it might be a good
  idea to enable the display of reference lines in the Settings Widget.

- To be able to use a landmark location in a transformation, the locations
  linked to landmarks need to be associated with at least one group. If for
  instance a physical location for the abstract landmark representing a
  particular neuron entry point has been found for the left side of a Drosophila
  brain, this location would be linked to the landmark itself and to the group
  representing the left side of the brain. To link the location to the group,
  right click the index number in the landmark's row in the Location table, the
  context menu will allow to add the landmark to all groups the abstract
  landmark is a member of (removal works the same way).

- Virtual skeleton transformations can be created from the "Display" tab. After
  selecting a target 3D Viewer from the drop down menu, the skeletons to create
  transformed virtual version for, have to be selected by choosing a skeleton
  source. With this done, a source and target landmark group can be selected.
  Transformations are only expect to provide reasonable results if the
  transformed skeletons are "enclosed" by the landmark group.

- The "Import tab" allows to import multiple four-column CSV files into landmark
  groups. The expected format is: Landmark name, X, Y, Z. Each file can be
  associated with one landmark group, landmarks with the same name will be
  matched.

3D viewer:

- Landmarks and landmark groups can be displayed. Similarly to volumes
  individual groups can be selected and adjusted through the "View settings"
  tab. Apart from the color and mesh-faces option for groups, it is possible to
  scale landmarks.

- All visible skeletons can now be exported as Wavefront OBJ file. Each skeleton
  will be rendered as a separate group, colors are preserved and written out as
  material file (MTL). Both files can be compressed as ZIP file on the fly and it
  is possible to generate a simple line based export as well as a mesh based
  representation using a user definable radius. The generated ZIP file can be
  used with services like augment.com.

Neuron history widget:

- A user filter can now be applied through the respective checkbox drop down
  element. If at least one user is selected, only events caused by those users
  are respected.

New connector types:

- Two new connector relations are available: attached_to and close_to. Like
  other connector relations, they can be used to link treenodes to connectors
  and can be used with the help of  Alt + Click context menu when a treenode is
  selected. They are available as "Attachment" and "Close to".

- If If a connector has at least one attachment relation is viewed as
  "Attachment connector" and additional clicks with such a connector selected
  will create "Close to" edges.

- To add more information about the nature of an attachment, the connector
  should be labeled, e.g. as "vesicle".

Connectivity Widget:

- All skeletons linked through a attached_to -> connector -> close_to
  relationship are now shown in a separate table if the "Show attachments"
  option is enabled.

Export management command:

- The export management command will now also export meta-annotations when the
  --annotation option is set. All meta-annotations of annotations directly
  linked to the exported neurons are exported, too.

- Users referenced by any of the exported objects are now also exported
  automatically. This can be disabled using the --nousers options.

- User references are now stored as usernames rather than numerical IDs. This
  removes the requirement of always also exporting user models, because users
  can be mapped based on their usernames.

Import management command:

- The new --map-users option allows to map users referenced in the imported data
  to already existing users in the database. This makes updating existing
  databases easier and removes the de facto import data requirement to contain
  user models. By default --map-users is not set.

- The new --create-unknown-users option will instruct the importer to create
  new inactive user accounts for users that aren't included as objects in the
  imported data. If user mapping is enabled, accounts would only be created for
  users that can't be mapped and are also not included in the import data. By
  default --create-unknown-users is not set.

- Imported class, class instance and relation objects are skipped when
  existing objects in the target project have the same name. This makes merging
  of projects also possible for semantic data (e.g. annotations, tags). The only
  exception are neuron class instances, where two different objects are allowed
  to have the same name.

- The importer now won't keep the IDs from spatial objects in the input source,
  but will instead always create new objects. This ensures no existing data is
  replaced and allows importing different sources into a single CATMAID
  instance. If the original IDs have to be used, the ``--preserve-ids`` option
  can be used. This is done for treenodes, connects, and their links.

Miscellaneous:

- Users can now choose alternative markers for connector nodes, which do not
  obscure the object being annotated: this encourages manually annotating
  synapses etc. in a manner which is more comparable with automated detections

- Exported sub-stacks now include the Z resolution.

- Added table of reviewers vs number of nodes reviewed to the "Summary Info"
  in the Selection Table widget.

- Synapse distribution plot: global and single-axis zoom and pan are now
  supported.

- Neuron dendrogram: nodes linked to connectors (synaptic sites) can now be
  highlighted.

- Tracing layer: cached tracing data is now used by default when showing
  sub-views of previously loaded data. This is useful for e.g. quickly zooming
  in. Like with the regular node cache, views not used for one minute will be
  thrown away.

- All users can now view their user analytics plot with the help of the Project
  Statistics widget.

- The NRRD file export can now transform from FAFB v14 into template brain
  space.

- Synapse Fractions: the button "Group all ungrouped" will move all skeletons
  that are not part of a group already and not part of "others" into a new
  group. To also include skeletons in "others", use a synapse threshold of zero
  in the "Filter partners" tab.

- Selection Table: Open/Save (JSON) does now preserve the order of skeletons.

- Tracing data should load faster due to spatial query improvements and
  reduction of transferred data. The tracing layer transfers data now in binary
  by default, which can be adjusted in through the tracing layer settings.

- The catmaid_setup_tracing_for_project management command does not require a
  --user argument anymore. If not provided, the first available admin user will
  be used.

### Bug fixes

- 3D Viewer: the visibility of skeletons with connector colors the same as the
  skeleton can now be controlled correctly.

- Selecting nodes explicitly with multiple stackviewers open (e.g. by
  Shift-Click in the 3D Viewer) sometimes raised an error about not being able
  to find the selected node. This is fixed now.

- Entries in the Treenode Table can now be correctly sorted by date.

- Cropping tasks can now work with HTTPS URLs.

- Graph widget: new skeletons can now be added again after individual skeletons
  have been split.


## 2017.10.02

Contributors: Chris Barnes, Dylan Simon, Albert Cardona, Andrew Champion, Tom Kazimiers

### Notes

- A virtualenv update is required.

- This release adds optional statics summary tables, which can increase the
  performance of project/user statistics significantly, but statistics will also
  be correct without them. The additional table keeps aggregated information
  about various user actions. To initialize this table, the following
  manangement command has to be run after the migration:

    ./manage.py catmaid_populate_summary_tables

  To maintain good performance, this command has to be run regularly, e.g.
  through a cron job or Celery every night. Because summary updates are
  incremental by default, they don't take much time to update.

- CATMAID's Docker images changed: The existing `catmaid/catmaid` image is now
  only a base image that is used for a simple standalone demo image, available
  as `catmaid/catmaid-standalone`. Additionally, the base image is used in a new
  docker-compose setup, which can be used if persistent data is required. The
  documentation has been updared with all the details.

- The Docker default port is now 8000 for both regular setups and docker-compose
  setups.

- The data view "legacy project list" has been renamed to "simple project list".
  It now supports separate project title and stack title filters, which can be
  preconfigured using the data view config options "projectFilterTerm" and
  "stackFilterTerm". For both simple terms and regular expressions can be used.
  The filter input boxes can optionally be hidden by setting the "filter" config
  property to false.

- Running periodic tasks is now easier and a default setup for cleaning up
  cropping data at 23:30 and update tracing project statistics at 23:45 every
  night is now available. All it needs is to run a Celery worker and a Celery
  beat scheduler. The documentation has more details.

- The cropping output file file name prefix and file extension can now be
  specified from settings.py. The defaults are:

  CROPPING_OUTPUT_FILE_EXTENSION = "tiff"
  CROPPING_OUTPUT_FILE_PREFIX = "crop_"

- CATMAID can now make use of a ASGI server to utilize WebSocket connections.
  Such a server (e.g. Daphne) needs to handle URLs that start with /channels/.
  Currently only messages can be updated this way, which already removes many
  requests for setups with many users. This allows for instance an immediate
  feedback after a cropping a sub-stack finished without requiring the client to
  check for new messages every minute.


### Features and enhancements

Project/user statistics:

- The widget should now be much faster.

- Import actions are not counted anymore by default. The "Include imports"
  checkbox can be used to change this.

- State saving is now supported.


Neuron history:

- Events by different users are now collected in separate bouts to attribute
  parallel user activity. To restore the previous behavior (users are ignored)
  the "Merge parallel events" checkbox can be checked.

- State saving is now supported

- Individual neurons can be removed with the help of an "X" icon in the firs
  column.

- A "total time" column has been added, which aggregates time across all active
  bouts formed by both tracing and review events. Since events are binnned in
  bouts, the total time is not just the sum of both tracing time and review
  time.


Node filters:

- A Reconstruction Sampler interval can now be used as a node filter. This
  allows e.g. reviewing only an interval or look only at the connectivity of
  the interval.


Graph Widget:

- Edge labels can now take different forms and can be configured in the
  properties dialog. There are two new label options available: "Fractions of
  outbound connections" and "Fractions of inbound connections". Instead of an
  absolute number they display the relative fraction. This works for both
  regular connections and connections involving groups.


Reconstruction sampler:

- Intervals for a particular interval length can now be previewed before
  creating a new sampler. To do so, use the "Preview intervals" button in the
  Sampler tab.

- Interval reviews can now be initiated directly from the interval step table.
  It will open a new review widget with pre-set interval filter and added
  skeleton. The same is possible from the synapse workflow step using the
  "Review interval" button.


Layouts:

- The Stack View section of the Settings Widget allows now the configuration of
  a list of default layouts that can be applied to newly opened stacks and stack
  groups. Layouts are useful for having a reasonable default configuration of a
  newly opened CATMAID workspace including stacks and stack groups.

- Layouts mimic nested function calls and are constructed from v(a,b) and h(a,b)
  elements for vertical and horizontal splits, o(a) for optional windows, where
  a and b can each be other v() or h() nodes, one of [XY, XZ, ZY, F1, X3D] or any
  quoted widget handle (e.g. "neuron-search", see Ctrl + Space). At the moment,
  in o(a), "a" can't be XY, XZ or ZY. To reference the 3D Viewer use X3D.

- By default only one layout is available: organize XY, XZ and ZY in four
  quadrants using one additional window (if non available the help page). This
  is its specification: h(v(XY, XZ), v(ZY, o(F1))). With h() and v(), horizontal
  and vertical splits are declared, respectively. With o(F1) a help window will
  be opened as fourth window if not already another window exists.

- Useful for organizing orthogonal views in a custom way and to create default
  workspaces. For instance, to always open a Neuron Search widget right to the
  a single XY view stack, the layout can be used: h(XY, "neuron-search").


CATMAID extensions:

- As well as supporting standalone 3rd party static files, CATMAID now supports
  fully-featured extensions, which can include database models, API endpoints,
  and tests as well as static files.

- CATMAID extensions are Django apps which follow a particular layout, and can
  be installed with `pip`

- The goal is for CATMAID extensions to be reusable and interoperable
  between versions and installations of CATMAID, reducing the need to fork it
  and keep the fork updated in parallel.

- More details can be found in the docs.

- CATMAID-autoproofreader extensions has been added to the list of
  known extensions.


3D viewer:

- Volumes can now be filtered in the volume drop-down menu with the help of a
  built-in text box.


Miscellaneous:

- The Open Widget dialog now displays a table that includes more information on
  widgets. Instead of the previously used auto-completion this table is now
  filtered.

- If multiple tile layers are used, the stack viewer layer settings (blue white
  box in lower left corner) allow to set which stacks should be respected if
  broken sections are skipped. This can be done through the "Skip broken
  sections of stacks" drop-down menu. Whether layers added after the first layer
  should be respected by default when checking for broken sections can be set in
  the Settings Widget in the "Stack view" section.

- The dialog to add a new annotation displays now the existing annotations as
  well.

- Tabbed windows: changing window aliases are now reflected in tab headers.

- The performance of node creation and deletion operations has been improved by
  preventing full node updates after these operations.

- Widgets with state saving support now also support removing previously saved
  states through a button in the widget controls available through the window
  icon in the widget title bar.

- The Selection Tool (the first icon in the top bar) has been removed, because
  it didn't provide any functionality. It is replaced by an icon to show the
  "Open Widget" dialog, which can otherwise be shown using Ctrl + Space.

- When splitting a skeleton on a virtual node, the virtual node will now only be
  instantiated if the user presses OK in the dialog, canceling won't cause a
  change of the virtual node.

- The default for hiding tile layers if the nearest section is broken (instead
  of showing the next available) can now be configured from the Settings Widget
  in its Stack View section.

- `plotly.js`, a d3-based plotting library, is now available within CATMAID,
  making it much easier to generate common plots.


### Bug fixes

- Review widget: moving in reverse direction from a virtual node doesn't show
  error anymore.

- Review widget: the Shift + Q key combination to select the next unreviewed
  node in downstream direction is respected again.

- Review widget: Shift + W and Shift + Q work now correctly if the first
  unreviewed node is a virtual node.

- Key combinations involving the Alt key were not respected on Mac OS. This is
  fixed now.

- Reconstruction sampler: the list of connectors in the selected interval of the
  synapse workflow step is now complete when refreshed.

- 3D viewer: the error shown when changing skeleton properties with an active
  connector restriction is fixed.

- The neuron history widget now calculates both tracing time and review time
  correctly.

- 'Peek skeleton' (P key) works again.

- The Split Skeleton Dialog updates the embedded 3D view again after all
  skeletons are loaded.

- Former partner nodes of deleted connector nodes can now be deleted without an
  additional tracing layer update.

- The Skeleton Projection Layer can now use the skeleton source colors and other
  colors source again.

- The simple front end data view's project filter works again

- Skeleton source subscriptions: opting in and out of applying color changes in
  source skeletons to existing target skeletons works again.

- Dragging nodes in stacks with smaller resolutions (larger nm/px) doesn't
  require large drag distances anymore, before the move is registered.

- Node selection works now reliably with orthogonal views, including using the
  "G" key.


## 2017.07.28

Contributors: Chris Barnes, Albert Cardona, Tom Kazimiers, Daniel Witvliet

### Notes

- Prepared statements can now also be used together with connection pooling.

- A virtualenv update is required.

- The following lines have to be removed from `settings.py`,

  import djcelery
  djcelery.setup_loader()
  INSTALLED_APPs += ("kombu.transport.django")
  BROKER_URL = 'django://'

- Two new treenode and connector node providers have been added: postgis2dblurry
  and postgis3dblurry. They works like the regular postgis2d and postgis3d node
  providers except that they allow more false positives, because edges are only
  tested for bounding box intersection with the query bounding box. Depending on
  the dataset, this can help performance but might require a larger node limit.

### Features and enhancements

Synapse Fractions:

- New button "Append as group". Multiple neurons will be shown in a single column.

- New UI functions to set the synapse confidence.

- Default to Upstream (fractions for input neurons).

- Shift-click to toggle selected state of partner neurons or groups, and then
  push 'J' to create a new partner group.

- X axis labels can now be rotated, from the Options tab.

- Node filters can now be applied to filter valid connector links.


3D Viewer:

- New skeleton shading modes:
  * "Axon and dendrite": like the coloring mode "Axon and dendrite", but using
	  shading like in the "Split at active node" mode.
  * "Single Strahler number": color branches of a specific Strahler number
	  in full color, and darken everything else. The Strahler number is specified
		in the tab named "Shading parameters".
  * "Strahler threshold": color branches of a Strahler number equal or higher
    than the number specifed in the Stahler number field ("Shading paramters"
		tab) in full color, darken all others. When inverted, show in full color
		branches with a Strahler number strictly lower than the specified one.

- The Z plane display now supports stack viewer layers. If multiple layers are
  shown in a stack viewer, its Z plane will render all visible layers on top of
  each other.

Review widget:

- Large neurons are handled better, rendering tables with many segments is
  now faster.

- The set of displayed columns can now be constrained with the help of the new
  "Visible reviewers" setting in the widget. Available options are "All", "Team"
  and "Self".

- A new option to automatically scroll the active segment into view has been
  added ("Scroll to active segment"). With this enabled (default), when a node
  of a segment of the reviewed skeleton is selected in the tracing layer, the
  review widget will scroll the segment into view.

- State saving is now supported.


Node filters:

- A Strahler number filter has been added to only show nodes with a Strahler
  value below/same as/above a user defined number.


Neuron Search:

- It is now possible to use the "not" operator with neuron name and annotation
  search criteria.

- Both neuron name and type columns can now be sorted.

- Filters are now supported. Only neurons will be shown of which at least one
  node is in the node filter result set.


Neuron History:

- This new widget can be opened using Ctrl+Space together with the key
  "neuron-history" or through a button in the Neuron Navigator.

- For all neurons added to this widget, time related information is presented.
  Currently, the following is calculated: Tracing time, review time, cable
  length before review, cable length after review, connectors before review and
  connectors after review.

- The components that contribute to the tracing time can be adjusted with the
  "Tracing time" drop down menu.


Reconstruction Sampler:

- This new widget can be opened using Ctrl + Space and the keyword
  "reconstruction-sampler". It allows to target reconstruction effort based on
  the spatial sampling of a skeleton. This is mainly useful for large neurons
  that can't be quickly traced to completion. The widget is organized as a
  workflow that prevents skipping steps.

- To keep track of reconstruction progress, a so called sampler is created
  for a skeleton of interest. This skeleton is typically the backbone of a
  larger neuron. The sampler keeps track of some global properties for the
  sampling. Once created, a sampler can be "opened" either by clicking "Open" or
  by double clicking the respective table row. Also note that with a sampler
  attached to a skeleton, the skeleton can not be deleted. If a skeleton should
  be deleted, delete its samplers first.

- Once opened, a sampler allows creating so called sampler domains, which are
  regions on the skeletons which should in principle be considered for sampling.
  Topological and tag based definitions of sampler domains are possible. Created
  samplers can be opened through a click on "Open" or a double click on the
  table row.

- Once opened, sampler domains can be further divided in so called sampler
  intervals. To do so the "Create intervals" buttons has to be pressed. These
  have initially all the same length (defined in sampler) and no branches.
  Intervals are meant to picked at random through the respective button.

- With an interval selected, the goal is now to reconstruct it to completion
  with all branches and connectors. CATMAID will show a warning when moved out
  of the interval. The workflow page will show both input and output connectors.

- As soon as the interval is reconstructed completely, a synapse can be picked
  at random from which the next backbone can be reconstructed. Once the backbone
  is found and reconstructed, the sampling can start over. Alternatively,
  another interval in the original skeleton can be selected at random.


Miscellaneous:

- Split/Merge dialog: the node count for both respectively remaining/new and
  remaining/old are now on top of the annotation lists.

- The General Settings section of the Settings Widget now provides an option to
  disable asking for confirmation when the active project is closed.

- Tile layers can now be configured to not automatically switch to the next
  accessible mirror if the present one is inaccessible. This is useful for some
  custom mirror use cases and can be set through the "Change mirror on
  inaccessible data" checkbox in the layer settings.

- Empty neuron name pattern components are now by default trimmed automatically.
  Empty components at the pattern endings won't leave any white space behind.
  Empty components between other components are allowed one space maximum (if
  there were spaces before). The difference is visible e.g. in the Graph Widget.

- URL-to-view links now allow selected connector nodes.

- Adding a custom mirror will now by default disable automatic mirror switching
  of the respective tile layer. Custom mirrors often come only with a subset of
  the data, which currently triggers a mirror switch by default if some tile is
  not accessible.

- The tracing layer is now faster with creating skeleton nodes, connectors and
  partner nodes by avoiding unneeded node updates.

- Export widget: exporting neurons as NRRD files is now supported. The NAT R
  package is used for this. Check documentation for setup.

- The tracing tool has now a button to refresh CATMAID's caches for neuron names
  and annotations. This can be used to update neuron names with components that
  were changed by other users. Additionally, such a cache update is performed
  automatically once every hour.

- URLs to a particular view work now also with a location and a skeleton ID only
  rather than requiring a node ID always.

- Using "Shift + x" and "Ctrl + x" will now activate a checkbox selection mode
  and the cursor turns into a crosshair. In this mode one can draw a rectangle
  everywhere on the screen and all checkboxes that are behind the rectangle will
  be toggled using "Ctrl + x" (turned on if off and vise versa) or checked with
  "Shift + x". Either releasing the drawing mouse click or a second "Shift + x"
  or "Ctrl + x" will deactivate the tool again.

- All skeleton source widgets (typically those with a skeleton source drop-down
  menu) now support copy and paste of skeleton models. Pressing "Alt + Ctrl + c"
  in an active widget will copy its skeletons (along with colors) into a
  clipboard. Pressing "Alt + Ctrl + v" in another widget will then paste those
  models into the now active widget.

- When using the Z key to create new nodes, existing nodes are not as easily
  selected from a distance anymore. Before, the radius around a click event was
  too large and the closest node around the click was selected. Other nodes will
  now only be selected if the mouse cursor is close to their circle graphic on
  screen.


### Bug fixes

- Graph widget: re-layout works again.

- The Docker image can be used again without requiring a manual restart of the
  uWSGI server.

- Zooming in using the "=" key and using Shift + Z to join and create nodes both
  work again.

- Links inside the simple Search Widget can be clicked again.

- Back-end calls with large parameter lists can be used again (e.g. review
  status in the Connectivity Widget).

- Highlighted tags in the Neuron Dendrogram widget are now correctly displayed
  next to the nodes they belong to. Before, each tagged node had all selected
  tags shown next to it, regardless of whether it would be tagged with them.

- 3D viewer: the textured Z section rendering in the 3D Viewer now respects the
  mirror setting from the tile layer.

- 3D viewer: a memory leak in displaying Z sections with images has been fixed.
  This allows long continued Z section browsing without crashing.

- 3D viewer: the accurateness of object picking on neurons and location picking
  on z panes has been improved.

- Cropping image data works again.

- Setting a stack viewer offset won't cause an error anymore.

- User interaction without a reachable server (e.g. due to a disconnected
  network) doesn't lead to image and tracing data freezing anymore.

- Pressing key combinations before the tracing layer has loaded is now handled
  more gracefully (no error dialog).

- 3D viewer: the active node split shading can now handle changed virtual nodes
  to which it is lacking information and won't raise an error.

- All newly opened widgets that support it, appear now in the "skeleton source"
  drop-down menus of all other widgets from that moment on. This was a problem
  mainly with Analyze Arbor, Measurements Table, Morphology Plot, Neuron
  Dendrogrm and Treenode Table.


## 2017.05.17

Contributors: Andrew Champion, Tom Kazimiers

### Notes

- A virtualenv upgrade is required. To correctly install one updated dependency,
  the django-rest-swagger Python package has to be removed first from from the
  virtualenv, before the virtualenv is updated:

  pip uninstall django-rest-swagger
  pip install -r requirements.txt


### Features and enhancements

Widget state saving:

- Infrastructure has been added to store widget configuration client side in a
  browser cookie. This makes it easy to update widgets to support automatic
  saving and loading of state information. The automatic saving and loading
  behavior can be configured in the General Settings section of the Settings
  Widget. To explicitly save the state in a supported widget, the respective
  button available through the "Window Configuration" title bar icon can be used
  as well.

- State saving support has been added for the 3D Viewer and the Connectivity
  Widget.

Generic node filtering:

- A generic user interface for filtering nodes is now available to widgets. If a
  widget supports it, the filtering user interface is available through the
  filter icon in the widget's title bar.

- The user interface has a "Filters" tab which lists all active filters for a
  widget and a "Add filter" tab, which can be used to create new filter rules.

- Filter rules select nodes that are kept, i.e. the filter application results
  in a list of nodes that match the filter expression.

- Different filter types are available at the moment: Only end nodes, only
  tagged nodes, only nuclei, only a sub-arbor starting from a tag, tag defined
  region, created by user(s), node creation/edite time, binary split, axon,
  dendrite, synaptic connectivity and volumes. Some come with own user input
  elements, but all can optionally be applied to only a subset of skeletons.

- Multiple filters can be combined, e.g. all branch nodes with a particular tag
  and end nodes. All filter rules are combined in a left-associative fashion and
  union and intersection can be used as operators.

Connectivity widget:

- Support for node filtering has been added, it can be configured through the
  filter icon in the title bar. All features listed under Generic Node Filters
  are supported. If a node of a skeleton from the top list doesn't match the
  filter expression, synaptic connections involving it will not be respected.

Review widget:

- Whether detailed review colors should be used is now persisted.

- The checkbox "Save review updates" allows to disable sending review updates to
  the server. Ending review or closing the widget will cause all review updates
  to be lost. If disabled, a warning is displayed. This is useful to only use
  the "navigational" features of the review widget.

- Support for node filtering has been added, it can be configured through the
  filter icon in the title bar. All features listed under Generic Node Filters
  are supported. If nodes are filtered, all percentages are relative to the
  filtered set of nodes.

3D viewer:

- The color of custom tag spheres can now be adjusted through a "color" button
  right next to the custom tag pattern.

- The color of the floor can now be adjusted though a "color" button next after
  the "Floor" checkbox.

- Skeleton coloring can now be set to not interpolate between different vertex
  colors and instead use always child colors for an edge.

- The color and whether to display mesh faces of individual volumes can now be
  adjusted more easily. A color selector is available right next to the checkbox
  of each visible volume in the volume drop-down menu. The global color controls
  are used as default for newly displayed volumes.

- Support for node filtering has been added, which can be configured through the
  filter icon in the title bar. All features listed under Generic Node Filters
  are supported.

Tracing layer:

- When inserting a new node between two existing nodes, the new node's user
  will now be the logged in user as long as the skeleton is not locked. This
  makes it easier for reviewers to make corrections, because the new node can
  now be moved (instead of only initially placed). If the neuron is locked, it
  is only possible to create a collinear node between parent and child with the
  child's user (e.g. through tagging a virtual node).


Miscellaneous:

- When a node is selected a minimal node status line is now shown again using
  information already available in the client. If the "Show extended status bar
  information" setting is the Settings Widget is checked, additional information
  is fetched from the back-end.

- The SWC export by default now maps real node IDs to incremental IDs starting
  with 1 from the root node, which is something some SWC tools expect. To
  disable this uncheck "Linearize IDs" in the SWC export dialog.

- Neuron Navigator: It is now possible to delete multiple neurons from a neuron
  listing.

- The importer widget now allows to allow multiple SWC files at the same time.


### Bug fixes

- Export widget: The SWC export link works again.

- Tracing tool: using the personal tag set doesn't remove existing tags anymore
  when added or removed.

- Fix catmaid_insert_example_projects management command.

- Review widget: it is possible again to use Q/W to move along already reviewed
  segments (re-review of nodes).

- Fix some accidental key mapping collisions of some special keys and media
  keys.

- Connector nodes can be deleted again right after they were created.

- 3D viewer: connector links are displayed again if connector restrictions are
  in use.

- Radius creation works now in orthogonal views as expected.

## 2017.04.20

Contributors: Albert Cardona, Tom Kazimiers

### Notes

- A virtualenv update is required.

- The location of the `manage.py` script changed: it moved a level up into
  `django/projects`. All other configuration files remain where they are. Make
  sure to update your `settings.py` file by replacing the line
  `from settings_base import *` with `from mysite.settings_base import *`.

- Python 3.5 is now experimentally supported. Most functionality should work
  without problems. To test, make sure to update `settings.py` by replacing
  the fragment `hashlib.md5(CATMAID_URL)` with
  'hashlib.md5(CATMAID_URL.encode('utf-8'))'.

- To use the skeleton import API users or groups now need to have the can_import
  permission.


### Features and enhancements

3D viewer:

- Nodes on specific section of the focused stack can now be automatically moved
  to an interpolated location. The "Skeleton filters" tab provides now options
  to either interpolate nodes on broken sections or a custom list of sections.
  The new location in the average X/Y location of the parent and child. If only
  parent or child is available (leaf or parent), its X/Y location is used.

- An started animation export can now be canceled through a "Cancel" button.

Review widget:

- Segments can now be reviewed in downstream order by unchecking the "Upstream
  review" checkbox. Q will still move downstream and W upstream. Already
  reviewed nodes are skipped in both directions.

- Only show "Done" message if 100% are reviewed in one of the selected columns,
  including Team. Team is now checked by default.

Import Export widget:

- The Export Widget has been renamed to "Import Export Widget", along with it
  its short-name for Ctrl+Space.

- If a user has import permissions on a project, an "Import" and an "Export" tab
  are displayed. The new import tab contains a simple SWC import, which allows
  to select an SWC file and import it. If successful, the new skeleton is
  selected right away.

Neuron Navigator:

- Instead of a "Last used" column annotation tables now show an "Annotated on"
  column. The last used date used before reflected the last change of an
  annotation itself. Now the creation time of the link relation is displayed,
  which doesn't change during a merge or split operation, unlike "edition time".

Splitting and merging:

- In the split and merge dialog, instead of selecting the skeleton/part with
  more nodes as default "winning" skeleton, the skeleton with a greater cable
  length is now chosen as default "winning" skeleton.

- Keep original creation time and edition time of annotation links that are
  copied to the newly created part on a split skeleton.

- When skeletons are merged and share annotations that should be kept, the
  older annotation link creation time will now be stored in the final neuron
  annotation link.

Miscellaneous:

- Refreshing the nodes on the StackViewer will not print the info on the active
  node in the status bar. This saves one additional request to the server,
	speeding up tracing from high-latency locations such as overseas.

- The Measurement Table now highlights the active skeleton.

- Alt+T can now be used to tag a node with a predefined set of tags. This set
  can be configured through the Settings Widget, using the "Personal tag set"
  field in the Tracing section.

- The SWC export button in the Tracing Tool toolbar has been replaced with an
  Export Widget entry. Additionally, SWC files for multiple skeletons can be
  created at the same time and exported together in a Zip archive.

- Many widgets can now have aliases, which will be displayed in parentheses
  after the name in the window title bar. A small window-like icon next to the
  window name toggles controls to change the widget alias.

- Review status colors can now be more fine-grained. The Settings Widget
  contains now the option "Use detail review color status" as part of the
  Tracing section. If enabled, ten different colors plus the regular 0% and 100%
  color will be used instead of three.

- Generating the URL to a view now respects loaded stack groups. If a stack
  group was initially loaded, it is included in the URL.

- It is now possible to control the number of sections moved when Shift is
  pressed while using ",", "." or the mouse wheel. This step size is controlled
  through the "Major section step" setting in the "Stack view" section of the
  settings widget. Alternatively, for a dialog to set a new step size, the key
  combination Shift + # can be used.

- The Connector Table now also displays the link creation time besides the
  edition time.

- Tracing layer: Moving to a child node using "]" doesn't query the server
  anymore if child info is already available in client.


### Bug fixes

- 3D Viewer: active node sphere is now hidden if no node is selected.

- Image data layers that are added to a stack viewer will be added after the
  last existing image data layer and before other layers. This makes sure
  tracing data stays on top.

- Selecting an unreachable mirror won't hide the tracing layer anymore.


## 2017.03.16

Contributors: Albert Cardona, Tom Kazimiers, Andrew Champion


### Notes

- A virtualenv update required!

- The 'classic' node provider has been removed, use 'postgis3d' or 'postgis2d'
  instead.

- Performance of the default node query strategy (NODE_PROVIDER = 'postgis3d')
  improves now when connection pooling is used and PREPARED_STATEMENTS = True.

- Both 'postgis2d' and 'postgis3d' node providers support now prepared
  statements for connector queries.

- PyPy is now supported and can be used to improve performance of back-end heavy
  endpoints. Most functionality is available, except for the following: Ontology
  clustering, Cropping, Synapse clustering, HDF 5 tiles and User analytics. To
  use PyPy, a new virtualenv using the PyPy executable has to be created.

- There is now a catmaid_prewarm_db management command, which can be used to
  populate OS and database buffers with heavily used tables.


### Features and enhancements

Graph widget:

- The "Selection" tab now has two new buttons that provide the ability to invert
	the selection, and also to select graph nodes based on matching a text string
	or by a regular expression (when the text starts with a '/').

3D Viewer:

- With the help of the new "Update active" checkbox in the "View" tab it is now
  possible to automatically update the active skeleton if it changes.

- It is now possible to hide edges that represent a link between a node and a
  connector. This is also respected with connector restrictions enabled and can
  be set with new "Show connector links" checkbox in the "View settings" tab.

Selection table:

- To prevent accidental sorting the new "Lock order" checkbox can be enabled.
  Clicks on the table headers will have no effect if the order is locked.

- Two new action icons are added on the right of each row: move a skeleton up or
  down in the table.

Annotation graph:

- A new 'Annotation Graph' widget provides a graph like visualization of
  CATMAID's annotation space, which is mainly useful to visualize annotation
  hierarchies. Meta-annotation are linked to annotations through edges. This
  widget can be opened with Ctrl+Space together with the 'annotation-graph'
  keyword.

- Optionally, the minimum and maximum number of linked annotations in a single
  hierarchy can be configured.

- Selecting an annotation will query all (sub-)annotated skeletons, which can be
  used as through a regular skeleton source selection in other widgets.

Miscellaneous:

- Tracing tool: the "Show labels" setting is now remembered across sessions.

- Right clicking on a stack viewer won't bring up the browser context menu
  anymore. Instead, the right mouse button can now be used for panning, too.

- The merge dialog has now a "Swap" button in the lower left corner. It can be
  used to swap winning and losing skeleton in a merge.

- Add a 'select' tracing modes to the tracing tool: Clicking an active skeleton or
  synapse tracing mode button (first two buttons in toolbar) will switch to the
  select mode where clicking doesn't create new nodes.

- The layer settings of image data layers allow now to add custom mirrors,
  which is useful to e.g. make a local copy of the image data availabl in
  CATMAID. This can reduce latency due to remote image loading considerably. See
  the user FAQ in the documentation for more details.

- Annotation pages in the Neuron Navigator now also list meta annotations and
  provide a way to de-annotate them.


### Bug fixes

- Fix occasional tracing overlay resizing problem where a portion of the screen
  would not show tracing data, but also won't update.

- 3D viewer: broken sections can now be displayed again.

- 3D viewer: the Z plane with stack images will now render correctly for the
  default maximum zoom level.


## 2017.02.16

Contributors: Chris Barnes, Albert Cardona, Andrew Champion, Tom Kazimiers

### Notes

- A new NODE_PROVIDER option can be added to settings.py, which can be used to
  configure the way node queries are executed. Options are 'classic',
  'postgis3d' and 'postgis2d'.  Depending on your environment, 'postgis2d' might
  be fastest, but 'postgis3d' is the current default (i.e. what has been used so
  far).

- The new PREPARED_STATEMENTS option can be added to settings.py and set to
  True to improve node query performance when connection pooling is used.
  Without connection pooling, this setting hurts performance, which is why it is
  set to False by default.

- Stack mirrors (see below) are not displayed by default in CATMAID's standard
  data views. To show them, '"show_mirrors": true' (including double quotes) has
  to be added to the respective data view configuration in CATMAID's admin
  interface.

### Features and enhancements

Stack mirrors:

- To reduce loading time of image data from different places around the world,
  it is common to copy the image data set and make it available from a server
  closer to its users. These "stack mirrors" are now handled differently by
  CATMAID. Until now it was common to select the closest mirror manually by
  clicking on an image on CATMAID's project list or by clicking on the
  respective link. To select a particular "stack mirror" one now only links can
  be used, individual images are not shown anymore. If no images were used
  before and only links were shown on CATMAID's home page, only small visual
  change was mode: an extra stack link on top of all mirrors is added. As an
  alternative to selecting individual mirrors, both, images and stack links can
  now be used to open a stack as well and CATMAID selects the fastest mirror
  automatically.

- When using links to a particular view in CATMAID ("URL to this view"), CATMAID
  will automatically select the fastest available stack mirror.

- Once a stack is displayed the stack mirror in use can be changed: After
  clicking on the white-on-blue square in the lower left corner of the image
  data display, the image display settings will show up. In there the active
  mirror can be selected from a drop-down list.

Treenode Viewer:

- A new tool similar to the connector viewer, which allows users to
  quickly view the nodes in a treenode table.

- The viewer is opened from the treenode table.

- Nodes are shown only if they are filtered in the table, and appear in
  the order that they appear in the table.

- When the sorting and filtering in the table is changed, users can
  refresh the viewer from the table to reflect these changes.


Connector Viewer enhancements:

- Connectors can now be constrained by their pre-synaptic and post-synaptic
  skeletons.

- If either is unpopulated, it is unconstrained on that side (i.e. all
  outgoing connectors can be found by clearing the 'Post- skeletons' set).

- Sorting algorithms based on treenodes associated with the connector
  (e.g. depth) can be applied either to presynaptic or postsynaptic
  skeletons.

- The 'Reverse' button switches the contents of the two skeleton sets.

- The 'Sync' checkbox sets the pre- and post- synaptic sets to have the
  same contents (the union of their contents when the box is checked)
  and keeps them that way: this is useful for inspecting all connectors
  acting within a set of skeletons, such as reciprocal connections.

- For undirected connectors (gap junctions, abutting etc.), you can use
  either the 'pre' or the 'post' set. If both sets are populated, only
  connectors touching a pre- skeleton and a post- skeleton (with 2
  distinct edges) will be shown.

- When using the connector viewer as a skeleton source, the output is the
  union of the two skeleton sets.

- The controls have been separated out into tabs.

- N.B.: Because the Connector Viewer is now populated in a different way
  to the Connector Table, you can now only open a Table from a Viewer if
  one of the skeleton sets is empty, and a connector type other than 'All'
  is selected.


Miscellaneous:

- Bookmarks are now persistent for each project.

- The Graph Widget now offers two options when exporting SVGs: regular ones and
  Adobe Illustrator compatible ones (because Adobe isn't SVG standard conform).
  An option dialog is shown after clicking "Export SVG".

- From the Graph Widget exported SVG files preserve now the view of the widget
  (zoom and pan).

- The tag table can now be constrained by a set of skeletons.

- The tag table now gives the user information on how many skeletons are
  being used as constraints, and how many tags/skeletons/nodes are
  selected.

- When the tag table is refreshed, the filters and the last sort are
  persisted.

- The treenode table can now be filtered by node confidence, creator and
  reviewer.

- When creating new volumes with the help of the Volume Manager, the color and
  opacity of the 3D preview can now be adjusted.


### Bug fixes

- 3D Viewer: custom tag highlighting now also works for tags with upper case
  letters.

- Layer settings: checkboxes now have correct default value.

- Tag table: any tags with identical names are now treated as identical.

- Tag table: fixed off-by-one error in node count.


## 2017.01.19

Contributors: Chris Barnes, Andrew Champion, Tom Kazimiers

### Notes:

- The h5py dependency has been removed. If tile source tile 3 should be used in
  a new instance, the h5py library has to be installed manually.


### Features and enhancements

Connector Viewer:

- A new tool used to view the connectors associated with a skeleton set
  of skeletons.

- Shows a grid of mini stack viewers with their own tracing overlays,
  focused on connectors associated with the skeleton by a user-selected
  relation (i.e. outgoing, incoming, gap junction or other).

- Connectors can be sorted by their absolute or proportional depth on
  their respective skeleton trees, by the connector ID or by the
  skeleton name.

- Mini stack viewers can inherit settings from a user-defined main stack
  viewer; users can focus the main stack viewer on any connector by
  clicking on its ID in the mini stack viewer title bar.

- Users can open a connector table from a connector viewer and vice
  versa.

- Accessible with Ctrl+Space 'connector-viewer'.


Connectivity table:

- Original colors of skeletons added to a Connectivity Table can now optionally
  be used when using its skeletons in other widgets (new checkbox: "Original
  color").

- The colors used in the Connectivity Graph Plot are now the ones assigned to the
  input skeletons, i.e. the ones selected in the Connectivity Widget. These in
  turn are either its input skeleton color or the default skeleton color.

- Manual re-ordering of partner count columns has been removed. Neurons can now
  be re re-ordered through the list at the top with the help of two icons in
  each row (up and down).

- All partner tables are now paginated with a default page size of 50 entries.
  The page size can be adjusted for all tables at the same time with a drop-down
  menu at the top. "Select all" check-boxes select all entries across all pages.


Graph widget:

- Active Graph Widget windows will now zoom in smaller steps if the Shift key
  is pressed.

- Graphs saved to a JSON file now keep visibility information. Loading them
  will load all nodes hidden that have been hidden when saving the file
  initially..


3D Viewer

- Meshes are replaced with volumes and the "Show meshes" checkbox has been
  removed. Existing meshes have been transformed into volumes.

- The new coloring mode "Last Reviewer" will color skeleton nodes by the user
  color of the user that reviewed them last. The "User colormap" button can be
  used to show the mapping from color to user name.


Miscellaneous:

- The Selection Table can now be opened through Ctrl+Space by using the handle
  'selection-table' instead of 'neuron-staging-area'.

- Project and stack menu entries are now sorted by default, which makes it easier
  to deal with many projects and stacks.

- Node bookmarks can now be removed through an X icon in their respective row in
  the bookmark dialog.

- Skeleton Analytics in the Review Widget will now identify nodes in broken
  sections of all stacks linked to the current project.

- The front page project list can now be loaded as a widget using Ctrl-Space
  with 'project-list'.

- Synaptic fractions: colors of groups and partners can now be changed through
  legend of graph.

- The tag table now has a refresh button to manually update the cache and
  redraw the table.

- The tag table can now open a treenode table pre-filtered for nodes with
  the selected labels.


### Bug fixes

- The size of the embedded 3D viewer in the split/merge dialog is now adjusted
  dynamically based on the available space. This prevents some problems with
  lower display resolutions.

- 3D viewer: loading of box volumes workes again.

- The statistics widget back-end will now correctly use up-to-date time-zone
  information for the query time range. This fixes some time zone conversion
  corner cases.

- Graph widget: SVG export works again. The exported SVG now groups labels with
  node/edge. Now also single node exports are supported.

- If Ctrl-Z was pressed and released very quickly, two undo steps were taken.
  Now always only one undo step will be done per single Ctrl-Z click if not hold
  down.

- 3D viewer: partner node spheres are now also shown for restricted connectors.

- Multiple stack viewers no longer use the same ID to make requests to
  the database.

- The connector table can now be used as a skeleton source, where
  previously an error would be raised.

- The tag table now collapses any tags with identical names, but as a
  consequence does not show the tag ID (as there may be multiple IDs)


## 2016.12.16

Contributors: Chris Barnes, Andrew Champion, Tom Kazimiers

### Notes

- Virtual env update required

- Postgres 9.6 is now supported.

### Features and enhancements

3D Viewer:

- Shift+Click can now be used to jump to arbitrary locations on rendered
  skeletons. Objects already clickable in the past (like tags or the soma
  spheres) are still given precedence.


Tag Table:

- New widget allowing users to get information about node label usage in
  the project, and select skeletons based on labels which their nodes
  have.

- Accessible with Ctrl+Space by the name 'tag-table' or through the 'T' widget
  button in the Tracing Tool.


Measurement Table:

- The neuron name is now quoted in the CSV file export. This makes it more
  robust when commas are used in the name representation (e.g. if annotations).

- XLSX spreadsheet export is now supported through an "Export XLSX" button.


Importer:

- Add support for importing ontology and classification information along with
  projects, stacks and stack groups in project file based import ("Image data
  importer" in admin view).

- Projects to be imported can be split across multiple documents, if local or
  remote file import is used. This helps organizing image collections manually.


Tracing tool:

- Holding P will show the active skeleton in all open 3D viewers.

- The semicolon (";") key no longer switches to skeleton tracing mode, because
  it is active by default.

- Bookmarks can be set by pressing semicolon (";") and then a marker key, which
  will mark the active node (or location if no node is active) with that key.
  Pressing backtick ("`") followed by the marker key will return to the marked
  node or location. Pressing single quote ("'") followed by the marker key will
  instead activate the marked skeleton and move to the closest skeleton node.

- Shift + H will go to the last node you edited in any skeleton.


Tracing layer:

- Connectors connected to the active skeleton are now colored with a distinct,
  more yellow hue of orange, even if the connection is not in the visible
  section.


Miscellaneous:

- The Graph Widget can handle larger graphs much better now. Also its mouse
  action have slightly changed: moving while having the left mouse button down
  will pan the view, pressing additionally the Ctrl key enters rectangular
  selection mode.


### Deprecations and Removals

- Special behavior of tile source type 2 stacks to interoperate with a Volumina
  tile server prototype has been removed.


### Bug fixes

- Review widget: auto centering works again

- Review widget: location lookup of warnings now works again in all cases.

- Skeleton source subscriptions: fix accidental sharing of skeleton sources.
  This caused e.g. losing the connection between a Selection Table and a 3D
  viewer as soon as another 3D viewer was opened.

- The Classification Editor of CATMAID's Ontology Tool can be started again.

- Using the closing bracket ("]") to walk a neuron does not stop working
  anymore after the end of a branch is reached.

- 3D viewer: finding the date of the most recent change among all skeletons
  considered in a history animation now works as expected. The end point of the
  animation is now calculated correctly and all changes can be seen.

- The Classification Clustering Widget can be opened again.


## 2016.11.04

Contributors: Gregory Jefferis, Tom Kazimiers

### Notes

- Virtualenv update required

### Features and enhancements

Tracing layer:

- Alt+Click so far created gap junction connectors. This behavior is replaced
  with opening a small context menu that provides access to all currently
  available connector types (abutting, gap junction, presynaptic, postsynaptic).
  Optionally, through the Settings Widget, remembering the last connector type
  created can be enabled. If this is the case, regular Shift+Click behavior is
  to create the last connector type, as opposed to pre/post-synaptic connectors.


3D viewer:

- History replay now has a reset button to load the most recent version of each
  skeleton. The new pause button will stop the animation at the current time and
  pressing start will resume playback. Additionally, a slider control now allows
  to move to arbitrary points in time of the history animations. Touching the
  slider will automatically pause the replay.


Neuron dendrogram:

- Controls are now organized in tabs and a new setting was added to change the
  line width.


Miscellaneous:

- If users have sufficient permissions, they can click on individual names in
  the Project Statistics Widget to show a User Analytics window for the
  respective user and currently selected time frame.

- Pressing Ctrl+Space will now open a dialog which allows opening a widget based
  on its short name (e.g. neuron-dendrogram) or parts of it.

- A small system check widget has been added, mainly useful for development. It
  currently only supports FPS measurement and can be opened by pressing F6 and
  entering "system-check".


### Bug fixes



## 2016.10.18

Contributors: Andrew Champion, Tom Kazimiers


### Features and enhancements

3D viewer:

- Picking now respects the Z plane. if displayed. Shift+click any location on
  it and the stack viewer position is changed accordingly. This works just like
  picking nodes, except that the active node doesn't change.

- The original camera location is now restored by default after exporting an
  animation.

- A new tab called 'History' gives access to tools for replaying the
  reconstruction of the currently loaded skeletons. The time range as well as
  the time advance per frame can be adjusted. By default, the time range covered
  starts ith the first change and ends with the last one (when no custom date is
  entered). Optionally, empty bouts where no changes happend will be skipped if
  a length (in minutes) is specified. If not disabled through the 'Include
  merges' checkbox, arbors that only where merged in at one point will also be
  displayed before such a merge.  Tags on individual nodes are currently hidden
  during animation.


Review widget:

- Skeleton Analytics, which was a separate widget before, is now available
  through a new tab in the Review Widget. It still lists the same problems for
  selected neurons as before (i.e.  missing end tags).


Connector table (available through Neuron Navigator):

- Support for abutting connectors and gap junctions has been added.

- The displayed table can now be exported as CSV file.

- The listed information for connector relations with only one partner is now
  consistent with multi-relation cases: the linked node ID, node location and
  skeleton ID are shown instead of the connector location along an empty node
  and skeleton fields.

- The widget can now pull skeletons to list connectors for from other skeleton
  sources. It acts itself as a skeleton source as well and provides all result
  skeleton IDs.


Importer:

- The project and stack importer now supports the customization of when projects
  are considered known as well as what to do with known projects: ignore, merge
  or replace.

- If remote hosts are used as a project or stack import source, HTTP
  Authentication can now be used to get access to a server.


Miscellaneous:

- The tracing tool has a new icon.

- If users get a permission denied error (e.g. due to being logged out or just
  having not enough permissions), a login dialog is now shown. It allows users
  to re-login or change the user entirely. The action causing the permission
  error, is *not* repeated automatically.

- Using brackets to navigate along a skeleton now also works if the
  reconstruction data is hidden (e.g. when the space bar is held down).


### Bug fixes

- The statistics widget now properly respects time zones when grouping by day.

- Partner neurons listed in the Connectivity Widget can now be filtered again
  with regular expressions (when the filter pattern starts with "/").

- Loading stack groups through URLs now correctly respects the specified location.

- H works correctly when a virtual node is active.

- Pressing E in the Review widget now works again when a segment was completely
  reviewed.

- The group membership permission tool in CATMAID's admin area works with groups
  again.


## 2016.09.01

Contributors: Andrew Champion, Tom Kazimiers

### Features and enhancements

3D viewer:

- The 'View settings' has a new option: 'Use native resolution'. When
  activated (default), the native resolution of the current display will
  be used. This improves image quality on HiDPI displays like Apple Retina.
  If the performance penality is too big for large scenes, this can be
  switched off again.


Connectivity Matrix:

- With the help of the "Export XLSX" button, the currently displayed matrix can
  be exported as a Microsoft Excel compatible XLSX file. Colors are preserved.


Miscellaneous:

- With the help of the 'sg' and 'sgs' deep link parameters, stack groups can now
  be loaded directly through a URL.


### Bug fixes

- If multiple stack viewers are open, skeletons can now me modified again across
  all open tracing layers. E.g. with orthogonal views, selecting a node in one
  view and adding a child in another view work again.


## 2016.08.26

Contributors: Andrew Champion, Tom Kazimiers

### Features and enhancements

3D viewer:

- When coloring by creator the user colormap dialog only shows users who have
  created at least one node loaded in the view. Additionally, a new coloring
  mode, "By Creator (relevant users)", will generate a new set of colors for
  these users from the CATMAID color scheme. This is useful if many users have
  similar colors in their user profiles.

- Rendering and removal of skeletons is much faster, which is especially
  noticeable for > 100 loaded skeletons. This also enables the use of a more
  accurate node picking (Shift+click) algorithm as default, which before was
  only used as fallback.


Volume manager:

- Volumes an now be removed (given a user has the required permissions) by
  clicking on the 'remove' link in the last column of the volume table.


Statistics widget:

- If a user has the can_administer permission for a project, the Statistics
  widget now displays an extra button to open the new User Analytics widget. It
  displays the same information as the admin view with the same name. The user
  analytics view now offers also options to adjust the max. inactivity time and
  whether all write operations should be included (as opposed to only node and
  review changes).


Tracing overlay:

- Radii can now be set to be visible for no nodes, the active node, all nodes
  in the active skeleton, or all nodes through the Settings Widget.

- Pressing Ctrl + O will set a radius with the measurement tool without
  bringing up the confirmation dialog.


Miscellaneous:

- Holding Ctrl with < or > will now smoothly animate through sections as
  fast as the active layers will allow. This also works with Shift to move
  10 sections at a time.

- The log now displays times in the local timezone.

- The connector table now lists the confidence of both the link to the
  connector and from the connector to the target treenode.


### Bug fixes

- Remove major cause of CATMAID freezing after the display of an error message.

- Annotation search lists all results again, not only first page.

- When joining skeletons, the creation time of annotations is preserved.

- Fixed an error preventing branching from virtual nodes in some cases.

- The history widget correctly displays the action time, not the current time.


## 2016.08.12

Contributors: Andrew Champion, Tom Kazimiers

### Notes

- Release 2016.08.09 is deprecated. If you have it installed, please upgrade to
  this version, 2016.08.12.


### Features and enhancements

Tracing overlay:

- Node tags now respect visibility groups.


3D viewer:

- Exporting an animation will now use the rotation axis selected in the regular
  widget controls.


### Bug fixes

- The browser link preview no longer obscures the status bar when hovering
  over the tracing layer.

- Node tags are correctly hidden when holding Space.

- Fixed an error that could sometimes happen on page load for anonymous users.

- Missing documentation for curent volumes features added to


## 2016.08.09

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers

### Notes

- A virtualenv upgrade is required.
- PostgreSQL 9.5 and PostGIS 2.2 is now required. When updating, update PostGIS
  first and update all databases in which the PostGIS extension is installed by
  running "ALTER EXTENSION postgis UPDATE;". Then perform the Postgres update.


### Features and enhancements

Tracing overlay:

- Visibility groups can be defined that hide or show nodes in the overlay
  based upon filtering criteria such as neuron meta-annotations or node
  creator. Unlike the skeleton source based visibility, visibility groups can be
  toggled instantly with HOME (for group 1) or Shift + HOME (for group 2). For
  meta-annotation based visibility, this does not require using a search as a
  skeleton source, and the set of skeletons matched by the meta-annotations is
  transparently refreshed in the background. Another visibility group,
  "Always visible", establishes a set of filters for overriding hidden groups
  such that skeletons matched by these filters will always be shown.

- The active node color for virtual nodes can now be configured to be different
  than for read nodes.

- The active node color for suppressed virtual nodes can be configured to be
  different than for unsuppressed virtual nodes. Note this only takes effect
  if the "Respect suppressed virtual nodes during navigation" setting is
  enabled.


3D viewer:

- Through the "List connectors" button on the Main tab, it is now possible to
  open a connector selection with all currently loaded connectors in it.
  Skeleton visibility and connector restrictions are respected.


Importer:

- Projects and stacks available on remote servers can now be imported,
  optionally with API-key authentication on other CATMAID instances.  The remote
  data source can of course be any URL in a JSON or YAML format understood by
  CATMAID. The import section in the CATMAID documentation holds more detail on
  this. For CATMAID, the new "projects/export" endpoint provides all required
  data that is visible to the requesting user.


Graph widget:

- The new button "Open Connectivity Matrix" in the Export tab will open a new
  Connectivity Matrix widget for the current graph, including its groups.


Connectivity matrix:

- It is now possible to manually change the order of multiple entries at once,
  which is useful to move sets of entries. The "Display" tab now has a "Manually
  edit order" option. If checked, number input boxes are shown next to each row
  and column head as well as a "Re-order" button in the top-left cell if the
  table. After the numbers are adjusted to the desired order, the "Re-order"
  button will apply the new ordering. Negative and decimal numbers can be used.

- Connectivity matrices can now be exported as PDF. The "Export PDF" button on
  the "Main" tab will open a dialog explaining that this PDF export is made
  through having the browser print the table and how to enable colors. Pressing
  "Print" will show the browser's print dialog for only the table.


Settings widget:

- Tracing overlay colors customized in the settings widget are now persistent.

- Neuron name settings customized in the settings widget are now persistent.

- The delimiter used to separate annotations in a neuron name can now be
  configured in the Annotations section of the Settings Widget.

- It is now possible to configure the available page length options used by
  most tables from a central place. This is done through the "Table page length
  options" setting, which is available from the Settings widget. For widgets to
  be aware of page length setting changes, they have to be reloaded.


History tables:

- Starting with this release, CATMAID will record every single change to its
  database tables in so called history tables. This makes it possible to
  reconstruct the actual history of data (e.g. neurons) and user contributions.
  Even data deleted in CATMAID can now be recovered without touching backups.

- The log widget in the front-end provides a way to few the history: It has a
  new tab called "History", where each event that caused related database
  changes is listed.


Miscellaneous:

- Alt + Y will always create a new selection table and add the active neuron
  to it. Also works with Shift.

- Images on CATMAID's front-page are now loaded lazily, i.e. they are only
  requested and shown once they come into view. This improves performance
  significantly when displaying many sample images.

- New filter "Label Color Map" will false-color stacks of label ID images.

- The button "Add annotations to neurons" above annotation lists in the
  Neuron Navigator makes it possible to send currently selected
  annotations to other neurons. Those target neurons are selected by
  choosing a skeleton source in a dialog box, which is shown to the user
  once the button is pressed.

### Bug fixes

- Additive blending between layers now works also when filters are in use. This
  allows for proper in-browser composite generation.

- Hidden nodes are no longer selected by G or Shift + Y.

- All skeleton sources are now selectable when exporting NeuroML.

- Fix "Reset to inherited default" and "Lock this setting" buttons in settings
  controls not being clickable.

- All layouts of the color picker can be used again (i.e. resizing it).


## 2016.05.26

Contributors:: Albert Cardona, Andrew Champion, Tom Kazimiers

### Notes

- The default image base setting for the importer has changed. If you use the
  importer along with this setting, please update your settings.py file to now
  use IMPORTER_DEFAULT_IMAGE_BASE instead of CATMAID_IMPORT_URL. The semantics
  stay the same.


### Features and enhancements

Graph widget:

- If a skeleton is appended that already exists in a group, the group's color
  and label now doesn't change anymore. Instead a info message is shown.

- Selected edges can now be removed with the help of the "Remove" button in the
  "Selection" tab. Also, a help text icon has been added to the title bar. The
  widget help window currently only contains information on how edges/links
  between nodes can be hidden.


Volume widget:

- Preview for alpha shapes is now disabled by default due to its potential
  re-computation cost.

- Convex hull and alpha shape meshes are now only automatically re-generated on
  property changes if preview is enabled.

- Saving a new volume makes sure the volume's mesh is up-to-date and will
  re-generate it if needed. Re-generations will now also show an info dialog.
  If no mesh could be generated, saving is not allowed and the edit form will
  stay open.

- Two new filters for convex hulls and alpha shapes are now available: "only
  end nodes" (optionally including the root) and "only branch nodes". These
  will restrict the base point set for volume generation.

- Alpha shapes now use the inverse of the alpha value used so far. This makes it
  easier to use since it translates directly into nanometers.

- If a synaptic connection filter is used with Alpha shapes and convex hulls, it
  is now possible to select all synaptic nodes, regardless of the partner
  skeleton (select "None" as partner neurons), and to select both pre- and
  post-synaptic nodes at the same time.

- Alpha shapes now use a different implementation which takes a little bit more
  time to compute, but doesn't require re-computation if different alpha values
  are used. This makes finding a good alpha value much quicker. The input field
  for the alpha value to use is now also a numeric field in which arrow keys and
  mouse wheel can be used to change the value. A second numeric input allows to
  change the step size of alpha value changes.

- For preview, volumes now use the color and opacity defined in the 3D viewer.


Tile layer:

- An efficient browsing mode is now available that will not load tiles at
  the periphery of the stack viewer. This is useful to reduce data use and
  browsing latency on bandwidth-limited connections. To use this mode, increase
  the "Tile area efficiency threshold" in the tile layer controls.


3D viewer:

- Meshes and volumes can now optionally be displayed with visible faces instead
  of wireframe only.

- Volume list is now updated when new volumes are added, re-opening the widget
  is not required anymore.

- Transparent volumes are now displayed correctly.


Miscellaneous:

- If a client tries to perform an operation without having the most recent data
  available and the performed action is canceled, a more helpful dialog is now
  shown. It explains the situation and offers to refresh the client view
  (currently only nodes in the tracing layer are refreshed).


Administration:

- The image data importer available from CATMAID's admin interface supports now
  the specification of stack groups. It can also apply custom translations when
  mapping imported stacks to imported projects.


### Bug fixes

- Creating nodes using the Z key without other nodes in close proximity works
  again.

- Zoom level slider initialized correctly for stacks with eight zoom levels.

- Showing connector info for edge in Graph widget (Alt+Click) now works also if
  the source is a single neuron and the target a group or split node.

- Activate target node of a joined-in skeleton again.


## 2016.04.18

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Miscellaneous:

- The skeleton projection layer can now draw the colors used from the selected
  source. This is now the default and can be changed in the settings widget with
  the help of the "Use source colors" checkbox.

- Unavailable images on CATMAID's front pages are now displayed as a gray
  placeholder box, instead of the broken image icon of the browser.

- A new volume type was added: alpha shapes can now be created in practically the
  same way as convex hull volumes are created. Alpha shapes have one additional
  parameter: alpha. It is used to filter edges for result mesh and has to be
  fairly low with our spatial dimensions. Values around 0.00001 seemed to work
  well in some cases. The preview of alpha shapes is disabled by default, because
  they can take much longer to compute.

- Materialized virtual nodes have now the correct edition time set, which make
  operations like adding a child to a virtual node work again (state checks
  prevent this with wrong edition time).

- The neuron search will now show a warning and cancel a search if a query
  annotation doesn't exist and the query term doesn't start with a forward
  slash (used for regular expressions).


### Bug fixes

- Creating synaptic connections from connector nodes across sections works
  again.

- Inserting a node along an edge will now render correctly right after using
  ctrl+alt+click.

- Merging two skeletons while the losing skeleton was loaded into another widget
  (e.g. Selection Table) doesn't trigger an error anymore.

- Undoing confidence changes works again.


## 2016.04.15

Contributors: Albert Cardona, Andrew Champion, Daniel Witvliet, Stephan Gerhard, Tom Kazimiers

### Notes

Starting with this release CATMAID uses a new database migration system. To
update an existing CATMAID instance safely, please follow these steps:

1. Make sure you have CATMAID updated to the last release (2015.12.21),
   including all database migrations and up-to-date Python packages.
2. Upgrade to this version (or a newer one) and update pip and all Python
   packages (in within your virtualenv), South can be removed afterwards:

   ```
   pip install -U pip
   pip install -r requirements.txt
   pip uninstall south
   ```

3. Remove the following variables from settings.py file (in
   `django/projects/mysite/`): `TEMPLATE_DIRS`, `TEMPLATE_DEBUG`

4. Fake initial migrations (and only the initial migration!) of the
   `contenttypes` app and apply its other migrations:

   ```
   python manage.py migrate --fake contenttypes 0001_initial
   python manage.py migrate contenttypes
   ```

5. Fake initial migrations (and only the initial migrations!) of all used
   Django applications to register current database state:

   ```
   python manage.py migrate --fake admin 0001_initial
   python manage.py migrate --fake auth 0001_initial
   python manage.py migrate --fake authtoken 0001_initial
   python manage.py migrate --fake catmaid 0001_initial
   python manage.py migrate --fake djcelery 0001_initial
   python manage.py migrate --fake guardian 0001_initial
   python manage.py migrate --fake kombu_transport_django 0001_initial
   python manage.py migrate --fake performancetests 0001_initial
   python manage.py migrate --fake sessions 0001_initial
   python manage.py migrate --fake sites 0001_initial
   python manage.py migrate --fake taggit 0001_initial
   ```

6. In the future no syncdb step is required anymore. Continue with the rest of
   the regular update procedure:

   ```
   python manage.py migrate
   python manage.py collectstatic [-l]
   ```

This procedure will only be required for upgrading an existing instance to a
release newer than 2015.12.21. It won't be needed to migrate from newer
releases.

Also note that if you are running an Apache/mod_wsgi setup (or referencing
django.wsgi), you have to re-generate your configuration with:

   ```
   ./django/create_configuration
   ```

Additionally, PostgreSQL is now required to be of version 9.4.


### Features and enhancements

Tracing overlay:

- Colors of skeleton nodes and edges in the tracing overlay can now be
  configured to follow colors from selection tables. To configure which
  skeleton sources to use to select colors, click the skeleton source control
  icon (the gear) in the title bar of the stack viewer.

- Visibility of skeletons in the tracing overlay can also be controlled by
  skeleton source subscriptions. To enable this, check "Hide skeletons not
  in the skeleton source subscriptions" in the Settings widget under Tracing
  Overlay > Skeleton colors. Note that it the tracing overlay may not update
  the visibility of some skeletons until a navigation action is performed.


Gap junctions:

- A new non-directional connector type for gap junctions can now be created
  when tracing by Alt + clicking in the tracing overlay. Edges for gap
  junctions are displayed in purple.

- Gap junction partners can optionally be displayed in a separate table in the
  Connectivity Widget by checking "Show gap junctions". This table has its
  own selections for confidence and count thresholds.


Volumes:

- The volume widget can create a new volume type: convex hulls. These can be
  created around a set of nodes from any skeleton source. Different filters can
  be combined: filters to allow only nodes that have a certain tag, a sub-arbor
  relative to such nodes (optionally occurring a definable number of times), a
  region between two tags tag or nodes that are synaptic to skeletons of another
  skeleton source. Node radii can optionally be ignored, but they are respected
  by default. A preview of the current filter set can be displayed in the first
  available 3D viewer.


3D Viewer:

- Gap junctions are displayed like synapse edges in purple.

- Stack related settings (bounding box, missing sections and z planes) are now
  moved to a tab called "Stacks".

- Stack bounding boxes and missing sections now update when stack viewer focus
  changes.

- A new sphere shading allows for a better depth perception.

- Volumes (created in the Volume Widget) can be displayed. A new selection
  control in the "View settings" tab allows to select individual volumes. They
  are colored the same way as they regular mesh. Currently, the color isn't
  updated on purpose to allow the easy creation of differently colored volumes.

- When the current Z plane is displayed, it will now have the section's images
  data mapped to it. The used zoom level (resolution) and the opacity can be
  adjusted and orthogonal stacks are supported, too.

- When restricting connectors to those shared by groups, you can now choose
  to include only those linking pre->post between the two groups in a specific
  direction.


Skeleton Projection layer:

- Instead of supporting only the display of the active skeleton, the projection
  layer can now subscribe to other skeleton sources and display multiple
  skeleton projections at the same time. The used source can be selected in the
  Settings Widget. This way, for instance, a Selection Table could provide input
  to the projection layer and effectively control which skeletons will be
  projected.  And Through its own subscriptions, the Selection Table could even
  provide a dynamic list that includes the active node.


Neuron Search:

- A search result can now be exported as CSV. Only selected rows are exported.
  The resulting CSV will contain neuron IDs and neuron names. If annotations are
  displayed, a third column includes annotations.


Undo:

- Some actions are now stored as so called commands in a history, which can be
  displayed in a dialog by pressing the F9 key. Commands in this history can are
  reversible. They can be undone either through the history dialog or by pressing
  Ctrl+Z.

- Through the history dialog, undone commands can also be redone. Of course,
  once one diverges from the list of previously undone commands by executing a
  completely new command (e.g. creating a node), redo is not possible anymore.

- The following actions are recorded into history: tag add/remove/edit,
  annotation add/remove/edit, node radius edit, neuron rename, confidence
  change, connector link/unlink and node add/insert/move/remove/.


Ontologies, classification and clustering:

- Ontology tool widgets don't reset each other anymore if they are loaded.

- The Classification Editor and Ontology Editor open sub-trees now quicker.

- Clustering ontology based classifications is much faster and works for
  multi-level ontologies on thousands of classification graphs.


Administration and Performance:

- The return type of many performance-critical queries, like querying nodes
  for the tracing overlay, is now correctly specified as 'application/json'
  rather than 'text/html'. Make sure your nginx has gzip enabled for the
  'application/json' type in its 'gzip_types' setting so that these responses
  are compressed.


Miscellaneous:

- Dragging a window into the center of another window now creates a tabbed
  window where both windows share the same area of the screen and can be
  switched between using tabs at the top of the window. Additional tabs
  can be added by dragging more windows into the center of the tabbed window.
  The active tab can be removed from the tabbed window by dragging it to
  another location in the window layout.

- Dragging a window onto the top, left, bottom, or right edge of an already
  tabbed window while holding SHIFT will add it to that location inside the
  tab.

- There is now a setting to invert the behavior of CTRL when navigating
  parent/child topology, i.e., when enabled [ and ] will navigate to the
  next real node by default, while holding CTRL will go to virtual nodes.

- Which layers are hidden when Space is held is now configurable by checkboxes
  in the Stack Viewer's layer controls.

- Scroll bar positions in widgets are now maintained when they change their
  size.

- Non-superusers can now see user analytics and proficiency reports for
  projects for which they are administrators.

- WebGL layers are now compatible with DVID stacks.

- Tile layers now have an option in the layer controls to hide the tile layer
  if the nearest section is marked as broken, rather than the default behavior
  of displaying the nearest non-broken section.

- Clustering over large sets of ontology based classification is now much faster.


### Bug fixes

- The skeleton projection layer can be used again and now renders lines with the
  same width as the tracing layer. This width can be configured in the settings
  widget.

- Color pickers will now update the color of color picker enabled DOM elements
  again.

- Fixed hiding edges with less than 2 synapses in the Graph Widget resulting
  in no edges.

- Fixed an issue where cloning the Graph Widget cloned into the wrong widget.

- Fixed an issue preventing removing split neurons from the Graph Widget.

- Fixed an intermittent exception when renaming neurons.

- Fixed a second Neuron Search widget not working properly.

- Adding a neuron to a Selection Table now re-runs the sorting scheme.

- Fixed Connectivity Matrix cloning.


## 2015.12.21

Contributors: Albert Cardona, Andrew Champion, Eric Trautman, Tom Kazimiers

### Features and enhancements

Selection table:

- A new option ("Append with batch color") allows to override the color and
  opacity of appended skeletons with the current batch color and batch opacity.
  It is deselected by default.

- Clearing the table doesn't ask for confirmation anymore. This has been removed
  for consistency with other widgets and because of the now available option to
  save/open skeleton lists.


New widget "Synapse Distribution Plot":

- For one or more neurons, plot distances of postsynaptic sites relative
	to an axon initial segment, represented by a skeleton node that is either
	computed or given via text tags.
  Each row represents the inputs contributed by a presynaptic arbor.
  Presynaptic arbors (rows) are sorted from more to less synapses.
  Presynaptic arbors can be filtered (i.e. hidden away) by a threshold
  on the number of inputs each provides, or by being listed in another
  widget that has selected skeletons.
	Individual synapses take by default the color of the postsynaptic arbor
	(that is, the arbors added via "Append"), but can be colored as well
	according to neuron colors in another widget.
  Click on an individual postsynaptic site to go to the corresponding
  skeleton node.
  Click on the legend to jump to the skeleton node representing the
  axon initial segment, relative to which all distance measurements
  where made. All presynaptic neurons are available in a separate
  skeleton source for each widget to pull neurons from.


New widget "Synapse Fraction":

- For one or more neurons, render a normalized stacked bar chart with
  the number of synapses for/from each partner skeletons (directly either
	upstream or downstream). Can group partner skeletons: add groups by
	selecting a skeleton source (another widget listing skeletons).
	Click on the legend to edit (title, color) the group, or remove it.
	Click on the legend to go to the nearest node in the partner skeleton.
	To open this new widget, open a connectivity widget and push the
	button named "Open partner chart".


Settings widget:

- Persistent settings are now scoped, so that default settings may be
  configured for an entire CATMAID instance ("global"), for each project
  ("project"), for each user ("user"), and for each user for each project
  ("session"). Only administrators have access to change project settings,
  and only superusers have access to change global settings. This allows,
  for example, administrators to set up recommended defaults for projects so
  that users only need to adjust their settings where their preferences differ
  from the project defaults. A selection box for which scope to adjust is
  at the top of the settings widget. Persistent settings will display
  information about scopes and defaults when hovering over them with the cursor.

- Administrators may also lock persistent settings so that global or project
  defaults can not be changed by users.


Graph widget:

- In the main tab, a new remove button removes skeletons in the selected
  skeleton source from the graph.


3D Viewer:

- Added new buttons under the "Export" tab to export connectors and synapses
  as CSV. And Skeletons are now exported to CSV with a new column, the radius
	at each skeleton node, and another new column for the neuron name as
	rendered by the NeuronNameService (controlled by the Settings).
	The connectors CSV contains, for each row, the connector ID, the treenode ID,
	the skeleton ID and the relation ID, mimicking the treenode_connector table.
	The synapses CSV exports two files:
	  1. The skeleton ID vs the neuron name
		2. The list of synaptic relations of any arbor visible in the 3D Viewer,
		   with columns for the presynaptic skeleton ID, its treenode ID emitting
			 the synapse, the postsynaptic skeleton ID, and its treenode ID that
			 receives the synapse.


Review system:

- Creation, deletion, and edition of synapses and relations now causes related
  nodes to become unreviewed. Changes to presynaptic relations or the connector
  itself cause all related treenodes to become unreviewed, while changes to
  postsynaptic relations affect only that specific related treenode. Changes
  to other connection relations (abutment, etc.) behave like presynaptic
  relations, propagating to all related treenodes.


Skeleton source subscriptions:

- So far some widgets allowed to synchronize their skeleton list along with
  individual property changes. This was done through a "Sync to" selection which
  pushed this information to other widgets. This has now been replaced with a
  subscription option. Many widgets allow now to react to changes in skeleton
  lists in other widgets. Widgets supporting this got a new small chain icon in
  their title bar with which a subscription management user interface can be
  shown and hidden. Widgets that contain multiple sources, like the connectivity
  matrix, have one icon per source. A hover title will show which one to use for
  each source.

- The UI allows to add subscriptions to multiple sources which can then be
  combined through set operations. Currently sources are combined in a strict
  left-associative fashion from top to bottom of the list. When "Override
  existing" is checked, widget local skeletons are not used when subscriptions
  are refreshed and will subsequently be removed. Otherwise, the local set is
  united with the first subscription before all other subscription sources are
  applied.

- The scope of individual subscriptions can be adjusted: By default each
  subscription reacts to skeletons added, removed and updated in a source. The
  "Filter" selection allows to listen to only one of these events. For instance,
  subscribing to the active skeleton with the "Only additions" filter, allows to
  collect skeletons selected active skeletons without removing them again from
  a widget.

- By default, only selected skeletons are subscribed to. This means if a
  skeleton becomes unselected in a source it is removed from the target widget.
  If the "Only selected" checkbox is unchecked, also unselected skeletons are
  added to a target widget. They are removed when skeletons are removed from the
  source and their selection state is synced.

- All widget still feature the "From [Source] Append/Clear/Refresh" work-flow.
  The subscription UI's "Pull" button does the same as the regular "Append"
  button: a one-time sync from a source.


Miscellaneous:

- Many tracing widgets now allow a user to hide their controls. A little gear
  icon in their title bar toggles their visibility.

- Rather than only specifying annotations that are used as successive
  fallbacks for labeling neurons, neuron labels can now be specified as
  arbitrary combinations of annotation-based components using a format string.
  This is still configured in the annotations section of the settings widget.

- Volumes can now be edited when clicked on in the volume widget. This will also
  display the edited volume as layer in the active stack viewer.

- Moving a node in the tracing overlay now updates its position in the database
  as soon as the mouse is released, rather than waiting until the section
  changes.

- Changes to the CATMAID API are now documented in `API_CHANGELOG.md`.

- A docker image of a running CATMAID instance is now available for
  evaluating or developing CATMAID without needing to perform a complete
  install. The latest release is available via the "stable" tag, and the
  current development version is available via the "latest" tag. To try it:

      docker run -p 8080:80 aschampion/catmaid

  Then point your browser to http://localhost:8080. The default superuser has
  username "admin" and password "admin".


### Bug fixes

- API testing URL generated by Swagger (used for the API documentation at /apis)
  now respect a sub-directory that CATMAID might run from.

- Fixed near active node shading in the 3D viewer.

- Pre- and post-synaptic edges in the tracing overlay now update when dragging
  a related treenode.


## 2015.11.16

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Key shortcuts / mouse operations:

- Pressing \ now brings up a dialog to go to the nearest node with a label
  matching a query regex. If a node is active, this search is limited to the
  active skeleton. Shift + \ cycles through matching nodes in ascending
  distance order. Ctrl + \ repeats the last search regex without prompting.

- Deleting a virtual node with DELETE or Ctrl+Shift+click instead suppresses
  the virtual node. Suppressed virtual nodes are skipped during review. A
  setting is available to also skip suppressed virtual nodes during normal
  navigation with [ and ].


Selection table:

- Batch coloring is now much quicker.

- If the batch color button is pressed a second time the color picker will not
  only close but also will the batch coloring be re-applied. This won't happen
  if the color picker is closed by clicking somewhere else.

- The status text line at the bottom of the table includes now the number of
  selected neurons. This is helpful when a filter is active and more neurons are
  selected than visible.

- Sorting for visibility columns has been removed.

- Neurons part of a Selection Table can now also be filtered based on
  annotations. This can be done with the help of the input field next to the
  name filter. Like with the name filter input, pressing the Enter key will
  activate both filters and starting with a slash character ("/") will make the
  input be treated as a regular expression (to e.g. only show neurons that are
  annotated with a1 and b2, use "/a1|b2"). For now no meta-annotations are taken
  into account.

- With the help of the new "Open" and "Close" buttons, skeleton lists can be
  stored into JSON files as well as loaded from them. Along with each skeleton
  ID, the current color and opacity is stored.


Skeleton projection layer

- With the new "Skeleton color gradient" coloring mode, the skeleton's tracing
  color (currently only yellow fo the active skeleton) is used for coloring. It
  fades into downstream and upstream colors, respectively (which are black and
  white by default).

- Nodes can be selected by placing the mouse close to them (regardless if
  displayed or not) and pressing 'g'. If no node is found in close proximity
  (<50px screen space), the tracing layer's node selection is used.


Graph widget:

- Synapses can be filtered from edges based on their confidence. The confidence
  threshold is applied to the minimum of the pre- and post-synaptic relation
  confidences. Confidence filtering is applied prior to synapse count filtering.

- Synapse count coloring on edges can now be configured independently from edge
  colors.


Volumes:

- A new widget, the Volume Manager, allows to create and list volumetric
  geometries. These geometries are not yet displayable and for now only
  box volumes can be created. The widget is available through a new 3D box
  icon, last in the list of tracing tool widgets.

- New nodes can now be tested for intersection with a certain volume. The
  Tracing section of the settings widget allows to choose a volume
  against which new nodes will be tested. If they are outside of it, a
  warning will be shown.


Neuron Search:

- Partial annotations as well as regular expressions are now supported for
  searching. If the text entered in an 'annotated' search field matches a single
  existing annotation (i.e. one that would also show up in the auto-completion),
  it is used as search constraint, just like before. However, if no matching
  annotation was found, the input text is treated as a regular expression on
  annotation names if it starts with a slash character ('/'), otherwise it is
  treated as a regular search pattern over all annotations. For instance,
  finding all things that are are annotated by either A1 or B2 would look
  like '/A1|B2' or requiring annotations that end on 'xyz' could be searched for
  by '/xyz$'. This also works with sub-annotation queries.


3D viewer:

- Different neuron visibility modes are now available for animations. A
  drop down list replaces the check-box and an option dialog is shown if
  a particular animation mode requires user input. Besides the 'show one neuron
  per rotation' mode, there is now also the 'Show n neurons per rotation' mode
  and a mode which uses a pattern to explicitly define the visibility of
  particular neurons after a particular rotation. The animation export now uses
  the visibility mode selected in the 3D viewer.


Administration:

- CATMAID has been able to use DVID as a project/stack back-end and as a
  image source for quite a wile now. To make the latter option easier to setup,
  a new admin tool is available to create CATMAID stacks based on a DVID server.
  It can be found in the "Custom views" section of CATMAID's admin interface,
  labeled as "DVID stack importer". With the help of this tool on can inspect
  all available repositories and data instances on a DVID server and create a
  stack based on one data instance. CATMAID will make sure that all
  pre-conditions are met by a stack created this way.


Miscellaneous:

- By default new widgets will now select the last widget created as skeleton
  source. If wanted, this can be adjusted to the previous behavior (always
  select 'Active skeleton') through the 'Auto-select widget created last as
  source for new widgets' option in the settings widget.

- Multiple stacks opened through a URL can now optionally be opened in the same
  stack viewer window by adding "&composite=1" to the URL.

- If an already reviewed node is moved it will now become unreviewed again.

- Links clicked in the message menu will now open in a new page.


### Bug fixes

- The skeleton projection layer will now update automatically on skeleton
  changes like new or removed nodes as well as splits and merges. It will also
  not complain anymore if a connector was selected.

- Text rendered in the 3D viewer is now upright again (instead of upside-down).


## 2015.10.19

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Scripting:

- The widget instance associated with the focused window can be retrieved with
  the convenience function `CATMAID.front()`.


Orthogonal views and multi-channel data:

- Stack groups can be used to relate different stacks to each other within one
  project, e.g. to make clear that some stacks are different orthogonal views or
  different channels of the same dataset. If there are stack groups defined in a
  project, they are for now available through the "Projects" menu, which
  provides sub-menus for stacks and stack groups for each project. When opened,
  the stacks of a channel based stack groups are added as layers to the first
  stack. Ortho-view stacks are all opened in a separate stack viewer.

- If a stack group consists of the three different orthogonal views for a
  dataset, the window layout is adapted automatically as soon as the stack group
  is opened. The layout will be a four-pane layout in which the left half of the
  screen is the XY view on top of the XZ view and the right half of the screen
  is the ZY view on top of a selection table.

- Since stack group are instances of the 'stackgroup' class, they can be
  referenced from within ontologies. All projects now have a 'stackgroup' class
  and the relations 'has_view' and 'has_channel' created by default. They are
  also created for projects that don't have them, yet.

- Stack groups can be created and managed from with the admin interface through
  either the new Stack group page or while editing/creating a stack.


3D viewer:

- Skeletons can be shaded by distance from a plane through the active node. The
  plane can either be a Z-plane in project space or a plane normal to the ray
  from the camera to the active node.

- New "Count" button to count the number of pre- or postsynaptic sites, or the
  number of treenodes tagged with a given text tag, within a distance of the
	active node in the selected arbor along the cable of the arbor, or within a
	given Euclidean distance for any arbor present in the 3D viewer.


Tile layer:

- WebGL rendering is now compatible with orthogonal views.

- Tiles can now be rendered either with linear pixel interpolation (previous
  default behavior) or nearest neighbor interpolation. This is controlled by
  the "Image tile interpolation" setting.


Graph widget:

- When growing by circles, the set of neurons added can be filtered to include
  only those with annotations matching a regex.


Miscellaneous:

- A new color picker replaces the color wheel. The new control hovers over other
  elements so it can be moved, has color memory slots, defaults to a smaller
  size and can be resized to show input elements for different color spaces. To
  save a color in a memory slot, click on the rectangle containing the small
  circle next to the memory slots.

- Documentation for some HTTP API endpoints is now available from your CATMAID
  server at the `/apis/` URL.


### Bug fixes

Tile layer:

- Fixed a major WebGL tile layer GPU memory leak.


3D viewer:

- In orthographic mode, the correct depth ordering is now used again.


Selection table:

- Color sorting works again.


Miscellaneous:

- An error no longer appears when selecting an un-annotated skeleton while
  neuron labels are configured to use a meta-annotation.


## 2015.9.11

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Neuron Navigator:

- It is now possible to remove multiple annotations at once from a neuron. A new
  column is added to annotation tables, each annotation row has now a checkbox
  in its first column. A click on the de-annotate link in this column's header
  or footer will remove all selected annotations from the current neuron.


Tracing:

- If a single-node skeleton is merged into another skeleton, no merge dialog is
  now shown by default. All annotations of this single-node skeleton are merged
  into the target skeleton without asking. This behavior can be changed to again
  show a merge UI if the single-node skeleton has annotations (behavior so far)
  through a new entry in the Tracing section of the settings widget.


Graph widget:

- New layout modes "dagre", "cola", "spread" and "springy". The first is based
  on DAGs (directed acyclic graphs) and the last three are force-directed. To
  note that "spread" will evenly layout neurons in trying to occupy as much
  space as possible, and also leads to symmetric-looking graphs when rendering
  multiple disconnected graphs of e.g. left and right homologous neurons. Try
  it.


Connectivity matrix:

- Descending and ascending sorting is now available for all sorting modes.

- The new 'order of other' sorting mode will try to follow the column order for
  rows and vice versa. If skeletons are not found in the reference dimension,
  they are pushed to the end.


Selection table:

- When changing the color of a neuron, all other selected neurons can be colored
  at the same time, when the new 'all selected' checkbox (right above the color
  wheel) is checked.


Neuron sarch:

- The "select all" checkbox now does what it says and selects all neurons in the
  results set.

- Pagination now works like in other widgets and the number of elements per page
  can be adjusted.

- Annotations are not loaded by default anymore, but can be shown with the help
  of the new "Show annotations" checkbox.


Miscellaneous:

- When a connector is selected, basic information about it is displayed at the
  top of the window (where otherwise the neuron name is displayed).

- A neuron search result's annotation list is now kept in sync with the rest of
  the widgets. If annotations change on a listed neuron or annotation, the
  search query is re-done.

- If only transparency is changed in the batch color picker of the Selection
  Table, the transparency alone (and not the color) of the target skeletons will
  be updated. To also update the skeleton color, the color has to be changed in
  the color picker, too.


Administration:

- Adding custom code to CATMAID's front end is now easier: Add file names to the
  STATIC_EXTENSION_FILES array variable and have your web-server point the URL
  defined in STATIC_EXTENSION_URL (defaults to /staticext/) to the folder were
  those files live. CATMAID will then load those files after its own files.


### Bug fixes

- Nodes are now correctly scaled in skeleton projection layers.

- Neuron navigator now updates if a skeleton is changed (e.g. due to a merge).

- 'Sync to' selections to push changes from one widget to another (e.g. 3D
  viewer controlled by selection table) are now updated correctly, if a selected
  target is closed.

- Changing the order of rows and columns of the connectivity matrix manually
  does now work like expected.

- From within the neuron search removed annotations will now disappear again
  from the search widget after they are unlinked.

- Using the CATMAID coloring scheme in the Selection Table is not random
  anymore.

- CSV files exported from the Connectivity Widget now respect the table ordering
  and include the target neuron names.

- Spheres that intersect in the 3D viewer (e.g. somas) don't appear broken up
  anymore.

- The 3D viewer's SVG export will now correctly calculate the size of exported
  spheres (e.g. soma tags).


## 2015.7.31

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Key shortcuts / mouse operations:

- Ctrl + [ or ] now navigates to the next real (non-virtual) parent or child of
  the active node, respectively.


Connectivity widget:

- Upstream and downstream partners can now be filtered by synaptic confidence
  in addition to synaptic count. Synaptic confidence filtering is applied before
  count filtering. Confidence is taken to be the minimum of the presynaptic
  and postsynaptic connector confidence.


3D Viewer:

- Tags matching a custom regex can be shown as handle spheres in addition to
  tags containing "uncertain" or "end". Note that after entering the regex in
  the "View Settings" tab the viewer must be refreshed from the "Main" tab
  before tag spheres are updated.

- The active node marker now resizes based on the radius of the active node.

- The active node marker can now optionally always be drawn on top of other
  objects, even if it is occluded.


Miscellaneous:

- A default neuron name can now be specified in the settings widget. Similar
  to annotations, the pattern "{nX}" can be used to add an automatically
  incrementing number to each new neuron created, starting at X. Omitting X
  will be interpreted to start from 1. This default name does not persist
  between sessions.

- Neuron navigator: neuron name and annotation search are now case-insensitive.

- The client now checks every 15 minutes whether it is the same version as the
  server. If not, an error dialog is shown prompting the user to refresh their
  browser.

- It is now possible to show a projection of the active skeleton in the tracing
  overlay. All nodes will be displayed in the current slice, but no interaction
  is allowed with them. This feature can be useful to get more context on the
  current location in the active skeleton. This mode can be toggled with F10 or
  through a new entry in the settings (Tracing Overlay > Active skeleton
  projection), where different parameters can be adjusted. The color for the
  upstream and downstream part can be independently changed and various shading
  modes can be selected (plain color, Z distance transparency, Strahler based
  transparency or cut off).


### Bug fixes

- 3D viewer: the correct synapse colors are now used when connectors are
  restricted.

- If annotations are added or removed, annotation search widgets are updated
  correctly. You can now search for newly created annotations without having to
  open a new search widget.

- The order of the selection table is now remembered before it is refreshed.

- Connectivity widget: common partners filtering now correctly enforces that
  partners are partnered with all target neurons, not just any two.

- Review widget: the skipped node warning will now only show up when in fact
  more nodes have been skipped than allowed.

- Fixed a vulnerability that allowed any user with "browse" access permissions
  to any project to execute arbitrary SQL statements on the CATMAID database.


## 2015.7.17

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Features and enhancements

Connectivity widget:

- Partners can now be filtered by a minimum threshold on number of nodes, rather
  than only being able to filter single-node partners.

- The user's review team is now an option in the partner review filter.

- Changing the review filter no longer reloads the entire widget.

- Many small performance improvements.


Selection table:

- The table layout has been streamlined with other tables in CATMAID. All
  columns except 'action columns' can now be used for sorting. Pagination is now
  done with the buttons to the right above and below the table, the page length
  can now be adjusted, too. The summary info button moved into the button panel
  while the filter input is now part of the table.

- It is now possible to add a new annotation to individual neurons without
  changing the current selection. This can be  done with the little tag icon in
  the actions column on the right. The former info button was replaced by a
  small 'i' icon and clicking the folder icon in the same column will open a
  Neuron Navigator window for the respective neuron.

- All visibility related colums can be hidden with a new checkbox in the button
  panel. This might be useful to save space if a selection table is not used to
  control a 3D viewer.


Miscellaneous:

- Neuron search: annotations can now be searched for those by users in the
  review team.

- Log: entries can now be filtered to include only actions from the user's
  review team.

- The maximum number of nodes returned to the tracing overlay is now
  configurable as a server setting: NODE_LIST_MAXIMUM_COUNT (default 5000).

- Group graph: a new lock buttons in the Selection tab allows to lock selected
  nodes, so that their position doesn't change until they are unlocked again.


### Bug fixes

- Fix display of intermediate nodes on edge between two joined skeletons.

- The last lines of the review widget were hidden sometimes. This is not the
  case anymore.


## 2015.7.6

CATMAID now uses the GPLv3 license and moved away from the stricter
AGPLv3. This move was discussed with all previous contributors and
agreed on. See the corresponding commit for more details.

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers


### Notes

This release includes database changes that require manual intervention if you
are upgrading from an existing installation. A new dependency is now required:
PostGIS, an extension to PostgreSQL. After its installation, it has to be
activated for the CATMAID database. To do so, connect to the database using a
Postgres system user. Assuming a Postgres system user named "postgres" and a
CATMAID database named "catmaid", this could be done by calling

  sudo -u postgres psql -d catmaid

Being connected to the database, PostGIS can be enabled by executing

  CREATE EXTENSION postgis;

Now PostGIS is enabled and the connection can be closed again. Now a regular
update can be performed. Please note that this update can take quite some time
to complete. On bigger neuron tracing installations, multiple hours are
realistic.


### Features and enhancements

Key shortcuts / mouse operations:

- Ctrl + mouse wheel now zooms the stack, while shift zooms by smaller
  increments.

- Pressing X in the tracing tool will begin measuring distance from the current
  cursor position. The mouse wheel can be used to measure along the stack Z
  axis. Clicking will close the measurement tool and show the final distance in
  the status bar. ESC cancels the tool.


Multi-view tracing and virtual nodes:

- Orthogonal views on a regular XY stack can now also be used for neuron
  reconstruction. If they are available as CATMAID stacks and opened while the
  tracing tool is activated, tracing data will be shown in the respective
  orthogonal views as well. Tracing can be done in these views just like in the
  regular XY view.

- When tracing, it is not required anymore to place a node in every section. If
  no node has been placed in a section, CATMAID will place a so called virtual node
  where the skeleton and the section meet. If this virtual node is modified in
  any way, e.g. tagging, joining, moving, etc. it will be created. This also
  slightly changes the way reviews work. Review information is only stored on
  real nodes.

- The review widget has a new settings: in-between node step. It specifies how
  many sections can be skipped between adjacent real nodes. This is done with
  respect to the currently focused stack. This stack is also used to determine
  in which direction to move to look beyond the start of a segment.


Stack viewer:

- Other stacks in a project can be added to an open stack view by selecting the
  "Add to focused viewer" option from the stacks menu. This allows multiple
  stacks to exist in the same view like overlays, while accounting for
  differences in translation and resolution. The navigator will expand the
  available zoom levels to accomodate the maximum and minimum zoom possible in
  all of the open stacks.

- Tile layers for stacks added to a viewer can be removed from a viewer via an
  "x" in the tile layer control.

- Multiple viewers into the same stack can now be opened.

- Each stack viewer can be toggled between coupling its navigation with other
  open stack viewers. Toggle this via the "Navigate with project" checkbox in
  the tile layer control.


Tile layer:

- New filter (WebGL only): intensity thresholded transparency


3D Viewer:

- Connector restriction can now explicitly be turned on and off with a pull
  down list. One can select between "Show all" (i.e. restriction turned off),
  "All shared connectors" will only show connectors with partners in the current
  selection and "All pre->post connectors" will only allow connectors with at
  least one presynaptic partner and one postsynaptic partner in the current
  selection. The last option, "All group shared" allows to select two skeleton
  sources (e.g. two selection table) and it will only show connectors that are
  part of the 3D viewer and that connect between both selected groups of
  skeletons. There is also a pre->post enforcing variant of it.


Neuron search:

- The name displayed for neurons now follows the same naming mechanism used for
  other widgets. It can be controlled through the settings widget and will
  automatically update if a neuron name is changed.


Miscellaneous:

- In the connectivity widget, upstream and downstream thresholds can now be set
  at once for all seed neurons. Two drop down controls used for this will be
  displayed if there is more than one seed neuron.

- Treenode Table refurbishing: far faster, supports multiple skeletons, can do
  tag search with regular expressions and lists the skeleton treenode ID.

- Rows and columns of the connectivity matrix can now be moved around with
  little buttons that appear when the mouse is over row and column header cells.

- There are now three options to change focus if a pointer enters a window:
  don't change focus (how it has been so far), focus stacks (will activate
  stacks when hovered, but won't change focus for other windows) and focus all
  (will change focus to every window hovered). The default will be stack focus
  follows the pointer. The settings widget makes these options available in
  general settings area.

- There are three new controls in the split/merge dialog: Toggle the
  display of input and output markers on neurons in the embedded 3D viewer and
  select which shading method is used (default: "active node split").
  Alternatively, "Strahler index" coloring can be used, which helps with
  depth perception.

- Attempting to reload a CATMAID browser tab or go back in history, will now
  result in a warning dialog, asking for confirmation. It makes clear that
  CATMAID's window layout and content won't be saved if the acton isn't
  canceled.


Administration:

- Now that virtual nodes are available, existing database can (but don't have
  to) be optimized. A new management command will look for straight skeleton
  parts that are not referenced in any way and prunes them. In other words, if
  there are three successive collinear nodes and the middle one is not
  referenced, it will be removed.

  manage.py catmaid_prune_skeletons


### Bug fixes

- The Neuron Search widget doesn't throw an error anymore when a neuron listed
  in it is merged.


- There is no longer a race condition in the database during concurrent
  split/merge of a skeleton and creation of a treenode in that skeleton. While
  this is not a comprehensive guarantee of conflict-free concurrency, it does
  remove the most likely scenario resulting in corruption of the database model.


## 2015.5.27

### Bug fixes

- Fix radius based neuron selection in tracing window.


## 2015.5.19

Contributors: Tom Kazimiers


### Features and enhancements

Key shortcuts / mouse operations:

- Cycling through open end nodes will now only visit the root node if it is an
  actual leaf. That is, when it has only one child node and is untagged.


3D Viewer:

- A light background shading variant for connectors was added. It uses a darker
  cyan color which provides more contrast if a white background is used.


Miscellaneous:

- The location of messages and notifications can be configured in the settings
  widget. The default location is still the upper right corner.

- If the node display limit is hit while panning the field of view in tracing
  mode, node refresh will be temporary disabled. Once the mouse button is
  released again an no further panning happens within one second, node update is
  reset to normal. This allows for smoother panning if many nodes are visible.


### Bug fixes

Review system:

- Review teams are now respected when Shift + W is used to jump to the next
  unreviewed node.


3D viewer:

- Skeletons with other coloring than "Source", will now be visible when exported
  as SVG in the 3D viewer.


Miscellaneous:

- Skeletons added to a selection table, will now honor the table's "global"
  settings for pre, post, meta and text visibility.

- If an annotation is removed from a neuron, the annotation itself will be
  deleted, too, if it is not used anywhere else. Now also meta annotations of
  the deleted annotation will be removed (and their meta annotations...), if
  they are not used anywhere else.


## 2015.5.11

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers

### Features and enhancements

Connectivity widget:

- Partner filtering now supports regular expressions when the first character
  of the search input is "/".


Treenode table:

- *REMOVED*: Radii can no longer be edited by clicking on their cell in the
  table.


Connectivity matrix:

- The tracing tool has got a new widget: a connectivity matrix. It can be opened
  with the "M" frame icon next to the button for the connectivity widget. To use
  it, one has to append skeletons for its rows and columns. Skeletons can also
  be added as group. Each cell shows two sub-cells, the first one shows the
  number of synapses from row to column and the second one the number synapses
  from column to row. When a synapse count number is clicked, a connector
  selection is opened, that contains the corresponding synapses. Both pre- and
  post-synaptic count cells can be colored individually. By default a coloring
  similar to the tracing layer's red and cyan is used. There are also color
  gradients available to produce heat maps (i.e. color cells based on the
  actual synapse count).

- Graph widget: ability to split neurons by text tag on their skeletons. It's the
  "Tag" button under the "Subgraph" tab. Enables you to manually define regions
  on a neuronal arbor (like axon and dendrite, or multiple dendritic domains)
  and then have them be represented each as a node in the graph. The skeleton
  will be virtually cut at the nodes containing the tags, with the tagged node
  belonging to the downstream part (relative to the root node).


3D Viewer:

- Color mode "Downstream of tag" is now a shading mode.

- New synapse coloring mode "Same as skeleton". If you then hide the
  skeletons and show only the synapses you will e.g. see spatial tiling of ORN
  axons, each defining a glomerulus in the larval olfactory lobe.

- For PNG and SVG export one can now specify the dimensions of the result files.
  A dialog shown before exporting asks for width and height.


Neuron dendrogram:

- The horizontal and vertical spacing between nodes in the neuron dendrogram can
  now be fine tuned.


Administration:

- A new tool 'Group membership helper' has been added to add multiple users to
  multiple groups or to revoke their group membership. This can be used to
  control access over the data created by individual users.


Miscellaneous:

- A node-placement-and-radius-edit mode has been added. If enabled through the
  settings widget (Tracing > "Edit radius after node creation"), the radius for
  a node will be edited immediately after it has been created. This allows for
  easier volumetric reconstruction. In this mode, the radius circle editing tool
  is used to specify the radius. No dialog is shown once a radius is selected for
  a node and it will only be saved for the new node.

- A new connector type ("abutting") can now be created. In contrast to the
  regular synaptic connector, it can be used to represent the fact that two or
  more neurons are in abutting processes. For now this mode can be activated
  through the settings widget (Tracing > "Create abutting connectors"). For
  abutting connectors the lines representing the links to nodes will appear in a
  green color.


### Bug fixes

3D viewer:

- Adding and removing neurons and static data lead in some situations to many
  errors that were displayed on the console (and therefore not visible to most
  users) and caused minor performance problems. This has been fixed and all data
  should now be added and removed correctly.

- Following the active node should now work much more reliable. Before, it could
  happen that this stopped working after a second 3D viewer was closed.


Connectivity widget:

- Fix one cause of sluggish behavior for widgets that have been modified many
  times. Also fixes repeated alert dialogs when clicking a neuron in the
  partner tables that no longer exists or does not have any treenodes.


Neuron Navigator:

- Don't show an error if an invalid regular expression was entered for
  searching. Instead, color the search box red and show a warning message.


## 2015.3.31

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers, Stephan Gerhard

### Features and enhancements

Key shortcuts / mouse operations:

- Shift+T removes all tags from the currently active node.

- After using R to go the nearest open leaf, shift+R cycles through other open
  leaves in the skeleton in order of ascending distance from the starting
  location. Combining alt with these operations orders open leaves by most
  recent creation instead of distance.

- Ctrl+Y removes the active skeleton from the last used selection widget.

- Shift+Y selects skeletons within a radius of the active node in the tracing
  layer and adds them to the last used selection widget. Ctrl+shift+Y works in
  the same way to remove skeletons from the last used selection widget.

- If the next (or previous) branch/end point is already selected when V (or B)
  is pressed, the view will center on it nevertheless.

- If the mouse is over the stack when zooming, the view will recenter so that
  the same stack location remains under the mouse at the new scale.

- During review, Q and W during will refocus on the last reviewed neuron if
  review is interrupted (another node is selected), regardless of the auto
  centering setting. If one looks beyond the current segment, the last reviewed
  node will be selected by Q and W as well, but auto centering is respected.


Review system:

- New "Reviewer Team" system allows filtering reviews in visualizations and
  statistics to include only those by particular reviewers. Each user can
  control which reviewers to include in her team. A date can be configured for
  each reviewer in the team, so that only reviews from that reviewer after this
  date are included.
  * A user's reviewer team is configured through the Settings widget.
  * The review widget includes a team column between the user and union columns.
  * The percent reviewed column in the selection widget can be set to team or
    union.
  * Team review coloring is available in the 3D viewer and group graph.


3D viewer:

- With Ctrl + mouse wheel, only the camera is moved in target direction, the
  target stays fixed. If Alt + mouse wheel is used, the target moves as well.

- The CSV export not also includes the parent ID for each node, which can be
  used to reconstruct the topological tree.

- The auto-created selection widget is now 50% smaller, giving more vertical
  space to the 3D viewer.

- With the help of controls of the Animation tab, simple animations can be
  played. Currently, rotation around the X, Y and Z axis as well as the current
  "up" direction of the camera. is supported. The back-and-forth mode will
  reverse rotation direction once a full circle is reached. With the help of the
  stepwise visibility option, individual neurons can be made visible after a
  certain amount of time the animation is running. Additionally, neurons can be
  made sequentially visible after each rotation.

- Animations can also be exported as WebM movie file. The "Export animation"
  button in the Export tab, will show a dialog with basic export settings. Like
  with the other view export options, the current 3D view setup is used. The
  frame size can be adjusted in the export dialog. Creating the file can take
  some seconds and currently only works for the Chrome browser (due to the lack
  of WebP support in others). The resulting WebM video file can be converted to
  any other format using e.g. VLC player, if needed.

- New shading mode "synapse-free chunks". Has one parameter, the minimum amount
of synapse-free cable to consider between two consecutive synapses, adjustable
from the "Shading Parameters" tab.

- New shading mode "dendritic backbone". Depends on 'microtubules end' tags, or
will approximate twigs by using the Strahler number entered in the "Shading
Parameters" tab.

- The view settings tab now contains a control to scale the size of the node
  handles (e.g. active node, special tags).


Tile layer:

- Tiles can now be rendered with WebGL, which enables new visualization features
  and fixes some flickering issues. Enable via "Prefer WebGL Layers" in
  Settings. The WebGL renderer is currently considered experimental and may have
  stability issues on some clients. See
  https://github.com/catmaid/CATMAID/issues/186#issuecomment-86540706 for
  details on using WebGL layers with your image stack host.

- The blend mode used to combine stacks and overlays is now configurable when
  using WebGL. This greatly improves visualization of confocal and other
  multichannel data. Blend mode is selectable from the layers control, activated
  via the toggle at the bottom left of the stack view.

- Filters can be applied to layers when using WebGL. Filters can be added and
  removed from layers through the layers control. Available filters currently
  include:
  * Gaussian blur
  * Color inversion
  * Brightness, contrast and saturation adjustment
  * Color matrix transform


Connectivity widget:

- It is now possible to remove added neurons again. Each row of the table of
  target neurons now contains a small 'x' icon in the first column to remove it.

- The selection column is not included anymore in the CSV export.


Analyze Arbor:

- Options are provided to approximate twigs by using a branch Strahler number
defined in the "Options".

- Dimensions of the pie charts and XY plots is now configurable from the
"Options" dialog.


Graph widget:

- New button to "Clone" the graph widget: opens a new widget with identical content.

- New buttons to "Save" and "Open..." to/from JSON, so that complex graphs can be
reloaded later on. Skeletons not present in the database are not loaded.


Miscellaneous:

- Selecting tags for highlighting in the neuron dendrogram

- Synchronization between widgets was improved. Deleting a neuron in one widget,
  will remove it from other widgets as well.

- Hovering over the CATMAID text on the front page will display CATMAID's
  version.


Admin:

- For projects, stacks, overlays and data views there is now the option to
  duplicate objects from within the admin view. To copy objects without their
  relations, there is now a new action in the list view's action menu. To
  duplicate an entity with its relations, select the object and use the "save as
  new" button.


Export:

- A basic JSON export of all treenodes and connectors of the selected neurons is
  now possible.


### Bug fixes

Tracing overlay:

- Trying to remove a non-existent tag from a node now doesn't show an error
  dialog anymore, but only a notification.


Key shortcuts / mouse operations:

- Fix bug where tagged nodes were not considered open by R regardless of tag
  content.


Neuron search:

- Make neuron names wrap and use the next line, if there is not enough space for
  it. This makes the table not expand in width until the name fits anymore.


3D viewer:

- Picking a synapse or other selectable elements is now more robust and now
  works also in orthographic mode.

- The projection mode (orthographic or perspective) is now also stored in a
  saved view.

- The 3D viewer's drawing canvas is now correctly sized again. Since the tab
  panel has been introduced, the 3D viewer has been too high. Now the
  pre-defined views (XY, XZ, ZY, ZX) are display correctly again, i.e. the whole
  bounding box is now seen again.

- Performance enhancement when smoothing skeletons with a Gaussian by avoiding
to update the same Vector3 instances twice.


Reviews:

- Pressing 'E' during review will now go to the next unreviewed segment as seen
  from the currently reviewed one. Before, the first unreviewed segment as seen
  from the top of the table was selected.

- Pressing 'Q' on the first node (leaf) brings one back one section to check if
  the segment really ends. Pressing 'W' afterwards now brings one back to the
  first node, not the second like it has been before.


Connectivity widget:

- CSV export works again.


Miscellaneous:

- Vertical resizing of widgets now doesn't lead to strange size changes anymore.

- An alternative DVID tile source was added to support its multiscale API.


## 2015.1.21

Contributors: Albert Cardona, Andrew Champion, Tom Kazimiers

### Features and enhancements

General neuron tracing:

- A new radius editing option has been added that propagates from the current
  node root-ward to the previous node with an undefined radius (exclusive).
  Here undefined is taken to be a negative radius, since though the column
  default is 0 Django initializes it to -1.

Miscellaneous:

- Users need now to confirm the closing of the last stack.


### Bug fixes

Tracing overlay:

- A label is now hidden when the mouse hovers over it. Note that this only works
  for one label at a time, so it is not effective for overlapping labels. A
  robust solution would require more expensive event propagation over label
  elements.

- Fullscreen on OS X Safari should now work, too.

- Nodes and arrows are now drawn in order: lines, arrows, nodes, labels

- Fix bug that could occur during radius propagation when the previous node
  already had a radius defined.

- Fix mouse handlers of node and error drawing, which were broken by adding
  ordered drawing.


Synapse clustering:

- A long-standing error has been fixed where a few nodes where added to an
  undefined cluster.


Group graph:

- The root node computation has been fixed.

- Listing edge synapses now also works with split grouped neurons.


3D viewer:

- Make synapse clustering fetch synapses properly (like it is done in the Group
  Graph).


## 2015.1.15

Key shortcuts / mouse operations:

- A new shortcut key to navigate to a node's child has been added: ]. It
  behaves like V by navigating to the largest descendant branch. With
Shift+] one cycles through sibling branches in order of descending
size.

- For consistency, the P shortcut to navigate to the parent has been
replaced with [.

- Navigation to the next branch has changed a bit: The V key now moves
to the next branch node or end of the largest descendant branch of the
active node, and subsequent presses of shift+V cycle through other
possible descending branches in order of decreasing size.

- While editing the radius of a node with the help of the surrounding
circle, a click will confirm the current radius (not only pressing 'o'
again). The radius editing can now also be canceled with the Esc key.

- With Ctrl+Alt+click one can now insert a node into the active
skeleton between two existing nodes.


Zoom:

- Zooming is now also possible in smaller steps. The plus and minus
buttons zoom in steps of 1 and with having the Shift key pressed
additionally, steps of 0.1 are used.


3D viewer:

- New export options (Export tab):
  * CVS representation of the rendered skeletons;
  * PNG and SVG image of the current view;
  * SVG catalogue of the current view. The catalogue contains each
neuron a separate panel on the same SVG document--very useful to
generate figures for a paper. Options are provided to sort and arrange
panels, and to define pinned neurons that appear in each panel (e.g. a
somatosensory axon that acts as reference for each neuron connected to
it).

- New "Spatial select" button (Main tab) that allows to select
skeletons near the active node or connected to the active skeleton,
within a specified distance. Matching skeletons will be shown in a new
selection table. This is useful to e.g. select all single-node
skeletons connected to the dorsal lobe part of a Kenyon cell.

- Supports orthographic projection (see checkbox in View tab) so that
no perspective distortion is applied and distances become comparable
between different parts of the view.

- The 3D viewer now has the option to follow the active node (View
tab). This acts like clicking "Center active" after each active node
change.

- One can bookmark views in the 3D viewer, by pressing "Save view" in
the Main tab. Views can be loaded by selecting them from the drop down
list next to the button. These bookmarks are currently discarded once
CATMAID is reloaded.

- When Ctrl is pressed while zooming in the 3D viewer with the scroll
wheel, the camera is actually moved towards its target. This is useful
to overcome zooming limits and strong perspective distortion due to a
high focal length when zooming.


Selection table:

- "Randomize colors" in the selection table was replaced by a drop
down list with different color schemes and the button "Colorize" to
apply the selected one. The default is the coloring scheme that
existed before. Some of the new color schemes are from Cynthia Brewer
(see http://colorbrewer2.org/ ).

- Neurons are activated by clicking on the name, like in all other
widgets. The green tick icon has been removed.

- New check box for each neuron called "meta" to toggle the display of
extra information like the orange spheres for specially tagged nodes
(TODO, uncertain end, etc.) or low confidence nodes.


Dendrogram:

- Can now collapse nodes belonging to a branch that ends in a node
tagged "not a branch".

- One can now highlight multiple tags in the dendrogram by separating
them with commas.


Graph widget:

- Subgraphs (like axon & dendrite) can now be reset in the graph widget.


Annotations:

- When adding an annotation, the pattern "{nX}" can be used to add an
automatically incrementing number to each neuron annotated, starting
at X. So if e.g. three neurons are annotated at once with the
annotation "test-{n5}", the first one is annotated with "test-5", the
second one with "test-6" and the last one with "test-7". Omitting X
will be interpreted to start from 1.

- When skeletons are joined, the name of the "losing" skeleton can now
be added as an annotation to the "winning" skeleton right in the
dialog. Its checkbox is unchecked by default, if the name follows the
auto-generated name pattern "neuron 12345".


Searching:

- The neuron name input boxes in both search widgets will now remember
entries that have been used before.


Handling the unexpected:

- A general error handler has been added so that CATMAID should
hopefully not crash anymore, even if an error occurs. In such
situations an error dialog is shown and the error is logged on the
server so that we can investigate better what went wrong.


General neuron tracing:

- A robust synapse clustering method was added: centrifugal synapse flow
centrality. Many widgets now support a new method for finding axons based on it
(e.g. in the 3D viewer as a shading method.

- The connector table now displays the confidence of each link

- Basic import/export support was added. There are two new management commands
  that can be used by admins to import and export tracing data.


Users and groups:

- Support user registration (disabled by default). Default user groups for new
  users can be set.


Miscellaneous:

- A new ROI tool was added, which can be activated for each user through the
user settings. It currently supports only the creation of new ROIs. Additional
sub-tools will be added for more functionality.


Contributors:

This update brought to you by Tom Kazimiers, Andrew Champion, Stephan
Gerhard and Albert Cardona.
