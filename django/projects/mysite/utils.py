import commands
import subprocess
import os
import sys
import re


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
        return "unknown" if error else out
    except:
        return "unknown"

