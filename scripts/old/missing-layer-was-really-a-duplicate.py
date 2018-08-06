#!/usr/bin/env python
# -*- coding: utf-8 -*-

# One missing layer was really a duplicate - so:
#
#  - Remove that missing layer image directory
#  - Rename all the higher directories down one
#
# You also need to remove references to that layer from the
# broken_slice table, and decrease all (location.location).z values
# that are greater than or equal to layer_to_remove_z, and change the
# dimensions of the stack in the stack table.
#
#    DELETE FROM broken_slice WHERE index = 189 AND stack_id IN (4, 9);
#    UPDATE location SET location.z = ((location.location).z - 50) WHERE (location.location).z >= 9450.0 AND project_id = 4;
#    UPDATE stack SET dimension.z = ((stack.dimension).z - 1) WHERE id IN (4, 9);
#
# Coincidentally, Albert pointed out that the z calibration was set
# wrongly, so I subsequently used these commands to correct them:
#
#    UPDATE stack SET resolution.z = ((stack.resolution).z * 0.9) WHERE id IN (4, 9);
#    UPDATE location SET location.z = ((location.location).z * 0.9) WHERE project_id = 4;


import glob, os, re, sys, subprocess

layer_to_remove_z = 9450.0

layer_to_remove = int(round(layer_to_remove_z/50.0))

directories = filter(lambda x: re.match('\d+$', x), os.listdir('.'))
directories = [int(x, 10) for x in directories]
print(directories)
directories = [x for x in directories if x > layer_to_remove]
directories.sort()

directory_mapping = zip(directories, (x - 1 for x in directories))

subprocess.check_call(["rmdir", str(layer_to_remove)])

for t in directory_mapping:
    print("Will rename", t[0], "to", t[1])
    subprocess.check_call(["mv", str(t[0]), str(t[1])])
