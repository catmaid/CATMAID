Running a CATMAID instance on Amazon AWS/EC2
============================================

First, you have to register for `Amazon Web Services <http://aws.amazon.com/>`_.
We will use the free tier EC2, but you will need to provide an address, credit card
and a phone number. Register for EC2.

Prerequisites
-------------

You will need two Python packages to interface on the command-line with AWS::

    sudo pip install fabric
    sudo pip install boto


Installation
------------

Copy `configuration.py.template` to `configuration.py` and fill in the details
from your AWS registration.

First, we have to initialize an instance. For an overview of your current instances,
visit your `AWS Management Console` on the web. We create a new instance with fabric and boto::

    fab buildApp

You should see the new instance in the `AWS Management Console`. After a few minutes, status
checks should be green. Fill in the public DNS name in your `configuration.py` file. Then, we
can setup CATMAID on this instance with::

    fab installCatmaid

Once this is completed, try to visit your instance in the web browser with the URL: http://$ec2hostname/catmaid/
You should see a message `No projects available`. You can create example projects with::

    fab installExampleProject

Log in using any with the demo username & password 'gerhard'.

You can access your database with the URL http://$ec2hostname/phppgadmin/. Note that exposing phpPgAdmin
to the public is highly insecure.

Now, setup the Django-backend::

    fab installDjangoBackend

.. add a function to make enable/disable phppgadmin visibility

In the next steps, you have customize and configure users, projects and stacks in the database,
and host your image data stacks. You do not need to host your dataset tile on the same instance,
but can choose to store them at any web-accessible host. You may want to get in contact with the
`OpenConnectome Project <http://openconnectomeproject.org/>`_ for large dataset storage.

If you want to update your instance to the latest development commit, just call::

    fab updateCATMAID