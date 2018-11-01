# -*- coding: utf-8 -*-

import subprocess
import os
import sys
import re
import errno


# This variable contains a reference version of the current code-base. It is
# updated by release and dev-cycle scripts.
BASE_VERSION = '2018.07.19-dev'

# This file is created as part of our Docker build. It is looked for as
# fall-back, should no git be available.
DOCKER_VERSION_PATH = '/home/git-commit'

# The length to which Git commit IDs should be truncated to.
GIT_COMMIT_LENGTH = 10


def get_version():
    """
    Return output of "git describe" executed in the directory of this file. If
    this results in an error, "unknown" is returned.
    """
    try:
        dir = os.path.dirname(os.path.realpath(__file__))
        # Universal newlines is used to get both Python 2 and 3 to use text mode.
        p = subprocess.Popen("/usr/bin/git rev-parse HEAD", cwd=os.path.dirname(dir),
                shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                universal_newlines=True)
        (out, error) = p.communicate()
        if error:
            # Fall-back to docker version file, if it exists
            version_file = open(DOCKER_VERSION_PATH, 'r')
            commit = version_file.read().rstrip().encode('utf-8').decode('utf-8')
        else:
            commit = out.rstrip().encode('utf-8').decode('utf-8')

        # Shorten commit ID
        commit = commit[:GIT_COMMIT_LENGTH]
    except:
        commit = "unknown"

    return '{}-{}'.format(BASE_VERSION, commit)


def relative(*path_components):
    """
    Returns a path relative to the directory this file is in
    """
    base = os.path.abspath(os.path.dirname(__file__))
    all_parts = [base] + list(path_components)
    return os.path.realpath(os.path.join(*all_parts))
