This changelog notes changes to API endpoints that are documented and listed
through Swagger. Changes to undocumented, internal CATMAID APIs are not
included in this changelog.

## Under development

### Additions

- `GET /{project_id}/nodes/nearest`:
  Replaces `POST /{project_id}/node/nearest`. The parameters are the same, but
  the API allows now to look globally for the nearest node in the project, if no
  skeleton ID or neuron ID is provided.

- `GET /{project_id}/nodes/most-recent`:
  Replaces `POST /{project_id}/node/nearest`. A skeleton_id parameter can still
  be provided, but now also a user_id parameter is available to further
  constrain.

### Modifications

- `POST|GET /{project_id}/node/list`:
  Offers a new optional parameter "min_skeleton_length", which can be used to
  constrain the returned neurons to only those of at least this cable length.

- `POST|GET /{project_id}/pointclouds/`:
  Offers a new optional parameter "order_by", which accepts the strings 'id' and
  'name' to define in what order the list of pointclouds should be retuned
  (default: id).

- `POST /{project_id}/landmarks/{landmark_id}/`:
  Offers a new optional parameter "group_ids", an array of integers, which
  allows to set the landmark group memberships of a specific landmark. The new
  boolean parameter "append_memberships" allows to only append new group IDs as
  memberships, without removing any. Otherwise the whole set of memberships is
  replaced.

- `POST /{project_id}/skeletons/import`:
  The new parameter `skeleton_id` makes it possible to request a particular
  skeleton ID during import, just like it is done for neurons using `neuron_id`.
  If a skeleton or neuron with this ID exists already, a new object is created
  and the existing one is not touched. If an error should be raised instead, set
  the `auto_id` parameter to `false`. If instead the passed in IDs should
  replace existing data, the `force` parameter can be set to `true`. Both
  options apply to both neurons and skeletons.

- `POST /{project_id}/skeletons/connectivity/csv`:
  The new optional parameter `names` makes it possible to pass in a mapping of
  skeleton IDs to names used in the CSV export as column and row headers. If
  this parameter is not provided, the plain skeleton IDs will be used as it was
  done before. If it is provided, it has to be a list of two-element lists, each
  of the form [<skeleton-id>, <name>], which provides the mapping.

- `POST /{project_id}/skeletons/connectivity`:
  The `source_skeleton_ids` parameter can now also be specified in regular form
  format (multiple arguments with the exact same name), rather than only the
  square braces style.

### Deprecations

None.

### Removals

- `POST /{project_id}/node/nearest`:
  Replaced with `GET /{project_id}/nodes/nearest` (note the plural of nodes).

- `POST /{project_id}/node/most-recent`:
  Replaced with `GET /{project_id}/nodes/most-recent`.


## 2018.11.09

### Additions

- `POST /{project_id}/skeletons/cable-length`:
  The POST version of the already existing GET endpoint. It allows passing in
  more skeleton IDs for which to get the cable length.

- `POST /{project_id}/skeletons/connectivity-counts`:
  Allows to get the number connector links per relation type for each passed in
  skeleton. Also accepts GET parameters.

- `POST /{project_id}/skeletons/connectivity_matrix/csv`:
  Return a CSV file containing the connectivity matrix for the passed in `rows`
  and `columns`.

- `POST /{project_id}/skeletons/sampler-count`:
  Return the number of samplers linked to each skeleton in the passed in
  `skeleton_ids` list.

- `GET /{project_id}/skeletons/{skeleton_id}/sampler-count`:
  Return the number of samplers linked to this skeleton.

- `GET /{project_id}/labels/detail`:
  Returns a list of of label objects, each with a name field and an ID field.

- `POST /{project_id}/volumes/import`:
  Import volumes as STL files.

- `GET /{project_id}/volumes/{volume_id}/export.{extension}`:
  Export a particular volume. Currentl only exports AS STL are supported.

- `GET /{projec_id}/stats/cable-length`:
  Get the top N largest skeletons. N can be specified using the 'n_skeletons'
  parameter.

- `POST /{project_id}/volumes/skeleton-innervations`:
  Get a list of all volume/skeleton combinations that intersect. Skeletons are
  provided with a 'skeleton_ids' parameter. This can be constrained by volume
  annotation, cable length and node count.

- `POST /{project_id}/volumes/`:
  Previously only the GET method would be supported. With the introduction of an
  optional `volume_ids` parameter, POST can be used as well. This parameter can
  be used to constrain the returned set of volumes.

### Modifications

- `POST /{project_id}/skeletons/node-label`:
  The new `label_names` parameter accepts a list of strings that an be used
  instead of or together with label IDs to get skeletons with nodes that have
  particular labels.

- `GET /{project_id}/stacks/{stack_id}/info`:
  Now includes the `comment` field for each stack.

- `GET /{project_id}/connectors/`:
  The partner data returned when the `with_partners` is set, includes now
  additionally the creator of the link and the creation and edition time (in
  epoch format).

- `GET /user-list`:
  Accepts a new boolean parameter `with_passwords` to export encrypted
  passwords, which in turn can be imported into other CATMAID instances. This
  requires the requesting user to be a superuser.

- `GET /{project_id}/skeleton/{skeleton_id}/swc`:
  A new optional parameter `soma_markers` can be supplied. It is a list of
  'tag:soma', 'radius:<n>' and 'root'. These are conditions for when a node is
  marked as soma in the SWC export. The first matching condition in this order
  wins.

- `GET /{project_id}/volumes/`:
  The return format changed. Instead of a list of volume objects an object with
  a 'columns' field and a 'data' field are returned. The data fields contains a
  list of lists, with each inner list being a volume. The entries are described
  by the 'columns' field. Along with the already returned fields, annotations
  are now retuned as well.

- `GET /{project_id}/volumes/`:
  An optional `volume_ids` parameter can now be used and the POST method is
  supported as well (to transfer larger volume ID lists). This parameter can be
  used to constrain the returned set of volumes.

- `POST /{project_id}/skeletons/connectivity`:
  A new optional option 'link_types' allows to specify which connectivity types
  should be returned. By default 'incoming' and 'outgoing' is returned.
  Additionally, the following options are allowed: gapjunction, abutting,
  attachment, close_object. The return field names have also been adapted to
  these parameters and match them. Instead of 'gapjunctions' and 'attachments',
  the fields are now named 'gapjunction' and 'attachment'.

- `GET /{project_id}/annotations/`:
  Supports now an optional boolean parameter named `simple`, which returns only
  names and IDs and is therefore much faster.

### Deprecations

None.

### Removals

None.


## 2018.07.19

### Additions

- `POST /{project_ids}/connectors/links`:
  Accepts the same parameters as the GET variant, but allows for larger
  skeleton_ids list.

- `POST /{project_ids}/skeletons/in-bounding-box`:
  Accepts the same parameters as the GET variant, but allows for larger
  skeleton_ids list.

- `GET /{project_id}/volumes/entities`:
  Return a mapping of volume IDs to their respective class instance ID.

### Modifications

- `GET /{project_id}/skeletons/in-bounding-box`:
  The `min_nodes` and `min_cable` parameters can be used to further filter the
  result. The `src` parameter can be 'postgis2d' and 'postgis3d', with the
  former being the default spatial query type. The `volume_id` parameter can
  optionally be used to return the skeletons in the bounding box of a specific
  volume, alternative to explicit bounding box. Optionally, the `skeleton_ids`
  parameter can provide a list of skeletons to test for intersections. Without
  it, all skeletons in the project are considered.

- `GET /{project_id}/skeletons/{skeleton_id}/review`:
  The user ID of each node is now returned as well.

- `POST|GET /{project_id}/node/list`:
  Offers a new optional parameter
  "n_largest_skeletons_limit", which can be used to constrain the returned
  neurons to only those of the N largest skeletons in the result set.

- `POST /{project_id}/skeleton/connectivity_matrix`:
  The new parameter 'with_locations' includes more data in the result set. Each
  connector and its contributions to the link count is returned as well.

- `GET|POST /{project_id}/skeletons/compact-detail`:
  The new parameter 'format' can now be used to returned the skeleton data in
  different formats. Supported are 'msgpack' and 'json'.

- `GET /{project_id}/skeletons/{skeleton_id}/compact-detail`:
  The new parameter 'format' can now be used to returned the skeleton data in
  different formats. Supported are 'msgpack' and 'json'.

- `POST /{project_id}/treenodes/compact-detail`:
  The `treenode_ids` parameter is now optional and two new parameters can be
  used instead: `label_ids` and `label_names`. They can be used to constrain the
  result set by their labels. This effectively allows querying treenodes and
  skeletons based on linked labels.

- `GET /{project_id/samplers/{sampler_id}/domains/`:
  Returns now also end nodes for each domain.

### Deprecations

None.

### Removals

None.


## 2018.04.15

### Additions

- `POST /{project_id}/treenodes/compact-detail`:
  Retrieve treenode information for multiple nodes in the format of regular node
  queries, accepts a parameter "treenode_ids".

- `GET /{project_id}/treenodes/{treenode_id}/compact-detail`:
  Retrieve treenode information for a single node.

- `DELETE /{project_id}/landmarks/{landmark_id}/groups/{group_id}/`:
  Delete landmark location links to the same locations from a landmark and
  group.

- `PUT /{project_id}/landmarks/groups/links/`:
  Add new links between groups, e.g. "adjacent_to".

- `DELETE /{project_id}/landmarks/groups/links/{link_id}/`:
  Delete a single landmark group link.

- `GET /{project_id}/landmarks/groups/{landmarkgroup_id}/transitively-linked`:
  Get a list of landmark groups that are linked to the referenced group using a
  passed in relation, respects reciprocal relations.

- `POST /{project_id}/landmarks/groups/materialize`:
  Create pairs of landmark groups along with their landmarks based on a simple
  description.

- `GET /{project_id}/skeletons/cable-length`:
  Get the cable length for multiple skeletons using the skeleton_ids parameter.

- `GET /{project_id}/skeletons/{skeleton_id}/cable-length`:
  Get the cable length for a single skeleton.

- `GET /{project_id}/skeletons/in-bounding-box`:
  Get IDs of all skeltons that intersect with the passed in bounding box.

### Modifications

- `POST /{project_id}/annotations/query-targets`:
  Accepts now a "annotation_reference" parameter which can either be 'id'
  (default) or 'name'. If it is set to 'name', all annotation references in
  annotated_with, not_annotated_with and sub_annotated_with are interpreted as
  annotation names instead of IDs.

- `POST /{project_id}/skeleton/split`:
  Returns now also the split location as fields x, y and z.

- `POST|GET /{project_id}/node/list` offers a new optional parameter
  "with_relation_map", which controls which relation map information is
  returned. Can be 'none', 'used' and all with 'used' being the default.

- `GET /{project_id}/landmarks/groups/`:
  Accepts the new optional parameter "with_links", "with_names" and
  "with_relations", to include links between landmark groups along with a list
  of linked landmark names and a map of used relations

- `GET /{project_id}/landmarks/groups/{group_id}/`:
  Accepts the new optional parameter "with_names" to include landmark names
  along with linked landmark locations.

- `GET /{project_id}/stats/user-history`:
  Returns actual node count in "new_treenodes" field, cable length is returned
  in "new_cable_length" field (previously new_treenodes).

### Deprecations

None.

### Removals

None.


## 2018.02.16

### Additions

- `GET /{project_id}/useranalytics`:
  Replaces `GET /useranalytics`.

### Modifications

- `GET /{project_id}/samplers/`:
  Accepts now also a boolean with_intervals parameter to return information on
  each instantiated interval in each returned domain. Implies with_domains.

- `POST|GET /{project_id}/node/list` offers a new optional parameter "src", which
  can be used to override the node provider selected by the back-end.

- `POST|GET /{project_id}/node/list` offers new options for the optional
  parameter "format": "gif" and "png" to return an imageof the tracing data.

### Deprecations

None.

### Removals

- `GET /useranalytics`:
  Has been replaced with `GET /{project_id}/useranalytics`.


## 2017.12.07

### Additions

- `POST /{project_id}/nodes/location`:
  Get the location of multiple nodes, expects a `node_ids` parameter.

- `GET /{project_id}/connectors/` now provides a new API to query connectors
  directly and not only links. The previous API is available as
  `GET /{project_id}/connctors/links/` (see below).

- `GET /{project_id}/skeletons/{skeleton_id}/neuroglancer`:
  Export a morphology-only skeleton in neuroglancer's binary format.

### Modifications

- `GET /{project_id}/connector/user-info` has been replaced with
  `GET /{project_id}/connectors/user-info`. Functionality is the same.

- `GET /{project_id}/connectors/` has been replaced with
  `GET /{project_if}/connectors/links/`. Functionality is the same.

- `POST /{project_id}/node/list` offers a new optional parameter "format", which
  is set by default to 'json', but can be set to 'msgpack' to use msgpack binary
  encoding of the result.

### Deprecations

None.

### Removals

None.


## 2017.10.02

### Additions

- `GET /{project_id}/samplers/domains/intervals/{interval_id}/details`:
  Get detailed information about a particular interval.

- `GET /{project_id}/neurons/`:
  List all neurons in a project. Optionally, the parameters created_by,
  reviewed_by, from, to and nodecount_gt can be provided.

### Modifications

- `POST /{project_id}/treenodes/{treenode_id}/info`:
  This API endpoint is changed to only accept GET requests. Using POST will
  raise an error.

- `GET /{project_id}/stats/nodecount`:
  The response format changed. Now a dictionary mapping user IDs to node counts
  is returned.

- `GET /{project_id}/stats/editor`:
  The response format changed. Now a dictionary mapping user IDs to the number
  of edited nodes is returned.

- `GET /{project_id}/projects/export`:
  Stacks include now also their translation and orientation relative to project
  space.

### Deprecations

- `GET /{project_id}/annotationdiagram/nx_json`:
  This API has a confusing name, because it uses 'annotation' differently than
  others. There are different APIs available to get skeleton IDs and treenode
  IDs.

### Removals

None.


## 2017.07.28

### Additions

None.

### Modifications

- `POST /{project_id}/skeletons/import`:
  The new 'name' parameter can be used to set the name of a new neuron.

- `POST /{project_id}/annotations/query-target`:
  A boolean 'name_not' parameter is now accepted to get results not matching the
  name passed in with the regular 'name' parameter. Also, an integer list
  parameter named 'not_annotated_with' is now supported. Like the
  'annotated_with' list, it contains annotation IDs. Results will not have the
  annotations passed in with the `not_annotated_with` list.

- `GET /{project_id}/skeletons/{skeleton_id}/compact-detail` and
  `GET /{project_id}/skeletons/compact-detail`
  Accepts two new parameters: with_reviews and with_annotations. To also return
  a list of reviews and a list of linked skeleton IDs respectively for each
  returned skeleton.

- `POST /{project_id}/volumes/{volume_id}/`
  Individual fields can now be updated selectively. Only fields that are passed
  in as arguments will be updated. This allows for instance to only change the
  name of a volume.

### Deprecations

None.

### Removals

None.


## 2017.05.17

### Additions

None.

### Modifications

- `POST /{project_id}/skeletons/connectivity`:
  If the new "with_nodes" parameter is true, the involved treenode links are
  also returned for each partner.

### Deprecations

None.

### Removals

None.


## 2017.04.20

### Additions

None.

### Modifications

- `GET /messages/mark_read`:
  This API took a message ID as parameter before and is replaced by:
  `POST /messages/{message_id}/mark_read`

- `POST /{project_id}/node/user-info`:
  The `node_id` parameter has been replaced with a `node_ids` parameter, which
  is expected to be a list of node IDs. The response maps now individual info
  objects to their respective node IDs.

- `GET /{project_id}/connectors/`
  Each result link now contains one additional column: the link's creation time.
  It replaces the edition_time in column nine. The edition time is now available
  in column ten.

### Deprecations

None.

### Removals

None.


## 2017.03.16

### Additions

None.

### Modifications

None.

### Deprecations

None.

### Removals

None.


## 2017.02.16

### Additions

None.

### Modifications

- `POST /{project_id}/node/list` and `POST /{project_id}/node/list`:
  The returned timestamps are now second based UTC epoch numbers instead of UTC
  strings.

### Deprecations

None.

### Removals

None.


## 2017.01.19

### Additions

- POST `/{project_id}/analytics/broken-section-nodes`:
  Get s list of all nodes that are currently located in a broken section of any
  stack linked to their project. Obtionally, specific skeletons can be checked.

### Modifications

- `POST /{project_id}/skeleton/analytics`
  Is renamed to `POST /{project_id}/analytics/skeletons`.


### Deprecations

None.

### Removals

- `GET /{project_id}/stack/{stack_id}/models`
  Meshes have been replaced with volumes.


## 2016.12.16

### Additions

- `GET /{project_id}/labels/stats`
  Get statistics on node label usage for the project.

- `POST /{project_id}/skeletons/node-labels`
  Return mappings from node label IDs to IDs of skeletons which include
  a node with that label.

### Modifications

None.

### Deprecations

None.

### Removals

None.


## 2016.11.04

### Additions

- `GET /{project_id}/skeletons/{skeleton_id}/compact-detail`
  Provides same functionality as
  `GET/POST /{project_id}/{skeleton_id}/[0|1]/[0|1]/compact-skeleton`, but uses
  explicit GET parameters.

- `POST /{project_id}/nodes/`
  Provides the same data as the former `POST /{project_id}/nodes/list` and takes
  the same parameters.

### Modifications

None.

### Deprecations

- `GET/POST /{project_id}/{skeleton_id}/[0|1]/[0|1]/compact-skeleton`
  This endpoint will be replaced in the future with the newly introduced
  endpoint `GET /{project_id}/skeletons/{skeleton_id}/compact-detail`.

- `POST /{project_id}/node/list`
  This endpoint will be replaced in the future with the newly introduced
  endpoint `POST /{project_id}/nodes/`. It takes the same parameters.

### Removals

None.


## 2016.10.18

### Additions

- `GET /{project_id}/connectors/`
  Replaces the `POST /{project_id}/connector/table/list` endpoint, but also
  changes the parameter names. Additionally, the "relation_type" parameter is
  now expected to contain the actual relation name instead of a numeric alias:
  The value "0" is replaced with "postsynaptic_to" and "1" is replaced with
  "presynaptic_to". See /apis documentation for details.

### Modifications

None.
- `GET/POST /{project_id}/[0|1]/[0|1]/compact-skeleton`
  The new parameter with_history allows to include historic data in th
  response.  Will also include timestamps for regular nodes.

### Deprecations

None.

### Removals

- `POST /{project_id}/connector/table/list`
  This endpoint is replaced by the `GET /{project_id}/connectors` endpoint,
  described above.


## 2016.09.01

### Additions

None.

### Modifications

None.

### Deprecations

None.


### Removals

None.


## 2016.08.26

### Additions

None.

### Modifications

None.

### Deprecations

None.


### Removals

- `GET /{project_id}/stats`
  This endpoint returned an HTML document displayed by CATMAIDs statistics
  widget.


## 2016.08.12

### Additions

None.


### Modifications

None.

### Deprecations

None.


### Removals

None.


## 2016.08.09

### Additions

- `GET projects/export`:
  Provides all available information on the structure and properties
  of projects and stacks. Supports application/json and application/yaml
  content types. A return YAML document matches the format supported by
  the importer.

- `POST /{project_id}/connector/info`:
  This endpoint replaces the `/{project_id}/connector/pre-post-infos` endpoint.
  The `pre` and `post` parameters are now optional.

- `POST /{project_id}/neurons/from-models`:
  Get the IDs of all neurons modeled by a list of entities, e.g. skelton IDs.

- `POST /{project_id}/skeletons/import`:
  Import a neuron modeled by a skeleton from an uploaded file. Currently only
  SWC representation is supported.

- `GET /{project_id}}/transactions/`
  Get a list of transaction objects, ordered by time (latest first). A sub-range
  can be specified optionally.

- `GET /{project_id}}/transactions/location`
  Get a location representing the change in a given transaction. Returns error
  if no location was found.

### Modifications

- `GET /projects/`:
  Does not include the catalogueable property of projects anymore. Use
  ontology queries to filter by the "driver_line" class for the same
  semantics.

- `POST /{project_id}/annotations/forskeletons`:
  Parameter `skeleton_ids` now correctly parses with and without explicit
  indices.

- `POST /{project_id}/annotations/query`:
  Parameter `object_ids` now correctly parses with and without explicit
  indices.

- `POST /{project_id}/annotations/query-targets`:
  Parameter `types` now correctly parses with and without explicit indices.

- `GET /{project_id}/ontology/list`:
  Return format has been made simpler, contains still same information.

- `GET /{project_id}/ontology/relations/list`:
  Return format has been made simpler, contains still same information.

- `GET /{project_id}/ontology/classes/list`:
  Return format has been made simpler, contains still same information.

### Deprecations

None.


### Removals

- `POST /{project_id}/connector/pre-post-info`:
  This endpoint was renamed to `/{project_id}/connector/info` endpoint.

## 2016.05.26

### Additions

None.


### Modifications

None.


### Deprecations

None.


### Removals

None.


## 2016.04.18

No change.


## 2016.04.15

### Additions

- `GET /{project_id}/labels/[treenode|connector]/{label_id}/`:
  Returns a list of labels for a node.

- `GET /{project_id}/connectors/{connector_id}/`:
  Returns information on a connector and its partners.

- `POST /{project_id}/skeletons/within-spatial-distance`:
  Find skeletons within a given L-infinity distance of a treenode.

### Modifications

`POST /{project_id}/skeletons/connectivity`:

- Response object now includes `gapjunctions` and `gapjunctions_reviewers`
  properties for gap junction connectors.

- Documentation has correct parameter name: `source_skeleton_ids` not `source`.

`POST /{project_id}/label/[treenode|connector]/{label_id}/update`:

- Returns now also information about what labels were added, which were
  duplicates and which labels were deleted.

`POST /{project_id}/label/[treenode|connector]/{label_id}/remove`:

- Returns now also information about which label label was eventually removed.
  If nothing went wrong the field deleted_link has the input label ID.

`POST /{project_id}/annotations/remove`:

- The return field `deleted_annotations` is now called `deleted_links` and
  continues to contain a list of class_instance_class_instance IDs that were
  removed. The new `deleted_annotations` field contains a mapping of removed
  annotation IDs to the IDs of the object they were removed from.

`POST /{project_id}/connector/delete`:

- The response contains now detailed information about the removed connector,
  including its partners.

`POST /{project_id}/node/list`:

- Edition times of nodes and connectors-links are now returned, too. Therefore
  some array indices changed.

- Link and connector types are now returned in a more general fashion. Instead
  of providing four different arrays for pre, post, gap-junction and other
  connectors (previously index 5, 6, 7, 8), each connector entry now contains
  one list with all links (index 5), each link is represented as
  [<treenode_id>, <relation_id>, <link_confidence>].

`POST /{project_id}/treenode/delete`:

- A list of removed links is now returned as well. Each entry has the following
  format: [<link-id>, <relation-id>, <connector-id>, <confidecen>].

`POST /{project_id}/treenodes/{treenode_id}/confidence`:

- Edition times of nodes and connectors-links are now returned, too. Each
  location ID in the returned updated_partners object, is now mapped to an
  object with an "edition_time" and an "old_confidence" field.

- An optional "partner_ids" parameter is now accepted. If the "to_connectors"
  parameter is set to true, the "partner_ids" parameter allows to update only
  the links to the provided connector IDs.

- An optional "partner_confidences" parameter is now accepted. If the
  "partner_ids" parameter is used, the "partner_confidences" parameter allows to
  specify an individual confidence for each selected partner.

`POST /{project_id}/skeleton/join`:

- IDs of the result skeleton and the deleted skeleton are now returned.

### Deprecations

None.


### Removals

-`[POST|GET] /{project_id}/label-for-node/[treenode|connector]/{label_id}`:
  Has been replaced with:
  `GET /{project_id}/labels/[treenode|connector]/{label_id}/`


## 2015.12.21

The CATMAID API now authorizes requests using an API token tied to your
account instead of your username and password. To obtain this token,
open the CATMAID client in your browser, hover your cursor over your name
(next to the "Logout" link), and click "Get API token". As a security measure,
you will be prompted to re-enter your password, then shown your token string.

To use the API token, set the HTTP `X-Authorization` header on all of your
API requests to be 'Token', a space, and the token string, e.g.:

    X-Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b


### Additions

- `GET /projects/`:
  List projects visible to the requesting user.

- `GET /client/datastores/`:
  List key-value store datastores used by the client.

- `POST /client/datastores/`:
  Create a key-value store datastore for the client.

- `DELETE /client/datastores/{name}`:
  Delete a key-value store datastore for the client.

- `GET /client/datastores/{name}/`:
  List key-value data in a datastore for the client.

- `PUT /client/datastores/{name}/`:
  Create or replace a key-value data entry for the client.

- `POST /{project_id}/volumes/{volume_id}/`:
  Get detailed information on a spatial volume or set its properties.


### Modifications

`GET /{project_id}/annotations/`:

- Params are now correctly documented as form rather than query params.


`POST /{project_id}/annotations/`:

- Params are now correctly documented as form rather than query params.


`POST /{project_id}/annotations/forskeletons`:

- Params are now correctly documented as form rather than query params.


`POST /{project_id}/skeletons/connectivity`:

- `boolean_op` form param now expects string "AND" or "OR" rather than
  "logic-AND" or "logic-OR".


`POST /{project_id}/volumes/add`:

- Params are now correctly documented as form rather than query params.


### Deprecations

None.


### Removals

None.
