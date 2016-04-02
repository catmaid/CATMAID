This changelog notes changes to API endpoints that are documented and listed
through Swagger. Changes to undocumented, internal CATMAID APIs are not
included in this changelog.

## Under development

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
