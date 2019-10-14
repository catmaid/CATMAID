#!/usr/bin/env python
# -*- coding: utf-8 -*-

# This script renames the directories in a CATMAID stack's image root
# to take into account missing layers corresponding to particular
# z-values.  This can occur when exporting the data from TrakEM2.

# Note that you will also have to add:
#  * add the new "missing" layers to the broken_slice table
#  * change the dimensions.z field of each stack in the stack
#    table
import os
import re
import subprocess

layers_missing_z = [
  4950.0,
  9450.0,
  17500.0,
  17550.0,
  17600.0
]

layers_missing = [ int(round(z/50)) for z in layers_missing_z ]

layers_missing.sort()

layers_to_insert = layers_missing[:]

# Find the layers we already have:

directories = sorted(int(x, 10) for x in os.listdir('.') if re.match(r'\d+$', x))

directory_mapping = list(zip(directories, directories))

while layers_to_insert:
    missing_layer = layers_to_insert.pop(0)
    for i, t in enumerate(directory_mapping):
        if t[1] >= missing_layer:
            directory_mapping[i] = (t[0], t[1] + 1)

for t in reversed(directory_mapping):
    if t[0] != t[1]:
        print("Will rename", t[0], "to", t[1])
        subprocess.check_call(["mv", str(t[0]), str(t[1])])

for l in layers_missing:
    print("Will create directory for missing layer", l)
    os.mkdir(str(l))
