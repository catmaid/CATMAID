.. _workflows:

Workflows
=========

Combining the functionality of different tools in CATMAID can be lead to smaller
and bigger workflows. This section is a collection of common tasks.

Neuron tracing in a limited area
--------------------------------

*Goal:* each user should trace only in a defined subvolume in the dataset, for
instance a cube.

*Workflow:*

1. Define a volume/mesh for each tracer in which they are supposed to
trace. You do this by opening the Volume Manager and select the "Add
volume" tab. By default, the box type is already selected, which is what
you want. Navigate the view to to the center of the cube the user should
trace in, enter a cube edge length in the "Cube at current location"
field and click "Define cube at current location". You can view a
preview in both the tracing layer and all 3D Viewers. It's advisable to
give the volume a reasonable names there to find the volumes in list and
submenus (like the 3D Viewer). Finally, press "Save", the volume should
be visible in the list on the "Main tab". From there you can also list
all skeletons and connectors in a volume and other actions. The third
tab in the Volume Manager allows you to find all the volumes a
particular set of skeleton innervates.

2. With the volume created, you can define a "tracing warning" in the
Settings Widget. It's almost at the bottom of the widget, or you filter
by "warning" in the top input box. In the warning section you can select
a volume in which new nodes are supposed to be. If they are outside, a
warning message is displayed.
