.. _ami:

Creating a CATMAID Instance on EC2
==================================

If you use Amazon's EC2 service to host web services in the
cloud, you may find it easiest to create a new EC2 instance with
a running CATMAID from our new AMI (Amazon Machine Image).  You
can launch an EC2 instance (in the ``eu-west-1`` zone, directly
from `this link
<https://console.aws.amazon.com/ec2/home?region=eu-west-1#launchAmi=ami-ec545e98>`_
or if you want to find the AMI by hand in the public images in
``eu-west-1``, its AMI ID is: ``ami-ec545e98``.

This AMI is based on Canonical's Ubuntu 12.04 (precise) i386
image, backed by EBS.  It will run in a "micro" instance (one of
which is available in Amazon's free tier for a year if you
sign up for the first time) but for a production server you
would want a faster (and more expensive) virtual machine to run
CATMAID on.  (The CPU throttling on Micro instances will make
performance very unpredictable.)

Launching the EC2 Instance
##########################

When you launch the EC2 instance, make sure you choose a
security group (or security groups) that include at least SSH
(TCP port 22) and HTTP (TCP port 80).

Logging In
##########

You should log in over SSH with the username ``ubuntu`` and
specifying as your identity file the private key that you
downloaded from Amazon after creating your keypair; for example::

    ssh -i ~/.ssh/my-aws.pem ubuntu@whatever.compute.amazonaws.com

The ``ubuntu`` user can gain root privileges using ``sudo``,
which doesn't require a password.  The CATMAID code is owned by
(and runs as) the ``catmaid`` user, so if you wish to change the
code, you should switch to that user::

    sudo su - catmaid

The source code is in ``/home/catmaid/catmaid/``.

Server Configuration
####################

The AMI is configured to use Nginx + Gunicorn; by default it is
configured to use 4 synchronous worker threads, which can be
changed in ``/etc/init/gunicorn-catmaid.conf``.  (You can
restart Gunicorn with::

    sudo initctl restart gunicorn-catmaid

(We are not sure, at the moment, whether using gevent-based
greenlet worker threads is safe to use with CATMAID's current
"database transaction per HTTP request" model.)
