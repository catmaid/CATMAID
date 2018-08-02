# -*- coding: utf-8 -*-

### Example for using CATMAID Frontend to retrieve a neuron's skeleton
### including the synaptic connectors

import urllib, json
import http.cookiejar as cj
from catmaid_frontend import *

remote_instance = None

#Provide Credentials for CATMAID Server
http_user = ''
http_pw = ''

catmaid_user = ''
catmaid_pw = ''

#Server URL is set for access from outside of Janelia
remote_instance = None
server_url = 'http://neurocean.janelia.org/catmaidL1'

#skeleton ID to pull neuron from server
example_skeleton_id = 11666771

#Create CATMAID instance
remote_instance =CatmaidInstance( server_url, catmaid_user, catmaid_pw, http_user, http_pw )
#Decode and print response from Server
print( json.loads( remote_instance.login().decode( 'utf-8' ) ) )

#Create URL for retrieving example skeleton from server
remote_skeleton_for_3D_url = remote_instance.get_skeleton_for_3d_viewer_url( 1 , example_skeleton_id )

#Retrieve node_data for example skeleton
skeleton_data = remote_instance.get_page( remote_skeleton_for_3D_url )

#Skeleton data is an array containg:
#skeleton_data = [neuron_name,[nodes],{tags},[connectors]
#[nodes] = treenode_id, parent_node_id, user_id, location_x, location_y, location_z, radius, confidence
print(skeleton_data)




