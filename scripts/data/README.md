A local file server for CATMAID
===============================

The `serve-directory.py` script is used to serve its enclosing directory through
HTTPS. This directory will typically contain image data that should be displayed
by CATMAID. This allows fast local access to image files.


Setup
-----

To use this functionality, make sure Python 2 or Python 3 is installed and that
the folder this file is part of contains a directory with image data, the
`serve-directory.py` script and a file called `localhost.pem`.

The `localhost.pem` certificate file should NEVER be used for actual encryption
and identity purposes. The private key is included for the purpose of making local
image data serving a little bit easier. A certificate with the same properties
can alternatively be generated the following way:

```
openssl req -new -x509 -keyout localhost.pem -out localhost.pem -days 24855 -nodes
```

Again: NEVER use the included localhost.pem certificate for security.


Starting the server
-------------------

To start the server, the `serve-directory.py` script has to be started, ideally
from a terminal/shell. It expects two parameters: a port to provide image access
from and a certificate file. The port can be any number greater than 1024. If a
port is already in use by another program, the `serve-directory.py`script will
fail with an error and you have to try a different port.

Assuming a terminal is open and the current working directory is the directory
of the `serve-directory.py` file (typically on a USB drive), a start command
would look like this:

```
./serve-directory.py 9999 localhost.pem
```

If this runs without errors, all files available in this directory are available
now through the URL `https://localhost:9999/`.


Making CATMAID aware of local image data
----------------------------------------

Together with the folder of the image data, there should be additional
metadata on it available. In particular the following needs to be known:

- The name of the folder containing the images (e.g. tiles)
- Image data file extension (typically jpg)
- Image tile width (e.g. 512)
- Image tile height (e.g. 512)
- Tile source type (e.g. 1)

If this information is available, CATMAID can be pointed to the local dataset:

1. Open the CATMAID project the image data is for.
2. Select the stack viewer that has the remote version of the local data set
   loaded.
3. Select the blue/white box in the lower left corner.
4. Find the stack's entry in the layer list in the newly open stack viewer
   properties.
5. Click on "Add" right next to "Custom mirrors".
6. Fill out the dialog, don't press OK yet. The URL will be of the form
   `https://localhost:<port>/<image-folder/`. So if your selected port is `9999`
   and the image data folder is called `tiles`, the URL would become
   `https://localhost:9999/tiles/`. Add the remaining information into the
   dialog.
7. Before (!) clicking OK, click on the underlined "here" link in the dialog's
   help text. It will try to open a sample tile using the provided data. If the
   provided SSL certificate (`localhost.pem`) is used or another self signed
   certificate has been generate (`openssl` command above), a SSL security
   exception will be shown. In this case, add a security exception for this
   certificate by clicking "Advanced" and then "Proceed to localhost (unsafe)".
   Only if an image tile is shown, go back to CATMAID and click OK in the
   dialog.
8. The locally served image data should now be available.
