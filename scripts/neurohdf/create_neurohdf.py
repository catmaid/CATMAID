#!/usr/bin/python
# -*- coding: utf-8 -*-

# Create a project and stack associated HDF5 file with additional
# data such as labels, meshes etc.



import os.path as op
import h5py
from contextlib import closing
import numpy as np

from django.conf import settings

project_id = 3
stack_id = 4
filepath = settings.HDF5_STORAGE_PATH

with closing(h5py.File(op.join(filepath, '%s_%s.hdf' % (project_id, stack_id)), 'w')) as hfile:
    mesh=hfile.create_group('meshes')
    midline=mesh.create_group('midline')
    midline.create_dataset("vertices", data=np.array( [61200,  15200, 26750,63920,  26400, 76800, 66800,57600,76800, 69200,53120,26750] , dtype = np.float32 ) )
    # faces are coded according to the three.js JSONLoader standard.
    # See https://github.com/mrdoob/three.js/blob/master/src/extras/loaders/JSONLoader.js
    midline.create_dataset("faces", data=np.array( [0, 0, 1, 2,  0,2,3,0] , dtype = np.uint32 ) )

    image=hfile.create_group('myimage')

    image.attrs['axis0__label'] = 'x'
    image.attrs['axis0__unit_label'] = 'micrometer'
    image.attrs['axis0__unit_xref'] = 'UO:0000017'
    # the interval defines for a spatial axis the resolution / dimension
    # for scale 0
    image.attrs['axis0__interval'] = 1.0

    image.attrs['axis1__label'] = 'y'
    image.attrs['axis1__unit_label'] = 'micrometer'
    image.attrs['axis1__unit_xref'] = 'UO:0000017'
    image.attrs['axis1__interval'] = 1.0

    image.attrs['axis2__label'] = 'z'
    image.attrs['axis2__unit_label'] = 'micrometer'
    image.attrs['axis2__unit_xref'] = 'UO:0000017'
    image.attrs['axis2__interval'] = 1.0

    dataset=np.random.random_integers(0,255, (1024,1024,10))
    scale=image.create_group('scale')
    scale.attrs['number_of_scales'] = 3

    scale0=scale.create_group('0')
    scale0.attrs['axes_scaling_factor'] = (1.0, 1.0, 1.0)
    scale0.create_dataset('data', data=dataset, dtype = np.uint8)

    scale1=scale.create_group('1')
    scale1.create_dataset('data', data=dataset[::2,::2,:], dtype = np.uint8)
    scale1.attrs['axes_scaling_factor'] = (0.5, 0.5, 1.0)

    scale2=scale.create_group('2')
    scale2.create_dataset('data', data=dataset[::4,::4,:], dtype = np.uint8)
    scale2.attrs['axes_scaling_factor'] = (0.25, 0.25, 1.0)

    image=hfile.create_group('labels')
    scale=image.create_group('scale')
    scale0=scale.create_group('0')
    scale0.create_dataset('data', data=np.zeros( (1024,1024,10)),
                          dtype = np.uint8)

    scale1=scale.create_group('1')
    scale1.create_dataset('data', data=np.zeros( (512,512,10)),
                          dtype = np.uint8)

    scale2=scale.create_group('2')
    scale2.create_dataset('data', data=np.zeros( (256,256,10)),
                          dtype = np.uint8)

    # multi-scale image data in hdf5
    # myimage/ (type:multi_scale_image)
    #   scale/ (int:number_of_scales)
    #       0/
    #           irregular_dataset:mydataset
    #       1/
