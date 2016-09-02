This changelog notes changes to API endpoints that are documented and listed
through Swagger. Changes to undocumented, internal CATMAID APIs are not
included in this changelog.

## Under development

### Additions

None.

### Modifications

None.

### Deprecations

None.

### Removals

None.


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
