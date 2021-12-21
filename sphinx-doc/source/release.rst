CATMAID Releases
================

New CATMAID releases are named after the date they are created, e.g.
``2021-12-20``. Most of the process to create a new release is automated: a new
release can be created with the script ``scripts/dev/make-release.py``. This
will ask the user a few questions related to the release (contributors, name,
etc.) and will then create a new release branch, update the changelog and
related files, create a new API doc version and update all version references.

This release branch can then be pushed to the main repository to have CI test
it. Once it passes all tests it can be merged into the master/main branch.

As part of the release script the release commit is also tagged with the release
name (e.g. ``2021.12.20``). This tag jas to be pushed manually to GitHub and the
``stable`` tag has to be updated as well::

  git push origin <tag-name>
  git tag -f stable && git push origin +stable

As a last step, a new development cycle needs to be started by running the
``scripts/dev/start-dev-cycle.py`` script.
