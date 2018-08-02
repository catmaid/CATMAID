# -*- coding: utf-8 -*-

import urllib, json
import http.cookiejar as cj

class CatmaidInstance:
    """ A class giving access to a CATMAID instance.
    """

    def __init__(self, srv, catmaid_usr, catmaid_pwd,
            http_usr=None, http_pwd=None):
        # Store server and user information
        self.server = srv
        self.user = catmaid_usr
        self.password = catmaid_pwd
        # Cookie storage
        self.cookies = cj.CookieJar()
        # Handlers
        handlers = []
        # Add redirect handler
        handlers.append( urllib.request.HTTPRedirectHandler() )
        # Add cookie handler
        handlers.append( urllib.request.HTTPCookieProcessor( self.cookies ) )
        # Add HTTP authentification if needed
        if http_usr and http_pwd:
            authinfo = urllib.request.HTTPPasswordMgrWithDefaultRealm()
            authinfo.add_password(None, srv, http_usr, http_pwd)
            auth_handler = urllib.request.HTTPBasicAuthHandler(authinfo)
            # Add authentication handler
            handlers.append( auth_handler )
        # Create final opener
        self.opener = urllib.request.build_opener( *handlers )

    def mkurl(self, path):
        return self.server + path

    def login(self):
        url = self.mkurl("/accounts/login")
        opts = {
            'name': self.user,
            'pwd': self.password
        }

        data = urllib.parse.urlencode(opts)
        data = data.encode('utf-8')
        request = urllib.request.Request(url, data)
        response = self.opener.open(request)
        self.cookies.extract_cookies(response, request)

        return response.read()

    #Retrieves url from Server    
    def get_page(self, url, data=None):
        if data:
            data = urllib.parse.urlencode(data)
            data = data.encode('utf-8')
            request = urllib.request.Request(url, data)
        else:
            request = urllib.request.Request(url)

        response = self.opener.open(request)

        #Decode into array format
        return json.loads(response.read().decode("utf-8"))  

    #Use to parse url for retrieving stack infos
    def get_stack_info_url(self, pid, sid):
        return self.mkurl("/" + str(pid) + "/stack/" + str(sid) + "/info")

    #Use to parse url for retrieving skeleton nodes (no info on parents or synapses, does need post data)
    def get_skeleton_nodes_url(self, pid):
        return self.mkurl("/" + str(pid) + "/treenode/table/list")

    #Use to parse url for retrieving all info the 3D viewer gets (does NOT need post data)   
    def get_skeleton_for_3d_viewer_url(self, pid, skid):
        return self.mkurl("/" + str(pid) + "/skeleton/" + str(skid) + "/compact-json")
    
    #Use to parse url for retrieving connectivity (does need post data)
    def get_connectivity_url(self, pid):
        return self.mkurl("/" + str(pid) + "/skeleton/connectivity" )
    
    #Use to parse url for retrieving connectors (does need post data)
    def get_connectors_url(self, pid):
        return self.mkurl("/" + str(pid) + "/connector/skeletons" )       
        
    
   
    
