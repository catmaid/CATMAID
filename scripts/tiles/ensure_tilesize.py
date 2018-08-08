#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# This is a helper script to ensure an image has the correct tile size.
# It uses pgmagick[1] to read and (if needed) correct the image. To use
# it on a number of files one could use e.g. the find command:
#
#   find <data-folder> -name *.jpg -exec scripts/ensure_tilesize.py {} 256 \;
#
# [1] http://pypi.python.org/pypi/pgmagick/

import sys
import os
from pgmagick import Image, Geometry, Color, CompositeOperator as co

# Make sure we got the arguments we expect
if len(sys.argv) != 3:
    print("Usage: ensure_tilesize.py <FILENAME> <TILESIZE>", file=sys.stderr)
    sys.exit(1)

image_path = sys.argv[1]
tile_size = int(sys.argv[2])

# Make sure the file actually exists
if not os.path.exists(image_path):
    print("Could not find file!", file=sys.stderr)
    sys.exit(1)

# Get properties of image
image = Image(image_path)
image_width = image.size().width()
image_height = image.size().height()
image_name = image.fileName()

# If the image has the correct size, just exit
if image_width == tile_size and image_height == tile_size:
    sys.exit(0)

# A new image with the correct size is needed, create it
geometry = Geometry(tile_size, tile_size)
color = Color("black")
new_image = Image(geometry, color)
# Copy original image to position 0,0 of new image
new_image.composite(image, 0, 0, co.OverCompositeOp)
# Override original image
new_image.write(image_name)

print("Corrected " + image_name + " from " + str(image_width) + "x" + str(image_height) + " to " + str(tile_size) + "x" + str(tile_size), file=sys.stderr)

