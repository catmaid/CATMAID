# -*- coding: utf-8 -*-

# This fabric file will launch a standalone instance running catmaid

from fabric.api import *
from fabric.contrib.console import confirm
from fabric.contrib.files import exists
from fabric.contrib.files import sed
import boto
from boto.s3.key import Key
from boto import ec2
import sys, pprint, time
from datetime import datetime

import tempfile
import os.path as op
import os
import re

execfile('configuration.py')

# Creates a new instance with desired settings on aws
def buildApp():
    '''Creates a new instance on ec2 and returns the ip address and summary information'''
    with settings(warn_only = True):

        conn = ec2.EC2Connection(aws_access_key_id, aws_secret_access_key)

        # check if it exists already
        if not 'catmaidgroup' in [group.name for group in conn.get_all_security_groups()]:
            print('Create CATMAID security group')
            web = conn.create_security_group('catmaidgroup', 'CATMAID security group')
            web.authorize('tcp', 80, 80, '0.0.0.0/0')
            web.authorize('tcp', 22, 22, '0.0.0.0/0')
        reservation = conn.run_instances(aws_AMI, instance_type=aws_size, key_name=aws_keypair_name,
            security_groups=['catmaidgroup'])
        instance = reservation.instances[0]

        print('Starting instance %s' % (instance))
        while not instance.update() == 'running':
            time.sleep(1)
            sys.stdout.write('.')
            sys.stdout.flush()

        # instance.add_tag('Name', 'incf_catmaid')
        print('Instance started: %s' % instance.__dict__['id'])
        print('Public DNS: %s\n' % instance.__dict__['public_dns_name'])
        print('-> Write this public DNS to your configuration.py file (env.host_string)')

# Basic packages for building, version control
def installBasePackages():
    '''Basic packages for building, version control'''
    with settings(warn_only=True):
        # Update image and install needed base components
        run("sudo apt-get -y --force-yes update", pty = True)
        run("sudo apt-get -y --force-yes upgrade", pty = True)
        packagelist = ['git', 'apache2', 'build-essential', 'g++', 'libapache2-mod-php5', 'php5-pgsql', 'imagemagick', \
                       'python-psycopg2', 'python-yaml', 'python-tz', 'postgresql', 'pgadmin3','phppgadmin','postgresql-contrib']
        for each_package in packagelist:
            print(each_package)
            run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)

def generateConfigFiles():
    with settings(warn_only=True):

        in_configfile = op.join('../../inc/setup.inc.php.template')
        out_configfile = op.join( tempfile.gettempdir(), 'setup.inc.php')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('catmaid_user', catmaid_database_username, data)
        data = re.sub('password', catmaid_database_password, data)
        data = re.sub("'catmaid'", "'%s'" % catmaid_database_name, data)
        o.write( data )
        o.close()

        in_configfile = op.join('pg_hba.conf')
        out_configfile = op.join( tempfile.gettempdir(), 'pg_hba.conf')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('CATMAID_USERNAME', catmaid_database_username, data)
        data = re.sub('CATMAID_DATABASE', catmaid_database_name, data)
        o.write( data )
        o.close()

        in_configfile = op.join('catmaid-db')
        out_configfile = op.join( tempfile.gettempdir(), '.catmaid-db')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('CATMAID_USERNAME', catmaid_database_username, data)
        data = re.sub('CATMAID_DATABASE', catmaid_database_name, data)
        data = re.sub('CATMAID_PASSWORD', catmaid_database_password, data)
        o.write( data )
        o.close()

        in_configfile = op.join('../../django/projects/mysite/settings.py.example')
        out_configfile = op.join( tempfile.gettempdir(), 'settings.py')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('CATMAID_DATABASE', catmaid_database_name, data)
        data = re.sub('CATMAID_USERNAME', catmaid_database_username, data)
        data = re.sub('CATMAID_PASSWORD', catmaid_database_password, data)
        data = re.sub('USERNAME', env.user, data)
        data = re.sub('CATMAID_PATH', 'CATMAID', data)
        data = re.sub('CATMAID_WEBURL', env.host_string, data)
        data = re.sub('PYTHON_VERSION', 'python3.6', data)

        o.write( data )
        o.close()

        in_configfile = op.join('../../django/projects/mysite/django.wsgi.example')
        out_configfile = op.join( tempfile.gettempdir(), 'django.wsgi')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('USERNAME', env.user, data)
        data = re.sub('CATMAID_PATH', 'CATMAID', data)
        data = re.sub('PYTHON_VERSION', 'python3.6', data)

        o.write( data )
        o.close()

def installDjangoBackend():
    with settings(warn_only=True):

        packagelist = [
            'python-virtualenv',
            'libpq-dev python-dev',
            'libxml2-dev',
            'libxslt1-dev',
            'libjpeg-dev',
            'libtiff-dev',
            'libgraphicsmagick++3',
            'libgraphicsmagick++1-dev',
            'libboost-python1.48.0',
            'libboost-python1.48-dev',
            'ipython',
            'python-h5py',
        ]

        for each_package in packagelist:
            print(each_package)
            run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)

        packagelist = ['python-numpy', 'python-h5py' ,'graphicsmagick']
        for each_package in packagelist:
            print(each_package)
            run('sudo apt-get -y --force-yes build-dep %s' % each_package, pty = True)

        run('sudo apt-get install libapache2-mod-wsgi')

        with cd('CATMAID/django'):
            run('virtualenv --no-site-packages env')
            with prefix('source /home/ubuntu/CATMAID/django/env/bin/activate'):
                run('pip install Django==1.4')
                run('pip install distribute==0.6.25')
                run('pip install django-devserver==0.3.1')
                run('pip install numpy==1.6.1')
                run('pip install h5py==2.0.1')
                run('pip install psycopg2==2.4.1')
                run('pip install sqlparse==0.1.3')
                run('pip install wsgiref==0.1.2')
                run('pip install networkx==1.6')
                run('pip install pgmagick==0.5.1')
                run('pip install celery==2.4.6')
                run('pip install django-celery==2.4.2')
                run('pip install kombu==2.0.0')
                run('pip install django-kombu==0.9.4')
                run('pip install PyYAML==3.10')
                run('pip install python-dateutil==2.1')

        # settings.py
        put(op.join( tempfile.gettempdir(), 'settings.py'))
        sudo('mv -vf /home/ubuntu/settings.py /home/ubuntu/CATMAID/django/projects/mysite/settings.py')

        # django.wsgi
        put(op.join( tempfile.gettempdir(), 'django.wsgi'))
        sudo('mv -vf /home/ubuntu/django.wsgi /home/ubuntu/CATMAID/django/projects/mysite/django.wsgi')

        sudo('/etc/init.d/apache2 reload')
        sudo('sudo /etc/init.d/postgresql restart')

        # TODO: create django/static/neurohdf
        # and make it writable for the apache process

        # remove files in local temporary folder
        for file in ['settings.py', 'django.wsgi']:
            os.remove( op.join( tempfile.gettempdir(), file ) )


# Basic packages for catmaid
def installCatmaid():
    '''Basic packages for building, version control'''
    with settings(warn_only=True):

        installBasePackages()

        run('git clone -b cmw-integration git://github.com/catmaid/CATMAID.git')

        generateConfigFiles()

        put('apache.conf')
        sudo('chown root:root apache.conf')
        sudo('mv -vf /home/ubuntu/apache.conf /etc/phppgadmin/apache.conf')

        put('000-default')
        sudo('chown root:root 000-default')
        sudo('mv -vf /home/ubuntu/000-default /etc/apache2/sites-enabled/000-default')
        #sudo('a2dissite default')
        #sudo('a2ensite catmaid')
        sudo('/etc/init.d/apache2 reload')

        put(op.join( tempfile.gettempdir(), 'setup.inc.php'))
        sudo('chown root:root setup.inc.php')
        sudo('mv -vf /home/ubuntu/setup.inc.php /home/ubuntu/CATMAID/inc/setup.inc.php')

        put(op.join( tempfile.gettempdir(), 'pg_hba.conf'))
        sudo('chown postgres:postgres pg_hba.conf')
        sudo('chmod 644 pg_hba.conf')
        sudo('mv -vf /home/ubuntu/pg_hba.conf /etc/postgresql/9.1/main/pg_hba.conf')

        put(op.join( tempfile.gettempdir(), '.catmaid-db'))

        with cd('CATMAID'):
            run('scripts/createuser.sh {0} {1} {2} | sudo -u postgres psql'.format( catmaid_database_name, \
            catmaid_database_username, catmaid_database_password))

        # remove files in local temporary folder
        for file in ['setup.inc.php', 'pg_hba.conf', '.catmaid-db']:
            os.remove( op.join( tempfile.gettempdir(), file ) )

# this has to be run AFTER visiting http://domain/catmaid/
def installExampleProject():
    with settings(warn_only=True):
        with cd('CATMAID'):
            run('scripts/database/insert-example-projects.py')

# TODO: install celery

# See http://boto.readthedocs.org/en/latest/ec2_tut.html
def stopInstance():
    pass

def terminateInstance():
    pass

def enablephppgadmin():
    pass

def disablephppgadmin():
    pass

def updateCATMAID():
    """ Update the source code repository with the latest commit """
    with settings(warn_only=True):
        with cd('CATMAID'):
            run('git pull origin cmw-integration')


