# -*- coding: utf-8 -*-

# For in a django shell

from catmaid.models import Component
from catmaid.control.stack import get_stack_info
from catmaid.control.neurohdf import extract_as_numpy_array

import numpy as np

project_id = 1
stack_id = 3
skeleton_id = 1443

# retrieve all components for a given skeleton id
components = Component.objects.filter(
        project = project_id,
        stack = stack_id,
        skeleton_id = skeleton_id
    ).all()

# retrieve stack information
stack_info = get_stack_info( project_id, stack_id )

# compute the skeleton bounding box
minX, minY = int(stack_info['dimension']['x']), int(stack_info['dimension']['y'])
maxX, maxY = 0,0
minZ, maxZ = int(stack_info['dimension']['z']), 0
for comp in components:
    minX = min(minX, comp.min_x)
    minY = min(minY, comp.min_y)
    minZ = min(minZ, comp.z)
    maxX = max(maxX, comp.max_x)
    maxY = max(maxY, comp.max_y)
    maxZ = max(maxZ, comp.z)

print('found bounding box', minX, minY, maxX, maxY, minZ, maxZ)

# create 3d array
data = np.zeros( (maxY-minY, maxX-minX, maxZ-minZ), dtype = np.uint8 )

# for all components, retrieve image and bounding box location
for comp in components:
    print('work on component', comp.id,  comp.component_id)
    img = extract_as_numpy_array( project_id, stack_id, comp.component_id, comp.z ).T
    # store image in array

    height = comp.max_y - comp.min_y + 1
    width = comp.max_x - comp.min_x + 1
    print('height, width', height, width)
    print('image shape (should match)', img.shape)
    try:
        indX = comp.min_x - minX
        indY = comp.min_y - minY
        data[indY:indY+height,indX:indX+width,comp.z] = img
    except:
        pass

# marching cube to extract surface
# visualize surface
from mayavi import mlab
mlab.figure(bgcolor=(0, 0, 0), size=(400, 400))
src = mlab.pipeline.scalar_field(data)
# Our data is not equally spaced in all directions:
sx = stack_info['resolution']['x']
sy = stack_info['resolution']['y']
sz = stack_info['resolution']['z']
src.spacing = [float(sy), float(sx), float(sz)]
src.update_image_data = True

# volume visualization filters: http://docs.enthought.com/mayavi/mayavi/mlab_case_studies.html?highlight=volume
