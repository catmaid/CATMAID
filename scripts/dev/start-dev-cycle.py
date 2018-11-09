#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# This script will prepare the CATMAID documentation and changelogs for a new
# development cycle. It inserts headers in API_CHANGELOG.md and CHANGELOG.md so
# that new changes can be recorded. It also updates the Sphinx documentation to
# refer to a development version.
#
# Its dependencies are part of the requirements-dev.txt file.
#

import os
import re
import sh
import sys


def log(message, newline=True):
    sys.stdout.write(message)
    if newline:
        sys.stdout.write("\n")

def update_file(path, filterfn):
    data = None
    with open(path, "r") as file:
        data = file.read()
    if not data:
        raise ValueError("Couldn't load {} file".format(path))

    data = filterfn(data)

    # Write out updated file content
    log("Updating {}... ".format(path), False)
    with open(path, "w") as file:
        file.write(data)
    log("done")

def update_changelog(changelog_data):
    """Prepend development cycle header to changelog data passed in.
    """
    changelog_dev_header = "{}\n\n\n\n{}\n\n\n\n{}\n\n\n\n".format(
        "## Under development", "### Features and enhancements",
        "### Bug fixes")

    return changelog_dev_header + changelog_data

def update_api_changelog(api_changelog_data):
    """Prepend development cycle header to changelog data passed in.
    """
    last_release_prefix = "#"
    last_release_start = api_changelog_data.find(last_release_prefix)
    if -1 ==  last_release_start:
        raise ValueError("Couldn't find development title in API changelog")

    api_changelog_dev_header = "{header}{add}{mod}{dep}{rem}\n".format(
        header="## Under development\n\n",
        add="### Additions\n\nNone.\n\n",
        mod="### Modifications\n\nNone.\n\n",
        dep="### Deprecations\n\nNone.\n\n",
        rem="### Removals\n\nNone.\n\n")

    return "{}{}{}".format(api_changelog_data[0:last_release_start],
        api_changelog_dev_header, api_changelog_data[last_release_start:])


def update_documentation(doc_data):
    # Replace first occurrence of 'version' and 'release' fields
    doc_data = re.sub("^version\s=\s*['\"](.*)['\"]\s*$", "version = '\g<1>-dev'",
        doc_data, 1, re.MULTILINE)
    doc_data = re.sub("^release\s=\s*['\"](.*)['\"]\s*$", "release = '\g<1>-dev'",
        doc_data, 1, re.MULTILINE)

    return doc_data


def update_version(doc_data):
    doc_data = re.sub("^BASE_VERSION\s=\s*['\"](.*)['\"]\s*$", "BASE_VERSION = '\g<1>-dev'",
        doc_data, 1, re.MULTILINE)

    return doc_data


def start_dev_cycle(catmaid_folder):
    """Prepare changelog and documentation for a new development cycle.
    """
    git = sh.git.bake(_cwd=catmaid_folder)
    project_root = git("rev-parse", "--show-toplevel").stdout.decode('utf-8').replace('\n', '')
    log("CATMAID directory: {}".format(project_root))

    # Add new header to CHANGELOG
    update_file(os.path.join(project_root, 'CHANGELOG.md'), update_changelog)

    # Add new header to API CHANGELOG
    update_file(os.path.join(project_root, 'API_CHANGELOG.md'), update_api_changelog)

    # Change reference version
    update_file(os.path.join(project_root, "django/projects/mysite/utils.py"), update_version)

    # Update version references in documentation
    update_file(os.path.join(project_root, "sphinx-doc/source/conf.py"), update_documentation)

    # Create commit
    git.commit("-a", "-m", "Start new development cycle")

    log("Started new development cycle")

def main():
    working_dir = os.path.dirname(os.path.realpath(__file__))
    start_dev_cycle(working_dir)

if __name__ == "__main__":
    main()
