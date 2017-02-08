# CATMAID

The Collaborative Annotation Toolkit for Massive Amounts of Image Data

For more information, see http://www.catmaid.org/

### Status

This reflects the status of our tests:

[![Build Status](https://travis-ci.org/catmaid/CATMAID.svg?branch=master)](https://travis-ci.org/catmaid/CATMAID)
[![Coverage Status](https://coveralls.io/repos/catmaid/CATMAID/badge.svg?branch=master)](https://coveralls.io/r/catmaid/CATMAID)
[![Sauce Test Status](https://saucelabs.com/open_sauce/build_status/catmaid.svg)](https://saucelabs.com/open_sauce/build_status/catmaid.svg)

### Releases

Versions that we consider stable are tagged as release and are merged into the
repository's `master` branches. These versions are additionally available as
bundled [download](https://github.com/catmaid/CATMAID/releases).

### Development

We follow a development model that borrows ideas from
[GitFlow](http://nvie.com/posts/a-successful-git-branching-model/), but is less
strict. Regular development happens in the `dev` branch or topic branches that
are later merged into `dev`. Release branches are created off of `dev` and
contain additional release preparation changes. When ready, a release commit
is tagged and then merged into `master` and `dev`. In case a release requires
additional fixes maintenance branches are created based on the respective
release commits. Maintenance branches are considered stable and are merged into
both `master` and `dev`.
