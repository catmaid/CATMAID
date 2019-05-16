#!/usr/bin/env python
# -*- coding: utf-8 -*-

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

o = open( out_configfile ,'w')
data = open( in_configfile, 'r' ).read()
data = re.sub('CATMAIDPATH', abs_catmaid_path, data)
data = re.sub('PYTHONLIBPATH', abs_virtualenv_python_library_path, data)
o.write( data )
o.close()

# Create a secret key for Django
alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)'
catmaid_secret_key = ''.join([choice(alphabet) for i in range(50)])

in_configfile = op.join('projects/mysite/settings.py.example')
out_configfile = op.join('projects/mysite/settings.py')
o = open( out_configfile ,'w')
data = open( in_configfile, 'r' ).read()
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
known_protocols = ''.join(known_protocols)
data = re.sub('%s//' % known_protocols, '/', data)
# If CATMAID doesn't live in a sub-directory, the FORCE_SCRIPT_NAME setting
# has to be commented out. Otherwise, it would add an extra slash in
# redirects.
if len(catmaid_subdirectory) == 0:
  data = re.sub(r'^FORCE_SCRIPT_NAME', '# FORCE_SCRIPT_NAME', data, flags=re.M)
# Write out the configuration
o.write( data )
o.close()

nginx_out = """
upstream catmaid-wsgi {{
    # Configure host and IP of WSGI server here
    server 127.0.0.1:8020 fail_timeout=0;
}}

server {{
    location /{subdir}/static/ {{
        alias {cmpath}/django/static/;
    }}
    `
    location /{subdir}/files/ {{
        alias {writable_path}/;
    }}

    # Route all CATMAID Django WSGI requests to the Gevent WSGI server
    location /{subdir}/ {{
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
""".format(**{
    'cmpath': abs_catmaid_path,
    'subdir': catmaid_subdirectory,
    'writable_path': catmaid_writable_path,
})

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

print("""
Nginx configuration settings
----------------------------
%s
Apache configuration settings
-----------------------------
%s
""" % (nginx_out, apache_out))
