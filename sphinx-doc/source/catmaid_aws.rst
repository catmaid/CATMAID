Running a CATMAID Instance on Amazon AWS/EC2
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

Log in with the username 'gerhard' and password 'gerhard'.

You can access your database with the URL http://$ec2hostname/phppgadmin/. Note that exposing phpPgAdmin
to the public is highly insecure.

Now, setup the Django-backend::

    fab installDjangoBackend

.. add a function to make enable/disable phppgadmin visibility

In the next steps, you have customize and configure users, projects and stacks in the database,
and host your image data stacks. You do not need to host your dataset tile on the same instance,
but can choose to store them at any web-accessible host. You may want to get in contact with the
`OpenConnectome Project <http://openconnectomeproject.org/>`_ for large dataset storage.

If you want to update your instance to the latest development version, just call::

    fab updateCATMAID

In order to modify and control your database, you can use phppgadmin::

    http://$ec2-hostname/phppgadmin/

To obtain the relevant information for the stack (dimension, image_base), you need to tile your image dataset
and upload it to publicly accessible host. We assume you have a set of aligned, consecutive image files (e.g. TIFF)
of your dataset. You can then use the tiling scripts to generate a image pyramid. From the folder with your image
files, call the *tile_stack* script::

    ./path-to-your-CATMAID-clone/scripts/tiles/tile_stack "*.tif" 256 192

This creates the image pyramid folders with 256x256 pixel sized tiles. You can increase this to a number which is
a power of two. If you have successfully generated the image pyramid, upload them to your data host, and use
the URL to the base folder for the *image_base* when creating the stack.

.. note::

   The script creates tiles with non-square dimension, and it is only creating JPG files. We need a better script.
   Make sure that you also call ./ensure-tilesize.py


To create project, stack and user information and enable the tracing tool, you can login to your instance
by SSH and call relevant Python scripts::

    ssh -i downloaded_catmaidkey.pem ubuntu@$ec2-hostname
    cd CATMAID/scripts/database

You can then call the scripts as described in section 3 and 4 in :ref:`basic-installation`.

This fabfile should allow you to install CATMAID also on your local Ubuntu machine. Warning: It would
overwrite your Apache configuration::

    fab -H localhost installCatmaid
