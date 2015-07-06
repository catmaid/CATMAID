CATMAID AWS Launcher
====================

Script Requirements: fabric, boto

    sudo pip install fabric
    sudo pip install boto

Based on install steps for CATMAID at https://github.com/catmaid/CATMAID

# Create keypair

Usage
-----

* Edit configuration.py, 

* run 'fab installCatmaid' from the command line

The instance will (boot), install, and configure a standalone catmaid install

* Once complete, the script will present the catmaid url: http://$ec2hostname/catmaid/

Before loading example data, first visit http://$ec2hostname/catmaid/ -> an error saying 'no projects available', but prepopulates fields

* After first visit, run 'fab installExampleProject $ec2hostname'
* Log in using any username, demo username & password is 'gerhard'

*Note: this configuration is highly insecure. Do not use in production!*

Original Author: Rich Stoner, Byproduct of the INCF Hackathon at MIT (September 8, 2011)
Modifications: Stephan Gerhard, June 2012
BSD License