#!/usr/bin/env python

# This script should add a template migration to the migrations.php
# file.  If you provide a git commit ID it uses the commit date from
# that commit for the timestamp.  Otherwise, it uses the current time.

import sys
import os
import subprocess
import datetime
import dateutil.parser
import pytz
import re
import tempfile
import shutil

top_level = os.path.join(os.path.dirname(sys.path[0]))
migrations_filename = os.path.join(top_level,'inc','migrations.php')

def usage():
    print("Usage: {0} DESCRIPTION [GIT-COMMIT]".format(sys.argv[0]))

if len(sys.argv) == 2:
    timestamp = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')
elif len(sys.argv) == 3:
    git_commit = sys.argv[2]
    local_timestamp = subprocess.check_output(['git',
                                               'show',
                                               '-s',
                                               '--format=%ci',
                                               git_commit]).strip()
    parsed_local_timestamp = dateutil.parser.parse(local_timestamp)
    timestamp = parsed_local_timestamp.astimezone(pytz.utc).strftime('%Y-%m-%dT%H:%M:%S')
else:
    usage()
    sys.exit(1)

description = sys.argv[1]

def quote_string_for_php(s):
    return "'" + s.replace('\\','\\\\').replace("'", "\\'") + "'"

migration_text = '''	{0} => new Migration(
		{1},
		\'
[Put your migration here.]
\'
),

'''.format(quote_string_for_php(timestamp),
           quote_string_for_php(description))

tmp = tempfile.NamedTemporaryFile(delete=False)
with open(migrations_filename) as finput:
    with open(tmp.name, 'w') as foutput:
        for line in finput:
            if re.search('INSERT NEW MIGRATIONS HERE', line):
                foutput.write(migration_text)
            foutput.write(line)
shutil.copymode(migrations_filename, tmp.name)
shutil.move(tmp.name, migrations_filename)
