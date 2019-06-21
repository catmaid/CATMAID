# -*- coding: utf-8 -*-

import subprocess
import os
import sys
import re
import errno


# This variable contains a reference version of the current code-base. It is
# updated by release and dev-cycle scripts.
BASE_VERSION = '2019.06.20-dev'
# This commit is the reference commit of the BASE_VERSION above. Technically, it
# is the commit right before the BASE_VERSION, because the release script will
# change these fields and onlt create the actual release commit after the changes.
BASE_COMMIT = '097948fecf923f975705fd862be3c72ffd20ed07'
# These file is created as part of our Docker build and is looked at as
# fall-back, should no git environment be available. The VERSION_INFO_PATH file
# contains the "git describe" output of the build environment.
VERSION_INFO_PATH = '/home/git-version'


def get_version():
    """
    Return output of "git describe" executed in the directory of this file. If
    this results in an error, "unknown" is returned.
    """
    try:
        dir = os.path.dirname(os.path.realpath(__file__))
        # Universal newlines is used to get both Python 2 and 3 to use text mode.
        p = subprocess.Popen("/usr/bin/git describe", cwd=os.path.dirname(dir),
                shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                universal_newlines=True)
        (out, error) = p.communicate()
        if error:
            # Fall-back to docker version file, if it exists
            version_file = open(VERSION_INFO_PATH, 'r')
            describe_info = version_file.read().rstrip().encode('utf-8').decode('utf-8')
        else:
            describe_info = out.rstrip().encode('utf-8').decode('utf-8')

        return describe_info
    except:
        return '{}-unknown'.format(BASE_VERSION)


def relative(*path_components):
    """
    Returns a path relative to the directory this file is in
    """
    base = os.path.abspath(os.path.dirname(__file__))
    all_parts = [base] + list(path_components)
    return os.path.realpath(os.path.join(*all_parts))
