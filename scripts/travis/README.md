# Travis CI deployment scripts

## Build scripts

These scripts must be run from the CATMAID root directory.

### `install_requirements.sh`

To be run in the `install` block, this script:

- Installs OS-level dependencies
- Installs python dependencies for CATMAID and its unit tests

### `setup_database.sh`

To be run in the `before_script` block, this script:

- Configures postgres
- Starts postgres
- Creates the catmaid database and postgis extension

### `configure_catmaid.sh`

To be run in the `before_script` block, this script:

- Populates `configuration.py`
- Runs `configuration.py`, creating `settings.py`
- Modifies `settings.py` to enable serving static files and running tests

## Utilities

### `travis_functions.sh`

To be sourced by scripts requiring the use of `travis_retry` and/or `travis_wait`.

This contains utility functions available to the shell in travis,
but not to subprocesses. They may need to be updated as the upstream
implementation changes.
