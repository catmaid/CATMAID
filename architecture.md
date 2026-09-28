# CATMAID JavaScript Front-End Architecture

This document summarizes how the CATMAID browser client is organized, with
emphasis on how widgets are initialized and how data is shared between them.
The primary reference is the core library under
`django/applications/catmaid/static/libs/catmaid/`, but widget initialization
and data sharing span three layers:

- Core library (`django/applications/catmaid/static/libs/catmaid/*.js`):
  reusable primitives (events, datastores, settings, skeleton sources, requests, state).
- Client bootstrap (`django/applications/catmaid/static/js/*.js`):
  `Client.init()`, `WindowMaker` factory, window tree, project/layout.
- Widgets (`django/applications/catmaid/static/js/widgets/*.js`):
  the individual UI widgets.

## Namespace and module pattern

Everything hangs off a single global object, `CATMAID`. `namespace.js` declares
it empty and is loaded first:

```js
let CATMAID = {};
```

Every other file is an IIFE that receives `CATMAID` and attaches its exports to
it:

```js
(function (CATMAID) {
  "use strict";
  // ... define things, then:
  CATMAID.Foo = Foo;
})(CATMAID);
```

There is no module loader or `import`; load order is governed by the HTML script
tags. `CATMAID.js` defines the client-wide lifecycle: `CATMAID.configure()`
records the backend/static URLs and CSRF cookie name, and `CATMAID.ready()`
returns a promise that resolves once the backend is reachable
(`_checkIfReady()`). Code that must run after startup awaits `CATMAID.ready()`.

## Core library building blocks

### Events (`events.js`)

`events.js` is the pub/sub backbone. `Event` is a plain mixin with `on`, `off`,
`offForContext`, `clear`, `clearAllEvents`, `trigger`, and `hasListeners`.
Listeners are stored per-object in a lazily-created `Map` keyed by event name;
each entry is a list of `[callback, context]` pairs.  Eventing is applied to any
object through the `EventSource` constructor, exposed as:

```js
CATMAID.EventSource = EventSource;
CATMAID.asEventSource = function (obj) { return CATMAID.EventSource.call(obj); };
```

So `CATMAID.asEventSource(someObject)` makes `someObject` an event source. This
mixin is applied to the `SkeletonSource` prototype, to the
`SkeletonSourceManager`, to `CATMAID.Init`, `CATMAID.State`, etc. Event
constants (`EVENT_*`) are declared next to each source.

### DataStore / DataStoreManager (`datastores.js`)

`DataStore` persists key-value data to a backend API
(`/client/datastores/<name>/`). Each store has four scopes:

- `USER_PROJECT`: a value for a specific user in a specific project
- `USER_DEFAULT`: a user's default across projects
- `PROJECT_DEFAULT`: a project-wide default
- `GLOBAL`: instance-wide

`DataStoreManager` is a singleton registry (`new Map()`) with `get(name)`
(lazily creating and caching a store) and `reloadAll()`. Loading is lazy and
shared: the first `get(key)` triggers `load()`, and a single `_initEntries`
promise is reused by concurrent callers. When loaded, the store fires
`DataStore.EVENT_LOADED`.

### Settings (`settings-manager.js`)

`Settings` layers a cascade on top of a DataStore, in order of increasing
specificity. From low to high, these are:

- CATMAID defaults
- global
- project defaults
- user defaults
- user-project session

Each scope may mark a value "not overridable" (locked) so more-specific scopes
cannot change it. The effective value is read from `settings.session.<name>` and
written the same way; writes persist through the `settings` DataStore. A schema
declares defaults, an optional version, and migrations (a map in the schema
keyed by old version number, each value a function transforming an old settings
value into a new one).  `Client.Settings` (`js/init.js`) is the main
client-level settings instance.

### SkeletonSource and subscriptions (`skeleton_source.js`)

`SkeletonSource` is the heart of inter-widget data sharing. It manages a set of
skeletons (each represented by a `SkeletonModel`), a subset of which may be
marked selected: each `SkeletonModel` carries a `selected` boolean, and
`getSelectedSkeletonModels()` returns only the flagged subset
(`getSkeletonModels()` returns all). Sources can subscribe to other sources,
forming a DAG (cycles are rejected). Each `SkeletonSourceSubscription` captures:

- the `source` subscribed to
- a set operation (`UNION`, `INTERSECTION`, or `DIFFERENCE`): how the subscribed
  source's skeletons combine with the target's. `UNION` adds them,
  `INTERSECTION` keeps only skeletons present in both, and `DIFFERENCE` removes
  any the subscribed source also has
- whether colors are synced
- whether the sync is `selectionBased`: when true, only the subscribed source's
  selected skeletons flow (via `getSelectedSkeletonModels()` instead of
  `getSkeletonModels()`)
- a mode (`all`, `additions-only`, `removals-only`, `updates-only`): which
  change events the subscription reacts to

When a subscribed source fires `EVENT_MODELS_ADDED` / `EVENT_MODELS_REMOVED` /
`EVENT_MODELS_CHANGED`, the subscription updates its cache and calls
`target.loadSubscriptions()`, which recomputes the target source's model set by
applying the operations left-to-right over the subscription list. This is how,
for example, one widget's selected skeletons can drive another widget's query
without either knowing about the other directly.

### SkeletonSourceManager (`skeleton_source_manager.js`)

A registry of all live `SkeletonSource` instances, keyed by name. It exposes a
lazily-created singleton `CATMAID.skeletonListSources`.  Sources register
themselves: `registerSource()` fires `EVENT_SOURCE_ADDED` and calls
`CATMAID.skeletonListSources.add(this)`, publishing the source into the global
registry (keyed by name) so other widgets can discover and subscribe to it;
`unregisterSource()` removes it on close. The manager listens to global events
and fans them out to every source:

Each entry maps an event the manager subscribes to (the key) to the method it
invokes when that event fires (the value). The result is then fanned out to
every source:

- `CATMAID.Skeletons.EVENT_SKELETONS_JOINED` -> `replaceSkeleton()`:
  rename/merge a skeleton in every source that has it
- `CATMAID.Skeletons.EVENT_SKELETON_DELETED` -> `removeSkeleton()`
- `SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED` -> `highlight()`:
  highlight the active skeleton everywhere

It also renders the "From / Operator / Subscribe" source-picker controls used by
widgets.

### Requests (`request.js`, `CATMAID.fetch`)

All backend I/O (HTTP requests to the CATMAID backend server) goes through
`CATMAID.fetch(relativeURL, method, data, ...)`, which queues work on a global
`requestQueue` (a `CATMAID.RequestQueue`) and returns a
`Promise`. `CATMAID.fetch` handles CSRF headers, JSON/msgpack decoding, API
targeting (remote hosts), and maps HTTP/backend errors onto typed client errors
(`PermissionError`, `ResourceUnavailableError`, `StateMatchingError`, etc.,
defined in `error.js`).

### State (`state.js`)

`CATMAID.State` and its concrete types (`GenericState`, `SimpleSetState`,
`LocalState`, `NoCheckState`) produce the serialized "state" payloads recording
the edition times (last-modification timestamps) of nodes, parents, children,
and links that the backend uses to detect stale concurrent edits in a
collaborative environment. In such a session, a client cannot assume what it
sees is current; each write carries the edition times the client observed, and
the backend rejects the write if those no longer match the server's current
values, so a stale client cannot silently overwrite someone else's change.

## Widget initialization

### 1. The client entry point

`js/init.js` defines the `Client` class. Its constructor registers handlers for
project/tool/request/volume events, then calls `this.init(options)`.
`Client.init()` does the following:

1. Parses URL options (project, stack, coordinates, active node/skeleton, tool,
   layout, dataview, etc.).
2. Builds menus, the status bar (`CATMAID.Console`), and toolbars.
3. Loads settings (`CATMAID.Client.Settings`).
4. Loads the requested stacks / stack groups, selects the tool, and moves to the
   requested location.
5. Creates the root of the window tree:

```js
CATMAID.rootWindow = new CMWRootNode();
```

### 2. The window tree (`js/widgets/window-manager.js`)

The layout is a tree of window-manager nodes, all extending `CMWNode`:

- `CMWRootNode`: the root container.
- `CMWWindow`: a single draggable/focusable window; the DOM frame a widget
  renders into.
- `CMWVSplitNode` / `CMWHSplitNode`: vertical / horizontal splits.
- `CMWTabbedNode`: tabbed grouping.

`CMWWindow` exposes `getFrame()`, `getContentHeight()`, `focus()`, `close()`,
`addListener()`/`callListeners()` (its own small listener loop for window
lifecycle signals such as `RESIZE` and `CLOSE`), and drag-to-split logic.

### 3. The widget factory (`js/WindowMaker.js`)

`WindowMaker` is a singleton (`new function () { ... }()`) that maps widget keys
to creator functions in a `creators` map. Each entry has `{ name, description,
init }`. Built-in widgets are listed in the `creators` literal (`3d-viewer`,
`neuron-navigator`, `connectivity-graph-plot`, etc.).

Dispatch entry points:

- `WindowMaker.create(name, options, isInstance, state)`:
  always create a new instance.
- `WindowMaker.show(name, params)`:
  focus the existing instance or create one.
- `WindowMaker.getOpenWindows(name, create, params)`:
  return the open windows for `name` (an empty `Map` if none).
  If `create` is true and none are open, instantiate one first.

New widgets register through:

```js
CATMAID.registerWidget({
  key: 'my-widget',
  creator: MyWidget,         // constructor
  state: stateManager,       // optional {key, getState, setState, ...}
  // ...
});
```

`registerWidget` wraps the constructor so that `init` instantiates it (`new
creator(options)`) and calls `createWidget(instance, ...)`. A creator function
(e.g. `create3dWebGLWindow`) does the actual DOM wiring: it builds a
`CMWWindow`, appends a content container, instantiates the widget, calls a
widget-specific entry point such as `widget.init_ui(container, ...)`, and
returns `{ window, widget }`. `WindowMaker` keeps a `windows` map of open
windows (`name -> Map<window, widget>`), and `CATMAID.front` is bound to
`WindowMaker.getFocusedWindowWidget`.

### 4. Widget state persistence

`WindowMaker` also holds `stateManagers` (widget type -> state provider). A
state provider supplies `key`, `getState(widget, withInteractionState)`,
`setState`, etc. State is serialized with `CATMAID.JsonSerializer` and stored in
`localStorage` under a `catmaid-widgets-<key>` prefix
(`CATMAID.saveWidgetState`, `CATMAID.getWidgetState`). This is how a widget's
configuration and interaction state survive a reload and can be embedded in a
shared deep link via `CATMAID.Layout.makeLayoutSpecForWindow`.

Note: local storage is only the local, per-browser persistence; for sharing,
`CATMAID.getWidgetState()` returns the serialized state, which
`Layout.makeLayoutSpecForWindow(..., withWidgetSettings)` embeds in a layout
spec that is POSTed to the backend as part of a deep link and re-applied (via
`setState`) when another user opens it.

## How data is shared between widgets

There are four mechanisms, in increasing order of specificity.

### 1. The event bus

`CATMAID.asEventSource(obj)` gives any object `on`/`off`/`trigger`. Singletons
(`CATMAID.Skeletons`, `CATMAID.Volumes`, `CATMAID.Project`, `CATMAID.Init`,
`SkeletonAnnotations`) and every `SkeletonSource` are event sources. A widget
reacts to shared state changes by registering a listener, without holding a
direct reference to the thing that changed. Example: `SkeletonSourceManager`
subscribes to `CATMAID.Skeletons.EVENT_SKELETONS_JOINED` so a skeleton merge
propagates to every open widget.

### 2. SkeletonSource / SkeletonSourceManager (the primary widget data model)

Each widget owns a `SkeletonSource` that holds the skeletons it is currently
showing/querying. Widgets do not share skeleton data by passing it around;
instead a widget's source can subscribe to another widget's source. The
`SkeletonSourceManager` singleton (`CATMAID.skeletonListSources`) is the
registry that lets a widget find any other source by name. Subscriptions compose
sources with `UNION` / `INTERSECTION` / `DIFFERENCE` and can sync colors and
selection, so a downstream widget's data set is a derived view of upstream
widgets' sources, recomputed automatically when upstream models change.

### 3. Persisted DataStore / Settings

`DataStore` (with its four scopes) and the `Settings` cascade layered on top
share configuration and small key-value state between widgets and across
sessions, via the backend. Two widgets reading the same setting read the same
cascaded value; writing it updates every reader that reloads.

### 4. Global singletons

Finally, a handful of module-level globals carry the session's shared, mutable
state that doesn't fit the other mechanisms: the global `project` object (the
open project: coordinates, stacks, tool), `SkeletonAnnotations` (the active
node/skeleton and selection), `CATMAID.session` (current user/session), and
`CATMAID.rootWindow` (the layout root). Widgets read these directly; changes are
broadcast through the event bus so others can react.

## Key files

- `libs/catmaid/namespace.js`:
  Declares the `CATMAID` global
- `libs/catmaid/CATMAID.js`:
  Client lifecycle (`configure()`, `ready()`, `fetch()`, permissions, cookies)
- `libs/catmaid/events.js`:
  `EventSource` mixin (pub/sub)
- `libs/catmaid/datastores.js`:
  `DataStore` + `DataStoreManager` (scoped persisted KV)
- `libs/catmaid/settings-manager.js`:
  `Settings` cascade over a DataStore
- `libs/catmaid/skeleton_source.js`:
  `SkeletonSource` + `SkeletonSourceSubscription`
- `libs/catmaid/skeleton_source_manager.js`:
  `SkeletonSourceManager` singleton + fan-out
- `libs/catmaid/request.js`:
  `RequestQueue` backing `CATMAID.fetch`
- `libs/catmaid/state.js`:
  Collaborative-edit state payloads
- `js/init.js`:
  `Client` bootstrap; `CATMAID.rootWindow` creation
- `js/WindowMaker.js`:
  Widget factory, registry, and state persistence
- `js/widgets/window-manager.js`:
  `CMWNode` / `CMWWindow` / split / tab window tree
- `js/layout.js`:
  Layout (de)serialization for deep links
- `js/project.js`:
  The global `project` object
