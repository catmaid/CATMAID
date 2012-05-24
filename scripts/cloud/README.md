# Catmaid AWS launcher

byproduct of the INCF Hackathon at MIT (September 8, 2011)

Rich Stoner

Script Requirements: fabric, boto

Based on install steps found at https://github.com/acardona/CATMAID

## Usage

* Edit fabfile.py, 
* Enter your AWS credentials, keypair, and desired 64-bit instance size (t1.micro, m1.large, etc)
* run 'fab buildApp' from the command line

The instance will boot, install, and configure a standalone catmaid install

* Once complete, the script will present the catmaid url: http://$ec2hostname/catmaid/

Before loading example data, first visit http://$ec2hostname/catmaid/ -> an error saying 'no projects available', but prepopulates fields

* After first visit, run 'fab installExampleData $ec2hostname'
* Log in using any username, demo username & password is 'gerhard'

*Note: this configuration is highly insecure. Do not use in production!*

## License 

BSD