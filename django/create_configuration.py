#!/usr/bin/env python
# -*- coding: utf-8 -*-

import datetime
import tempfile
import os.path as op
import os
import re
import sys
from random import choice

# Import everything from the configuration file
from configuration import *

def exit_err(msg):
    print(msg)
    sys.exit(1)

def backup_existing_copy(path):
    if not os.path.isfile(path):
        return
    now = datetime.datetime.now()
    backup_path = f'{path}.backup-{now.year}-{now.month}-{now.day}-{now.hour}-{now.minute}-{now.second}'
    os.rename(path, backup_path)
    print(f'Created a backup of the existing configuration file file: {backup_path}')

# Make sure trailing and leading slashes are where they are expected.
if abs_catmaid_path[-1] == '/':
    exit_err("abs_catmaid_path should not have a trailing slash! Aborting.")
if len(catmaid_servername) > 0:
    if catmaid_servername[-1] == '/':
        exit_err("catmaid_servername should not have a trailing slash! Aborting.")
    if catmaid_servername.startswith('http://'):
        exit_err("catmaid_servername should not start with 'http://'! Aborting.")
if len(catmaid_subdirectory) > 0:
    if catmaid_subdirectory[-1] == '/':
        exit_err("catmaid_subdirectory should not have a trailing slash! Aborting.")
    if catmaid_subdirectory[0] == '/':
        exit_err("catmaid_subdirectory should not have a leading slash! Aborting.")

# Use defaults for optional parameters that are not present
current_module = sys.modules[__name__]
if not hasattr(current_module, 'catmaid_database_host'):
    catmaid_database_host = ''
if not hasattr(current_module, 'catmaid_database_port'):
    catmaid_database_port = ''

in_configfile = op.join('projects/mysite/django.wsgi.example')
out_configfile = op.join('projects/mysite/django.wsgi')
backup_existing_copy(out_configfile)

with open(in_configfile) as in_f:
    data = in_f.read()

data = re.sub('CATMAIDPATH', abs_catmaid_path, data)
data = re.sub('PYTHONLIBPATH', abs_virtualenv_python_library_path, data)

with open(out_configfile, "w") as out_f:
    out_f.write(data)

# Create a secret key for Django
alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)'
catmaid_secret_key = ''.join([choice(alphabet) for i in range(50)])

in_configfile = op.join('projects/mysite/settings.py.example')
out_configfile = op.join('projects/mysite/settings.py')
backup_existing_copy(out_configfile)

with open(in_configfile) as in_f:
    data = in_f.read()

data = re.sub('CATMAIDPATH', abs_catmaid_path, data)
data = re.sub('CATMAID_DATABASE_HOST', catmaid_database_host, data)
data = re.sub('CATMAID_DATABASE_PORT', catmaid_database_port, data)
data = re.sub('CATMAID_DATABASE_NAME', catmaid_database_name, data)
data = re.sub('CATMAID_DATABASE_USERNAME', catmaid_database_username, data)
data = re.sub('CATMAID_DATABASE_PASSWORD', catmaid_database_password, data)
data = re.sub('CATMAID_SECRET_KEY', catmaid_secret_key, data)
data = re.sub('CATMAID_TIMEZONE', catmaid_timezone, data)
data = re.sub('CATMAID_WRITABLE_PATH', catmaid_writable_path, data)
data = re.sub('CATMAID_SERVERNAME', catmaid_servername, data)
data = re.sub('CATMAID_SUBDIR', catmaid_subdirectory, data)
# If CATMAID doesn't live in a sub-directery, double-slashes can occur
# in the generated configurations. Remove those, if they are not part
# of a recognized protocol specification:
known_protocols = ["http", "https", "ftp", "ssh", "nfs", "smb", "django"]
known_protocols = ["(?<!%s:)" % p for p in known_protocols]
known_protocols_re = ''.join(known_protocols)
data = re.sub('%s//' % known_protocols_re, '/', data)
# If CATMAID doesn't live in a sub-directory, the FORCE_SCRIPT_NAME setting
# has to be commented out. Otherwise, it would add an extra slash in
# redirects.
if len(catmaid_subdirectory) == 0:
    data = re.sub(r'^FORCE_SCRIPT_NAME', '# FORCE_SCRIPT_NAME', data, flags=re.M)

# Set default options for enabled tools
if 'catmaid_default_enabled_tools' in locals():
    known_tool_map = {
        'cropping': 'PROFILE_SHOW_CROPPING_TOOL',
        'tagging': 'PROFILE_SHOW_TAGGING_TOOL',
        'textlabel': 'PROFILE_SHOW_TEXT_LABEL_TOOL',
        'tracing': 'PROFILE_SHOW_TRACING_TOOL',
        'ontology': 'PROFILE_SHOW_ONTOLOGY_TOOL',
        'roi': 'PROFILE_SHOW_ROI_TOOL',
    }
    known_tools = set(known_tool_map.keys())
    default_tools = set(locals()['catmaid_default_enabled_tools'])
    unknown_tools = default_tools - known_tools
    if unknown_tools:
        print('The following options for "catmaid_default_enabled_tools" are unknown: {}'.format(
            ', '.join(unknown_tools)))
    enabled_tools = known_tools.intersection(default_tools)
    data += '\n# Default tools that are enabled for new users\n'
    for tool in known_tools:
        data += f'{known_tool_map[tool]} = {"True" if tool in enabled_tools else "False"}\n'

# Write out the configuration
with open(out_configfile, 'w') as out_f:
    out_f.write(data)

nginx_out = """
upstream catmaid-wsgi {{
    # Configure host and IP of WSGI server here
    server 127.0.0.1:8020 fail_timeout=0;
}}

server {{
    # Handle error pages
    location @maintenance {
      root {cmpath}/docs/html;
      rewrite ^(.*)$ /maintenance.html break;
    }

    # CATMAID: access to static front-end data
    location /{subdir}/static/ {{
        alias {cmpath}/django/static/;
    }}

    # CATMAID: access to exported and generated data
    location /{subdir}/files/ {{
        alias {writable_path}/;
    }}

    # CATMAID: Access to image data
    location /{subdir}/data/ {{
        alias {cmpath}/data;
    }}

    # Route all CATMAID Django WSGI requests to the Gevent WSGI server
    location /{subdir}/ {{
        error_page 502 503 504 @maintenance;
        proxy_pass http://catmaid-wsgi/;
        proxy_redirect http://catmaid-wsgi/ http://$host/;
        proxy_set_header Host $http_host;
        # This is required to tell Django it is behind a proxy
        proxy_set_header X-Forwarded-For $host;
        # This lets Django know which protocol was used to connect and also
        # overrides the header a client who fakes it.
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
""".format(
    cmpath=abs_catmaid_path,
    subdir=catmaid_subdirectory,
    writable_path=catmaid_writable_path,
)

# Remove any double slashes from this configuration too:
nginx_out = re.sub('(?<!(http:))//', '/', nginx_out)

apache_out = """
Alias /{subdir} {cmpath}/django/projects/mysite/django.wsgi
<Location /{subdir}>
        SetHandler wsgi-script
        Options +ExecCGI
</Location>

Alias /{subdir}/static {cmpath}/django/static/
<Directory {cmpath}/django/static/>
    Options FollowSymLinks
    AllowOverride AuthConfig Limit FileInfo
    Order deny,allow
    Allow from all
</Directory>

Alias /{subdir}/data {cmpath}/data/
<Directory {cmpath}/data/>
    Options FollowSymLinks
    AllowOverride AuthConfig Limit FileInfo
    Order deny,allow
    Allow from all
</Directory>

Alias /{subdir}/files {writable_path}/
<Directory {writable_path}/>
    Options FollowSymLinks
    AllowOverride AuthConfig Limit FileInfo
    Order deny,allow
    Allow from all
</Directory>
""".format(**{
    'cmpath': abs_catmaid_path,
    'subdir': catmaid_subdirectory,
    'writable_path': catmaid_writable_path,
})

# Remove any double slashes from this configuration too:
apache_out = re.sub('//', '/', apache_out)

print(f"""
Nginx configuration settings
----------------------------
{nginx_out}
Apache configuration settings
-----------------------------
{apache_out}
""")
