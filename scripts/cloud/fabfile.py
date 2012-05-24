# This fabric file will launch a standalone instance running catmaid

### Imports
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

## Amazon web configuration
### update with your settings
### AWS access key and secret key can be located here: http://bit.ly/KiZ2VP

aws_access_key_id = ''		# access key for account with launch privileges 
aws_secret_access_key = ''	# secret key, set EC2 keypair below!
aws_size = 'm1.large' 		# or t1.micro
aws_keypair = 'ec2-keypair'	# your ec2 keypair
aws_AMI = 'ami-63be790a'	# ubuntu 10.04 LTS on US-East
env.user = 'ubuntu' 		# default user
localkeypath = ''               # path to your .pem file (or equivalent)
env.key_filename = localkeypath


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
		packagelist = ['git-core', 'mercurial', 'subversion', 'unzip', 'build-essential', 'g++']
		for each_package in packagelist: 
			print each_package
			run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)


# Basic packages for catmaid
def installCatmaid():
	'''Basic packages for building, version control'''
	with settings(warn_only=True):
		# Update image and install needed base components
		packagelist = ['libapache2-mod-php5', 'php5-pgsql', 'imagemagick', 'python-psycopg2', 'python-yaml', 'postgresql','pgadmin3','phppgadmin','postgresql-contrib']
		for each_package in packagelist: 
			print each_package
			run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)

		run('git clone https://github.com/acardona/CATMAID.git')
		sudo('rm -rvf /var/www/CATMAID')
		sudo('ln -s /home/ubuntu/CATMAID /var/www/CATMAID')
		sudo('mkdir -p /var/log/apache2/catmaid/')

		put('apache.conf')
		sudo('chown root:root apache.conf')
		sudo('mv -vf /home/ubuntu/apache.conf /etc/phppgadmin/apache.conf')

		put('catmaid')
		sudo('chown root:root catmaid')
		sudo('mv -vf /home/ubuntu/catmaid /etc/apache2/sites-available/catmaid')
		sudo('a2dissite default')
		sudo('a2ensite catmaid')
		sudo('/etc/init.d/apache2 reload')

		put('setup.inc.php')
		sudo('chown root:root setup.inc.php')
		sudo('mv -vf /home/ubuntu/setup.inc.php /home/ubuntu/CATMAID/inc/setup.inc.php')

		put('pg_hba.conf')
		sudo('chown root:root pg_hba.conf')
		sudo('chmod 600 pg_hba.conf')
		sudo('mv -vf /home/ubuntu/pg_hba.conf /etc/postgresql/8.4/main/pg_hba.conf')

		with cd('CATMAID'):
			run('sudo -u postgres psql < docs/createuser.sql')
			

def installFIJI():
	with settings(warn_only=True):
		sudo('apt-get install -y --force-yes libxtst-dev')
		run('wget http://fiji.sc/downloads/Madison/fiji-linux64-20110307.tar.bz2')
		run('tar xvjf fiji-linux64-20110307.tar.bz2')


# Install Jpeg2000 (kakadu) utils
def installImageComponents():
    with settings(warn_only=True):
            
            packagelist = ['libjpeg62-dev', 'libtiff-dev']
            for each_package in packagelist: 
                    print each_package
                    run('sudo apt-get -y --force-yes install %s' % each_package, pty = True)
    
            # install kakadu libraries here
            kakadu_tools = 'http://s3.amazonaws.com/wholeslide/installs/Kakadu_v6_3_1-00781N_Linux-64-bit-Compiled.tar.gz' 
            
            run("mkdir kakadu")	
            with cd('kakadu'):
                    run('wget %s' % kakadu_tools)
                    run('tar -xvzf Kakadu_v6_3_1-00781N_Linux-64-bit-Compiled.tar.gz')			
                    
                    run('sudo mv ./bin/* /usr/local/bin/')
                    run('sudo mv ./lib/* /usr/local/lib/')
                    run('sudo /sbin/ldconfig')
                    
            run('rm -rvf kakadu')


# this has to be run AFTER visiting http://domain/catmaid/
def installExampleData():
	with settings(warn_only=True):
		with cd('CATMAID'):
			run('sudo -u postgres psql < docs/createuser.sql')
			run('sudo -u postgres psql catmaid < docs/example-projects.sql')





