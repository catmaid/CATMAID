This changelog notes changes to API endpoints that are documented and listed
through Swagger. Changes to undocumented, internal CATMAID APIs are not
included in this changelog.

## Under development

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
