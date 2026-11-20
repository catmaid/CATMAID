# Replacing the vendored `venn.js` with upstream benfred/venn.js v0.2.20

## Goal

Issue #1128 ("Venn Diagram layout can now improve") points at Ben Frederickson's
"[Better Venn Diagrams][bvd]" post and notes that the solution uses d3, so it
applies directly to CATMAID. The concrete task is to replace the vendored
`django/applications/catmaid/static/libs/d3/venn.js` with benfred/venn.js
v0.2.20, which implements the improved layout algorithm (greedy + constrained
MDS).

## Current state

- Vendored file: `django/applications/catmaid/static/libs/d3/venn.js` . This is
  an old, d3-v3-specific fork of benfred/venn.js, not a clean upstream checkout.
- It is bundled by django-pipeline (`pipelinefiles.py`), concatenated into
  `django/static/js/libs/d3-lib.js` at `collectstatic` time.
- CATMAID ships d3 v3, which is what `venn.js` runs against.
- `django/applications/catmaid/static/js/widgets/venn-diagram.js` is the only
  consumer.
- The `libs/d3/**` path is in `.travis.jshintignore`, so the vendored file is
  not linted; the widget (`static/js/widgets/venn-diagram.js`) is linted.

## Upstream target

- `benfred/venn.js` v0.2.20, remote `github.com/benfred/venn.js`.
- Ship artifact: `venn.js` (~68 KB, rollup UMD, non-minified, matches the
  `d3.v3.js` convention of vendoring the non-minified build).
- Dependencies: `d3-selection`, `d3-transition` (both d3 v4 modules), and `fmin`
  (bundled by rollup, so no runtime `fmin` global is needed).
- The UMD factory maps both `d3-selection` and `d3-transition` to `global.d3`,
  so it relies on a single global `d3`.

## This is not a drop-in replacement

The public API changed between the vendored fork and v0.2.20. The widget calls
three things that no longer exist in the same form:

| Widget currently calls | v0.2.20 equivalent |
| --- | --- |
| `venn.venn(sets, overlaps, {layoutFunction: venn.classicMDSLayout})` | `venn.venn(areas)` — one combined `{sets, size, label}` array |
| `venn.classicMDSLayout` (used for >3 groups) | removed; the default `bestInitialLayout` now runs greedy + constrained MDS |
| `venn.drawD3Diagram(sel, positions, w, h, params)` → `{svg, nodes, circles, text}` | `venn.VennDiagram()` chart, invoked via `d3.select(sel).datum(areas).call(chart)` |

Also removed: the separate `circleIntersection` global (its functions are now
`venn.intersectionArea`, `venn.circleCircleIntersection`, `venn.circleOverlap`,
etc.).

### Old API details (for reference)

- `venn.venn(sets, overlaps)` mutates and returns the sets array (single sets
  only), each entry gaining `x`, `y`, `radius`, `size`, `label`.
- `venn.drawD3Diagram` scales the positions and draws **circles + text only**
  (no intersection-area paths), returning `{svg, nodes, circles, text}` d3
  selections.
- The widget binds handlers directly to `this.diagram.svg`,
  `this.diagram.circles`, `this.diagram.text`.

### New API details

- `venn.venn(areas)` takes a single array where each area is `{sets: [ids],
  size: number, label?: string}`. It returns an array of the same shape with
  `x`, `y`, `radius` filled in.
- `venn.VennDiagram()` returns a chart function with accessor methods. It is
  used as `d3.select(container).datum(areas).call(chart)`.
- Calling `chart(selection)` directly returns `{circles, textCentres, nodes,
  enter, update, exit}` (this is the hook for post-hoc event binding; `.call()`
  discards it).
- The chart renders a full area-proportional diagram: `g.venn-area path`
  (intersection regions) plus `g.venn-circle path` (single sets) and `text`
  labels, and filters 0-sized single sets before layout.

## The one decision that matters: d3 v3 vs v4

Upstream v0.2.20 is built against `d3-selection`/`d3-transition` (v4), and its
examples all load `d3.v4.min.js`. CATMAID is on d3 v3.

- The layout algorithm is pure math with no d3 dependency, so it works
  regardless of d3 version.
- Only the `VennDiagram()` chart touches d3. The calls it uses (`select`,
  `selectAll`, named `.transition("venn")`) look v3-compatible, but v3
  compatibility has **not been verified** and should not be assumed.
- Upgrading CATMAID's d3 v3 → v4 globally is out of scope and would be a large,
  risky change affecting every other d3 user in the front-end.

## Recommendation

Do the full replacement (new file + widget rewrite to `VennDiagram()`) and
verify d3-v3 compatibility with a headless-Chrome test and a manual browser
check.

Fallback if the chart proves v4-only: keep a `drawD3Diagram`-style drawing
(which works on v3) but drive it with the new `venn.venn(areas)` layout. This
still delivers the improved algorithm from #1128 at much lower risk.

## Proposed changes

1. Replace `django/applications/catmaid/static/libs/d3/venn.js` with the
   rollup-built `~/venn.js/venn.js`. No lint impact (path is jshint-ignored).

2. Rewrite `django/applications/catmaid/static/js/widgets/venn-diagram.js`:
   - `redraw()`: keep `this.sets`/`this.overlaps` for click resolution (the
     overlaps carry the `.common` skeleton map the click handler needs), and
     additionally build a combined `areas` array for layout/drawing: `{sets:[i],
     size, label}` per group plus `{sets:[k,j], size}` per pair.
   - `draw()`: replace `venn.venn(...)` + `venn.drawD3Diagram(...)` with
     `venn.VennDiagram().width(w).height(h)…` +
     `d3.select(...).datum(areas).call(chart)`.
   - Re-apply the per-group fill colours (currently done via
     `parameters.circleFillColours`; the new chart exposes `.colours()`).
   - Rework the click/hover handlers, which today reach into
     `this.diagram.svg/circles/text`, against the new `.venn-circle` /
     `.venn-area` DOM and the `d.sets` datum.

3. Add `django/applications/catmaid/static/js/tests/test_venn_diagram.js` (see
   below).

## Test plan (CI/CD)

The repo already runs QUnit + Karma: `npm run karma`, wired into the
`test-frontend` GitHub job (`.github/workflows/ci.yaml`), which runs
`collectstatic` then `npm run karma`. Karma's `files` glob picks up
`django/applications/catmaid/static/js/tests/*.js` automatically, so a new test
file needs no new CI configuration.

New file `django/applications/catmaid/static/js/tests/test_venn_diagram.js`:

- Pure-layout tests (no DOM, deterministic):
  - `venn.venn(areas)` returns the correct number of entries with finite
    `x`/`y`/`radius`.
  - `venn.circleOverlap` of a laid-out pair matches the requested overlap
    (validates area-proportionality).
  - Disjoint sets land ~`r1 + r2` apart.
  - `venn.normalizeSolution` / `venn.scaleSolution` keep circles within bounds
    and preserve ordering.
  - `venn.bestInitialLayout` (greedy + constrained MDS) terminates and returns
    a valid layout for 5+ sets — the issue's actual motivation.

- Widget integration test (DOM + d3, headless Chrome):
  - Instantiate `new CATMAID.VennDiagram()`, populate groups, call `redraw()`,
    and assert the container gets an `<svg>` with the expected `.venn-circle` /
    `.venn-area` nodes and that the click handler is bound.
  - This is the d3-v3-compatibility smoke test. It needs a sized fixture element
    (jQuery `.width()`/`.height()` return 0 for a detached node).

## Local verification

1. `python django/projects/manage.py collectstatic --link --noinput`
   (regenerates `django/static/js/libs/d3-lib.js`, which is what Karma loads).
2. `npm install && npm run karma`.
3. `npm run lint:js-diff` (the widget file is linted).
4. Manual check in a browser against a live CATMAID instance.

[bvd]: http://www.benfrederickson.com/better-venn-diagrams/
