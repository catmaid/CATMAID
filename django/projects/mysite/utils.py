import commands
import subprocess
import os
import sys
import re
import errno

def get_version():
    """
    Return output of "git describe" executed in the directory of this file. If
    this results in an error, "unknown" is returned.
    """
    try:
        dir = os.path.dirname(os.path.realpath(__file__))
        p = subprocess.Popen("/usr/bin/git describe", cwd=os.path.dirname(dir),
                shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        (out, error) = p.communicate()
        return "unknown" if error else out.rstrip()
    except:
        return "unknown"

def relative(*path_components):
    """
    Returns a path relative to the directory this file is in
    """
    base = os.path.abspath(os.path.dirname(__file__))
    all_parts = [base] + list(path_components)
    return os.path.realpath(os.path.join(*all_parts))

def mkdir_p(path):
    """
    Create a directory hierarchy (like mkdir -p).
    From: http://stackoverflow.com/q/600268/223092

    """
    try:
        os.makedirs(path)
    except OSError as exc:
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise
