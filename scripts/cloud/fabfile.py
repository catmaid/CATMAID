# This fabric file will launch a standalone instance running catmaid

from __future__ import with_statement
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
import re

execfile('configuration.py')

# Creates a new instance with desired settings on aws
def buildApp():
    '''Creates a new instance on ec2 and returns the ip address and summary information'''
    with settings(warn_only = True):

        conn = ec2.EC2Connection(aws_access_key_id, aws_secret_access_key)
        reservation = conn.run_instances(aws_AMI, instance_type=aws_size, key_name=aws_keypair)
        instance = reservation.instances[0]
        
        print 'Starting instance %s' %(instance)
        while not instance.update() == 'running':
            time.sleep(1)
            sys.stdout.write('.')
            sys.stdout.flush()
            
        instance.add_tag('Name', 'incf_catmaid')                    
        print 'Instance started: %s' % instance.__dict__['id']
        print 'Public DNS: %s\n' % instance.__dict__['public_dns_name']
        
        print '************** Waiting 30 seconds for boot to finish **************\n'
        time.sleep(30)

        env.user = 'ubuntu'
        env.host_string = instance.__dict__['public_dns_name']

        installBasePackages()
        installImageComponents()
        installCatmaid()
        installFIJI()
        
        print 'Instance has been launched successfully'
        print 'To access, open a browser to http://%s/catmaid/' % (instance.__dict__['public_dns_name'])

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
            print each_package
            run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)

def generateConfigFiles():
    with settings(warn_only=True):

        in_configfile = op.join('../../inc/setup.inc.php.template')
        out_configfile = op.join( tempfile.gettempdir(), 'setup.inc.php')

        o = open( out_configfile ,'w')
        data = open( in_configfile, 'r' ).read()
        data = re.sub('catmaid_user', catmaid_database_username, data)
        data = re.sub('diamtac', catmaid_database_password, data)
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

def installDjangoBackend():
    pass

# Basic packages for catmaid
def installCatmaid():
    '''Basic packages for building, version control'''
    with settings(warn_only=True):

        installBasePackages()
        generateConfigFiles()

        run('git clone -b cmw-integration git://github.com/acardona/CATMAID.git')
        #sudo('rm -rvf /var/www/CATMAID')
        #sudo('ln -s /home/ubuntu/CATMAID /var/www/CATMAID')
        #sudo('mkdir -p /var/log/apache2/catmaid/')

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
        sudo('chown root:root pg_hba.conf')
        sudo('chmod 600 pg_hba.conf')
        sudo('mv -vf /home/ubuntu/pg_hba.conf /etc/postgresql/9.1/main/pg_hba.conf')

        put(op.join( tempfile.gettempdir(), '.catmaid-db'))

        with cd('CATMAID'):
            run('scripts/createuser.sh {0} {1} {2} | sudo -u postgres psql'.format( catmaid_database_name, \
            catmaid_database_username, catmaid_database_password))

# this has to be run AFTER visiting http://domain/catmaid/
def installExampleProject():
    with settings(warn_only=True):
        with cd('CATMAID'):
            run('scripts/database/insert-example-projects.py')


def updateCATMAID():
    """ Update the source code repository with the latest commit
    """
    with settings(warn_only=True):
        with cd('CATMAID'):
            run('git clone -b cmw-integration git://github.com/acardona/CATMAID.git')



