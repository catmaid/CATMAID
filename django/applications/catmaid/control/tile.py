# -*- coding: utf-8 -*-

import base64
from contextlib import closing
from io import BytesIO
import logging
import numpy as np
import os
import math

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from catmaid.models import UserRole, TILE_SOURCE_TYPES
from catmaid.control.common import ConfigurationError, get_request_bool
from catmaid.control.authentication import requires_user_role



logger = logging.getLogger(__name__)

tile_loading_enabled = True
# Whether or not cloudvolume tile loading is enabled
cv_tile_loading_enabled = True

try:
    import h5py
except ImportError:
    tile_loading_enabled = False
    logger.info("CATMAID was unable to load the h5py library, which is an "
          "optional dependency. HDF5 tiles are therefore disabled. To enable, "
          "install h5py.")
try:
    from PIL import Image
except ImportError:
    tile_loading_enabled = False
    logger.warning("CATMAID was unable to load the PIL/pillow library. "
          "HDF5 tiles are therefore disabled.")

try:
    import cloudvolume
except ImportError:
    cv_tile_loading_enabled = False
    logger.warning("CATMAID was unable to load the cloudvolume library. "
          "Neuroglancer precomputed tiles are therefore disabled.")


@requires_user_role([UserRole.Browse])
def get_tile(request:HttpRequest, project_id=None, stack_id=None) -> HttpResponse:
    scale = float(request.GET.get('scale', '0'))
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = int(request.GET.get('z', '0'))
    col = request.GET.get('col', 'y')
    row = request.GET.get('row', 'x')
    file_extension = request.GET.get('file_extension', 'png')
    basename = request.GET.get('basename', 'raw')
    data_format = request.GET.get('format', 'hdf5')
    upscale = get_request_bool(request.GET, 'upscale', False)

    if data_format == 'hdf5':
        tile = get_hdf5_tile(scale, height, width, x, y, z, col, row,
                file_extension, basename)
    elif data_format == 'cloudvolume':
        tile = get_cloudvolume_tile(scale, height, width, x, y, z, col, row,
                file_extension, basename, upscale=upscale)
    else:
        raise ValueError(f'Unknown data format request: {data_format}')

    return tile


def get_hdf5_tile(scale, height, width, x, y, z, col, row, file_extension,
        basename):
    if not tile_loading_enabled:
        raise ConfigurationError("HDF5 tile loading is currently disabled")
    # need to know the stack name
    fpath=os.path.join(settings.HDF5_STORAGE_PATH, f'{project_id}_{stack_id}_{basename}.hdf')

    if not os.path.exists( fpath ):
        data=np.zeros( (height, width) )
        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        response = HttpResponse(content_type="image/png")
        pilImage.save(response, "PNG")
        return response

    with closing(h5py.File(fpath, 'r')) as hfile:
        # import math
        # zoomlevel = math.log(int(scale), 2)
        hdfpath = '/' + str(int(scale)) + '/' + str(z) + '/data'
        if not str(int(scale)) in hfile['/'].keys():
            data=np.zeros( (height, width) )
            pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
            response = HttpResponse(content_type="image/png")
            pilImage.save(response, "PNG")
            return response
        image_data=hfile[hdfpath]
        data=image_data[y:y+height,x:x+width]
        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        response = HttpResponse(content_type="image/png")
        pilImage.save(response, "PNG")
        return response

    return response


def get_cloudvolume_tile(scale, height, width, x, y, z, col, row,
        file_extension='png', basename=None, fill_missing=False, cache=True,
        upscale=False):
    if not cv_tile_loading_enabled:
        raise ConfigurationError("CloudVolume tile loading is currently disabled")

    if upscale:
        mip = math.ceil(abs(math.log(scale) / math.log(2)))
    else:
        mip = math.floor(abs(math.log(scale) / math.log(2)))
    scale_to_fit = False
    effective_scale = 1.0
    voxel_offset = (0, 0, 0)
    try:
        cv = cloudvolume.CloudVolume(basename, use_https=True, parallel=False,
                cache=cache, mip=mip, bounded=False, fill_missing=fill_missing)
        cutout = cv[x:(x + width), y:(y + height), z]
    except cloudvolume.exceptions.ScaleUnavailableError as e:
        logger.info(f'Need to use extra scaling, because mip level {mip} is not available: {e}')
        cv_test = cloudvolume.CloudVolume(basename, use_https=True, parallel=False,
                cache=cache, bounded=False, fill_missing=fill_missing)
        # Find mip closest to the request
        min_mip = None
        min_mip_dist = float('infinity')
        for ex_mip in cv_test.available_mips:
            if abs(mip - ex_mip) < min_mip_dist:
                min_mip = ex_mip
                min_mip_dist = abs(mip - ex_mip)

        if min_mip is None:
            raise ValueError('No fitting scale level found')

        # Get volume with best fit
        cv = cloudvolume.CloudVolume(basename, use_https=True, parallel=False,
                cache=cache, mip=min_mip, bounded=False, fill_missing=fill_missing)
        effective_scale = 2**mip / 2**min_mip

        # TODO: Correctly walk downsample factors / scale levels in each
        # dimensions for exact scaling in non power-of-two scale pyramids.
        scale_to_fit = True
        x, y = math.floor(x * effective_scale), math.floor(y * effective_scale)
        width, height = math.ceil(width * effective_scale), math.ceil(height * effective_scale)

    cutout = cv[
        (x + cv.voxel_offset[0]):(x + cv.voxel_offset[0] + width),
        (y + cv.voxel_offset[1]):(y + cv.voxel_offset[1] + height),
        z
    ]

    if cutout is None:
        data = np.zeros((height, width))
    else:
        data = np.transpose(cutout[:,:,0,0])

    img = Image.frombuffer('RGBA', (width, height), data, 'raw', 'L', 0, 1)

    if scale_to_fit:
        img = img.resize((math.ceil(width / effective_scale), math.ceil(height / effective_scale)))

    response = HttpResponse(content_type=f"image/{file_extension.lower()}")
    img.save(response, file_extension.upper())
    return response


@requires_user_role([UserRole.Annotate])
def put_tile(request:HttpRequest, project_id=None, stack_id=None) -> HttpResponse:
    """ Store labels to HDF5 """

    if not tile_loading_enabled:
        raise ConfigurationError("HDF5 tile loading is currently disabled")

    scale = float(request.POST.get('scale', '0'))
    height = int(request.POST.get('height', '0'))
    width = int(request.POST.get('width', '0'))
    x = int(request.POST.get('x', '0'))
    y = int(request.POST.get('y', '0'))
    z = int(request.POST.get('z', '0'))
    col = request.POST.get('col', 'y')
    row = request.POST.get('row', 'x')
    image = request.POST.get('image', 'x')

    fpath = os.path.join(settings.HDF5_STORAGE_PATH, f'{project_id}_{stack_id}.hdf')

    with closing(h5py.File(fpath, 'a')) as hfile:
        hdfpath = '/labels/scale/' + str(int(scale)) + '/data'
        image_from_canvas = np.asarray( Image.open( BytesIO(base64.decodestring(image)) ) )
        hfile[hdfpath][y:y+height,x:x+width,z] = image_from_canvas[:,:,0]

    return HttpResponse("Image pushed to HDF5.", content_type="plain/text")


class TileSource(object):

    def get_canary_url(self, mirror) -> str:
        """Get the canary URL for this mirror.
        """
        loc = mirror.stack.canary_location
        col = int(loc.x / mirror.tile_width)
        row = int(loc.y / mirror.tile_height)
        return self.get_tile_url(mirror, (col, row, loc.z))

    def get_tile_url(self, mirror, tile_coords, zoom_level=0) -> str:
        if True:
            raise Exception("Internal error: get_tile_url() should not be called from the parent TileSource class")
        return '' # For signature matching


class DefaultTileSource(TileSource):
    """ Creates the full path to the tile at the specified coordinate index for
    tile source type 1.
    """

    description = "File-based image stack"

    def get_tile_url(self, mirror, tile_coords, zoom_level=0) -> str:
        path = mirror.image_base
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s_%s_%s.%s" % (tile_coords[1], tile_coords[0],
                zoom_level, mirror.file_extension)
        return path


class BackslashTileSource(TileSource):
    """ Creates the full path to the tile at the specified coordinate index for
    tile source type 4.
    """

    description = "File-based image stack with zoom level directories"

    def get_tile_url(self, mirror, tile_coords, zoom_level=0) -> str:
        path = mirror.image_base
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s/%s_%s.%s" % (zoom_level, tile_coords[1],
                tile_coords[0], mirror.file_extension)
        return path


class LargeDataTileSource(TileSource):
    """ Creates the full path to the tile at the specified coordinate index
    for tile source type 5.
    """

    description = "Directory-based image stack"

    def get_tile_url(self, mirror, tile_coords, zoom_level=0) -> str:
        path = "%s%s/" % (mirror.image_base, zoom_level)
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s/%s.%s" % (tile_coords[1], tile_coords[0],
            mirror.file_extension)
        return path


tile_source_map = {
    1: DefaultTileSource,
    4: BackslashTileSource,
    5: LargeDataTileSource
}

def get_tile_source(type_id):
    """Get a tile source instance for a type ID.
    """
    if type_id not in tile_source_map:
        raise ValueError(f"Tile source type {type_id} is unknown")
    return tile_source_map[type_id]()
