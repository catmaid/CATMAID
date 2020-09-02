import sys
import shutil
import os
import math
import numpy as np
from cloudvolume import CloudVolume
from cloudvolume.exceptions import EmptyVolumeException
import logging
import argparse
from PIL import Image
import pathlib2 as pathlib
from tqdm import tqdm
import imageio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('tiler')


# Allow some arguments
parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True, help="Source dataset, e.g. s3://open-neurodata/bock11/image")
parser.add_argument("--target-dir", required=True)
parser.add_argument("--tile-width", default=1024, type=int, required=False, nargs='?')
parser.add_argument("--tile-height", default=1024, type=int, required=False)
parser.add_argument("--error-missing", default=False, action='store_true')
parser.add_argument("--batch-size-tiles-x", default=20, type=int)
parser.add_argument("--batch-size-tiles-y", default=20, type=int)
parser.add_argument("--batch-size-tiles-z", default=1, type=int)
parser.add_argument("--start-pos-x", default=0, type=int)
parser.add_argument("--start-pos-y", default=0, type=int)
parser.add_argument("--start-pos-z", default=0, type=int)
parser.add_argument("--mip", default=0, type=int, help="The MIP level to use")
parser.add_argument("--cache", default=False, required=False, action="store_true")
parser.add_argument("--cache-dir", default=None, required=False)
parser.add_argument("--output-z-offset", default=0, required=False, type=int)
parser.add_argument("--max-x", default=135424, required=False, type=int)
parser.add_argument("--max-y", default=119808, required=False, type=int)
parser.add_argument("--max-z", default=4150, required=False, type=int)
parser.add_argument("--progress", default=False, required=False, target="progress", action="store_true")
args = parser.parse_args()

cache = args.cache
if args.cache_dir:
    cache = args.cache_dir
    logger.info('Using cache dir {cache}'.format(cache=cache))

cache_dir =

# Clear cache
try:
    shutil.rmtree(cache, ignore_errors=True)
except e:
    logger.warn("Couldn't clear cache: " + str(e))

vol = CloudVolume(
    args.source, mip=args.mip, use_https=True,
    fill_missing=not args.error_missing, cache=cache
)

target_dir = args.target_dir
tile_width = args.tile_width
tile_height = args.tile_height
tile_depth = 1
ignore_empty_tiles = True
zoom_level = args.mip
z_offset = args.output_z_offset

max_x = args.max_x
max_y = args.max_y
max_z = args.max_z

# To not use too much memory, compute tiles for each section in batches. The
# area covered per batch is defined in terms of number of tiles in each
# dimension. 20x20 1024px tiles add up to abouy 410MB on disk.
batch_tiles_w = args.batch_size_tiles_x
batch_tiles_h = args.batch_size_tiles_y
batch_tiles_z = args.batch_size_tiles_z

# load data into numpy array
start_pos_x = args.start_pos_x
start_pos_y = args.start_pos_y
start_pos_z = args.start_pos_z
logger.info(f'Tiling data in bounding box ({start_pos_x}, {start_pos_y}, '
    f'{start_pos_z}) - ({start_pos_x + batch_tiles_w * tile_width}, '
    f'{start_pos_y + batch_tiles_h * tile_height}, {start_pos_z + tile_depth - 1})')

logger.info(f'Creating tiles in target dir {target_dir}')
n_total_files = batch_tiles_z*batch_tiles_h*batch_tiles_w
n_saved_tiles = 0
n_skipped = 0
n_error_skipped = 0

if args.progress:
    pbar = tqdm(total=n_total_files)
for tile_x in range(batch_tiles_w):
    x = start_pos_x + tile_x * tile_width
    abs_tile_col = int(math.floor(x / tile_width))
    for tile_y in range(batch_tiles_h):
        y = start_pos_y + tile_y * tile_height
        abs_tile_row = int(math.floor(y / tile_height))

        # Iterate over Z in most inner loop to make better use of cached blocks
        for tile_z in range(batch_tiles_z):
            z = start_pos_z + tile_z * tile_depth
            abs_z = z + z_offset

            # Continue if there is effectively no data in one dimension
            #print(x, tile_width, max_x, y, tile_height, max_y, z, max_z)
            #print(x - min(x + tile_width, max_x), y - min(y + tile_height, max_y), z - min(z + 1, max_z))
            if x - min(x + tile_width, max_x) >= 0 or y - min(y + tile_height, max_y) >= 0 or z - min(z + 1, max_z) >= 0:
                n_skipped += 1
                continue

            try:
                cutout = vol[x:min(x + tile_width, max_x), y:min(y + tile_height, max_y), z:min(z + 1, max_z)]
            except EmptyVolumeException:
                n_skipped += 1
                continue
            except e:
                logger.error('Error: ' + e)
                n_error_skipped += 1
                continue

            if ignore_empty_tiles and np.count_nonzero(cutout) == 0:
                n_skipped += 1
                if args.progress:
                    pbar.update()
                continue

            # save cutout as TIFF
            folder_path = os.path.join(target_dir, "{abs_z}/{zoom_level}".format(abs_z=abs_z, zoom_level=zoom_level))
            pathlib.Path(folder_path).mkdir(parents=True, exist_ok=True)
            file_path = os.path.join(folder_path, "{abs_tile_row}_{abs_tile_col}.jpg".format(abs_tile_row=abs_tile_row, abs_tile_col=abs_tile_col))

            # Get first two dimension and transpose data
            plane = np.transpose(cutout[:,:,0,0])
            imageio.imwrite(file_path, plane)

            if args.progress:
                pbar.update()
            n_saved_tiles += 1

if args.progress:
    pbar.close()

# Doesn't seem to work properly?
#vol.cache.flush()
try:
    shutil.rmtree(cache, ignore_errors=True)
except e:
    logger.warn("Couldn't clear cache: " + str(e))
logger.info('Saved {n_saved_tiles}/{n_total_files} tiles, ignored {diff} empty tiles, ignored {n_error_skipped} error tiles'.format(**{
    'n_saved_tiles': n_saved_tiles,
    'n_total_files': n_total_files,
    'n_error_skipped': n_error_skipped,
    'diff': n_total_files - n_saved_tiles,
}))
