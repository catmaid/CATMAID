## Amazon web configuration
### Update with your settings

# Find it:http://blog.cloudberrylab.com/2010/03/how-to-find-your-aws-access-key-id-and.html
aws_access_key_id = '' # access key for account with launch privileges
aws_secret_access_key = '' # secret key, set EC2 keypair below!

# The instance you want to setup
aws_size = 't1.micro'

aws_keypair_name = ''	# your ec2 keypair
# aws_AMI = 'ami-63be790a'

# Default user
env.user = 'ubuntu'

# path to your .pem file (or equivalent)
env.key_filename = ''

# host name (Public DNS)
env.host_string = ''

# CATMAID configuration
catmaid_database_name = ''
catmaid_database_username = ''
catmaid_database_password = ''

