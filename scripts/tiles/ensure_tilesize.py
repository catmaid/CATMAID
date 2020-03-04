#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
This is a helper script to ensure an image has the correct tile size.
It uses PIL to read and (if needed) correct the image. To use
it on a number of files one could use e.g. the find command:

  find <data-folder> -name *.jpg -exec scripts/ensure_tilesize.py {} 256 \;
"""

import sys
import os
from pathlib import Path
from argparse import ArgumentParser

from PIL import Image

parser = ArgumentParser(description=__doc__)
parser.add_argument("image_path", type=Path)
parser.add_argument("tile_size", type=int)
parsed = parser.parse_args()

image_path = parsed.image_path
tile_size = parsed.tile_size

if not image_path.is_file():
    raise FileNotFoundError(f"No image file at {image_path}")

img = Image.open(image_path)
width, height = img.size

if width == height == tile_size:
    sys.exit(0)

# crop away overhanging regions(left upper right lower)
cropped = img.crop((0, 0, min(width, tile_size), min(width, tile_size)))

# create black image of the right size to pad as necessary
out = Image.new(cropped.mode, (tile_size, tile_size))
out.paste(cropped)

out.save(image_path)
print(f"Corrected {image_path} from {width}x{height} to {tile_size}x{tile_size}", file=sys.stderr)
