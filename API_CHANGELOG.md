This changelog notes changes to API endpoints that are documented and listed
through Swagger. Changes to undocumented, internal CATMAID APIs are not
included in this changelog.

## Under development

### Additions

- `GET /{project_id}/samplers/domains/intervals/{interval_id}/details`:
  Get detailed information about a particular interval.

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

### Deprecations

None.

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
