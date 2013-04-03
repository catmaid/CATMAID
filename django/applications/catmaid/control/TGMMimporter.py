#based on importer.py
import json
import glob
import os.path
import numpy as np
import xml.etree.ElementTree as ET
import os

from django import forms
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.http import HttpResponse, HttpResponseRedirect
from django.template import Context, loader
from django.contrib.formtools.wizard.views import SessionWizardView
from django.shortcuts import render_to_response
from django.utils.datastructures import SortedDict
from django.db import transaction

from guardian.models import Permission, User, Group
from guardian.shortcuts import get_perms_for_model, assign

import urllib

from catmaid.models import Project, Stack, ProjectStack, Overlay, Treenode, ClassInstance, Class, Relation
from catmaid.fields import Double3D

from catmaid.control import common
from catmaid.control import treenode

from celery.task import task #TODO: try to make it work so import_tracks can be done asynchronous in the background instead of timing out
import time

import hotshot #for profiling purposes

TEMPLATES = {"pathsettings": "catmaid/importTGMM/setup_path.html",
             "confirmation": "catmaid/importTGMM/confirmation.html"}


class UserProxy(User):
    """ A proxy class for the user model as we want to be able to call
    get_name() on a user object and let it return the user name.
    """
    class Meta:
        proxy = True

    def get_name(self):
        return self.username

class GroupProxy(Group):
    """ A proxy class for the group model as we want to be able to call
    get_name() on a group object and let it return the group name.
    """
    class Meta:
        proxy = True

    def get_name(self):
        return self.name

class ImageBaseMixin:
    def set_image_fields(self, info_object, project_url, data_folder, needs_zoom):
        """ Sets the image_base, num_zoom_levels, file_extension fields
        of the calling object. Favor a URL field, if there is one. A URL
        field, however, also requires the existence of the
        'fileextension' and and 'zoomlevels' field.
        """
        if 'url' in info_object:
            self.image_base = info_object['url']
            if needs_zoom:
                self.num_zoom_levels = info_object['zoomlevels']
            self.file_extension = info_object['fileextension']
        else:
            # The image base of a stack is the combination of the
            # project URL and the stack's folder name.
            folder = info_object['folder']
            self.image_base = common.urljoin(project_url, folder)
            # Favor 'zoomlevel' and 'fileextension' fields, if
            # available, but try to find this information if thosa
            # fields are not present.
            zoom_available = 'zoomlevels' in info_object
            ext_available = 'fileextension' in info_object
            if zoom_available and needs_zoom:
                self.num_zoom_levels = info_object['zoomlevels']
            if ext_available:
                self.file_extension = info_object['fileextension']
            # Only retrieve file extension and zoom level if one of
            # them is not available in the stack definition.
            if (not zoom_available and needs_zoom) or not ext_available:
                file_ext, zoom_levels = find_zoom_levels_and_file_ext(
                    data_folder, folder, needs_zoom )
                # If there is no zoom level provided, use the found one
                if not zoom_available and needs_zoom:
                    self.num_zoom_levels = zoom_levels
                # If there is no file extension level provided, use the
                # found one
                if not ext_available:
                    self.file_extension = file_ext
        # Make sure the image base has a trailing slash, because this is expected
        if self.image_base[-1] != '/':
            self.image_base = self.image_base + '/'

        # Test if the data is accessible through HTTP
        self.accessible = check_http_accessibility( self.image_base, self.file_extension )

class PreOverlay(ImageBaseMixin):
    def __init__(self, info_object, project_url, data_folder):
        self.name = info_object['name']
        # Set default opacity, if available, defaulting to 0
        if 'defaultopacity' in info_object:
            self.default_opacity = info_object['defaultopacity']
        else:
            self.default_opacity = 0
        # Set 'image_base', 'num_zoom_levels' and 'fileextension'
        self.set_image_fields(info_object, project_url, data_folder, False)


class PreProject:
    def __init__(self, project_name, stack):
        self.name = project_name
        self.stacks = stack
        self.has_been_imported = False
        self.import_status = None
        # Mark this project as already known if all stacks are already known
        self.already_known = True
        
def find_zoom_levels_and_file_ext( base_folder, stack_folder, needs_zoom=True ):
    """ Looks at the first file of the first zoom level and
    finds out what the file extension as well as the maximum
    zoom level is.
    """
    # Make sure the base path, doesn't start with a separator
    if base_folder[0] == os.sep:
        base_folder = base_folder[1:]
    # Build paths
    datafolder_path = getattr(settings, datafolder_setting)
    project_path = os.path.join(datafolder_path, base_folder)
    stack_path = os.path.join(project_path, stack_folder)
    slice_zero_path = os.path.join(stack_path, "0")
    filter_path = os.path.join(slice_zero_path, "0_0_0.*")
    # Look for 0/0_0_0.* file
    found_file = None
    for current_file in glob.glob( filter_path ):
        if os.path.isdir( current_file ):
            continue
        found_file = current_file
        break
    # Give up if we didn't find something
    if found_file is None:
        return (None, None)
    # Find extension
    file_ext = os.path.splitext(found_file)[1][1:]
    # Look for zoom levels
    zoom_level = 1
    if needs_zoom:
        while True:
            file_name = "0_0_" + str(zoom_level) + "." + file_ext
            path = os.path.join(slice_zero_path, file_name)
            if os.path.exists(path):
                zoom_level = zoom_level + 1
            else:
                zoom_level = zoom_level - 1
                break
    return (file_ext, zoom_level)

def check_http_accessibility( image_base, file_extension ):
    """ Returns true if data below this image base can be accessed through HTTP.
    """
    slice_zero_url = common.urljoin(image_base, "0")
    first_file_url = common.urljoin(slice_zero_url, "0_0_0." + file_extension)
    code = urllib.urlopen(first_file_url).getcode()
    return code == 200

class ImportingWizard(SessionWizardView):
    
    requestDjango = None
    
    def get_template_names(self):
        return [TEMPLATES[self.steps.current]]

    def get_form(self, step=None, data=None, files=None):
        #executed before get_context_data in case you need to display information (in a form) based on the data from the previous step
        form = super(ImportingWizard, self).get_form(step, data, files)
        current_step = step or self.steps.current
        if current_step == 'confirmation':
            #get stack id from database based on name
            dataset_id_ = self.get_cleaned_data_for_step('pathsettings')['dataset_id']
            project_name_ = self.get_cleaned_data_for_step('pathsettings')['project_name']
            try:
                stackInfo = Stack.objects.get(title=dataset_id_) #we expect only one
            except Stack.DoesNotExist:
                stackInfo = []
                pass

            #make sure project name is unique
            matchProject = Project.objects.filter(title=project_name_).count()
            if matchProject > 0:
                stackInfo = []

            self_projects = PreProject(project_name_, stackInfo)
            self.projects = self_projects
            

            #check if folder exists for xml and how many file will be imported
            xml_basename_ = self.get_cleaned_data_for_step('pathsettings')['xml_basename']
            filePattern = xml_basename_ + '*.xml'
            self.files = glob.glob(  filePattern )
            self.files.sort() # to make sure we get them in order
        
        return form

    def get_context_data(self, form, **kwargs):
        context = super(ImportingWizard, self).get_context_data(form=form, **kwargs)

        if self.steps:
            if self.steps.current == 'confirmation':
                self_projects = self.projects
                context.update({
                    'projects': self_projects,
                })

                self_files = self.files
                context.update({
                    'filesXML': self_files,
                })

        context.update({
            'title': "TGMM Importer",
            'settings': settings
        })

        return context

    def done(self, form_list, **kwargs):
        """ Will add the selected projects.
        """

        #create new project
        selected_projects = self.projects
        make_public = self.get_cleaned_data_for_step('pathsettings')['make_projects_public']
        tile_width = selected_projects.stacks.tile_width
        tile_height = selected_projects.stacks.tile_height
        tile_source_type = selected_projects.stacks.tile_source_type #this should be 5 in order to have 5D visualization
        
        user_permissions = []
        #TODO
        #user_permissions = [(user_or_group, "can_administer"), 
        #                    (user_or_group, "can_annotate"), 
        #                    (user_or_group, "can_browse") ]
        #
        group_permissions = []

        permissions = user_permissions + group_permissions

        #create new project in the databse 
        imported_projects, not_imported_projects, trln = import_projects(
            selected_projects, make_public, permissions,
            tile_width, tile_height, tile_source_type)

        #usually uploading all the tracked points takes a while, so we use a separate project to do it
        filesXML = self.files

        if imported_projects: #checking that the project was imported coreectly
            fileOutputProgress = os.path.split(filesXML[0])
            fileOutputProgress = fileOutputProgress[0] + "/" + "progressReportFile.txt"

            #uncomment this to profile code. Check http://www.rkblog.rk.edu.pl/w/p/django-profiling-hotshot-and-kcachegrind/
            #prof = hotshot.Profile( "/media/sdd2/dataCATMAID/12_06_29/XMLfinalResult_large/importTracks.prof" )
            #prof.start()

            import_tracks(filesXML, selected_projects, trln, ImportingWizard.requestDjango, fileOutputProgress)

            #prof.stop()
        # Show final page
        return render_to_response('catmaid/importTGMM/done.html', {
            'projects': selected_projects,
            'imported_projects': imported_projects,
            'not_imported_projects': not_imported_projects,
        }) 
          
        

def TGMMimporter_admin_view(request, *args, **kwargs):
    """ Wraps the class based ImportingWizard view in a
    function based view.
    """

    ImportingWizard.requestDjango = request
    #each form is one of the steps in the importing wizard
    forms = [("pathsettings", DataFileForm),
             ("confirmation", ConfirmationForm)]
    view = ImportingWizard.as_view(forms)
    return view(request)

def TGMMimporter_finish(request):
    return render_to_response('catmaid/import/done.html', {})

def get_elements_with_perms_cls(element, cls, attach_perms=False):
    """ This is a slightly adapted version of guardians
    group retrieval. It doesn't need an object instance.
    """
    ctype = ContentType.objects.get_for_model(cls)
    if not attach_perms:
        return element.objects.all()
    else:
        elements = {}
        for elem in get_elements_with_perms_cls(element, cls):
            if not elem in elements:
                elements[elem] = get_perms_for_model(cls)
        return elements

def get_element_permissions(element, cls):
    elem_perms = get_elements_with_perms_cls(element, cls, True)
    elem_perms = SortedDict(elem_perms)
    elem_perms.keyOrder.sort(key=lambda elem: elem.get_name())
    return elem_perms

def get_element_permission_tuples(element_perms):
    """ Out of list of (element, [permissions] tuples, produce a
    list of tuples, each of the form
    (<element_id>_<perm_codename>, <element_name> | <parm_name>)
    """
    tuples = []
    for e in element_perms:
        for p in element_perms[e]:
            pg_id = str(e.id) + "_" + str(p.id)
            pg_title = e.get_name() + " | " + p.name
            tuples.append( (pg_id, pg_title) )
    return tuples

def get_permissions_from_selection(cls, selection):
    permission_list = []
    for perm in selection:
        elem_id = perm[:perm.index('_')]
        elem = cls.objects.filter(id=elem_id)[0]
        perm_id = perm[perm.index('_')+1:]
        perm = Permission.objects.filter(id=perm_id)[0]
        permission_list.append( (elem, perm) )
    return permission_list

class DataFileForm(forms.Form):
    """ A form to select basic properties on the data to be
    imported. Path and filter constraints can be set here.
    """
    xml_basename = forms.CharField(required=False,
        widget=forms.TextInput(attrs={'size':'40'}),
        help_text="Basename of the XML containing tracking solution.")

    dataset_id = forms.CharField(required=False,
        widget=forms.TextInput(attrs={'size':'40'}),
        help_text="Dataset name in the database associated with this tracking solution. The text mathicng has to be exact")

    project_name = forms.CharField(required=False,
        widget=forms.TextInput(attrs={'size':'40'}),
        help_text="Name of the new project (it should be unique).")

    make_projects_public = forms.BooleanField(initial=False,
        required=False, help_text="If made public, a project \
        can be seen without being logged in.")

    #TODO: get the datastes from the database in a pop down menu. Check django.forms.MultipleChoiceField an dpopulate it with the database

class ConfirmationForm(forms.Form):
    """ A form to confirm the selection and settings of the
    projects that are about to be imported.
    """
    something = forms.CharField(initial="", required=False)

def import_projects( pre_projects, make_public, permissions,
    tile_width, tile_height, tile_source_type ):
    """ Creates real CATMAID projects out of the PreProject objects
    and imports them into CATMAID.
    """
    imported = []
    not_imported = []
    #for pp in pre_projects:
    pp = pre_projects # we only have one in our case
    try:
        # Create stacks and add them to project
        stacks = []
        if pp.already_known == False: #add to to databse only if they dod not exist before
            #for s in pp.stacks:
            s = pp.stacks    
            stack = Stack.objects.create(
                title=s.title,
                dimension=s.dimension,
                resolution=s.resolution,
                image_base=s.image_base,
                num_zoom_levels=s.num_zoom_levels,
                file_extension=s.file_extension,
                tile_width=tile_width,
                tile_height=tile_height,
                tile_source_type=tile_source_type,
                metadata=s.metadata,
                t = s.t,
                c = s.c)
        else:
            stack = pp.stacks
        stacks.append( stack )                
        # Create new project
        p = Project.objects.create(
            title=pp.name,
            public=make_public)
        # Assign permissions to project
        #TODO
        #assigned_permissions = []
        #for user_or_group, perm in permissions:
        #    assigned_perm = assign( perm.codename, user_or_group, p )
        #    assigned_permissions.append( assigned_perm )
        
        # Add stacks to project
        for s in stacks:
            trln = Double3D()
            ps = ProjectStack.objects.create(
                project=p, stack=s, translation=trln)
        # Save and remember this project
        p.save()
        imported.append( pp )
    except Exception as e:
        not_imported.append( (pp, e) )

    return (imported, not_imported, trln)



@task()
def import_tracks(filesXML, project, trln, request, fileOutputProgress):
    """Import tracks into a selected project"""

    numNodes = 0
    numSkeletons = 0

    #obtan project object
    try:
        pp = Project.objects.get(title=project.name) #we expect only one
        project_id = pp.pk #primary key to insert nodes
    except Project.DoesNotExist:
        project_id = []
        pass


    user_id = request.user.id
    #print "Importing tracks into project " + project.name + " with id=" + str(project_id) + " and user_id=" + str(user_id)

    #setup database for tracing in this particular project
    setupTracingForProject(project_id, user_id),

    #preallocate memory to make it faster: we assume no more than maxNodesPerTM nodes per time point
    maxNodesPerTM = 300000
    numCol = 8 #x,y,z,t,c, radius, parentId, confidence
    treeNodeList = np.zeros( (maxNodesPerTM,numCol), dtype = float ) 
    
    nullVal = np.int64(-9223372036854775808) #default value to indicate None (numpy integer arrays do not hod NaN)
    parentId = nullVal * np.ones( (maxNodesPerTM,1), dtype = 'int64' ) #stores parentId for previous time opint in the database
    #skeletonId = nullVal * np.ones( (maxNodesPerTem,1), dtype = 'int64' ) #stores skeletonId for previous time opint in the database  
    
    #parentId = list(range( ( maxNodesPerTM )) ) # we use list because we need to store the skeleton model (not only id)
    #parentIdCurrent = list(range( ( maxNodesPerTM )) ) # to save current skeleton Id
    skeletonId = list(range( ( maxNodesPerTM )) ) # we use list because we need to store the skeleton model (not only id)
    skeletonIdCurrent = list(range( ( maxNodesPerTM )) ) # to save current skeleton Id


    
    tOld = int(filesXML[0][-8:-4]) - 1
    fout = open(fileOutputProgress,'w')
    fout.write("Saving tracked points in the database\n")    
    for f in filesXML:
        tic = time.time()
        t = int(f[-8:-4])
        
        if (t - tOld) != 1: # we assume consecutive time points
            print "ERROR: time points are not consecutive" #TODO: show error message in web page
            break

        #parse frame
        treeNodeList, numT = parse_TGMM_XML_file(f, treeNodeList, t, nullVal)
        
        #convert x,y,z from pixels to project coordinates
        treeNodeList[:numT, 0] *= project.stacks.resolution.x
        treeNodeList[:numT, 1] *= project.stacks.resolution.y

        treeNodeList[:numT, 2] = np.around(treeNodeList[:numT, 2]) #we need to round this coordinate so CATMAID can retieve points (we use z==z_cut to make query faster)
        treeNodeList[:numT, 2] *= project.stacks.resolution.z 
        treeNodeList[:numT, 0] += trln.x
        treeNodeList[:numT, 1] += trln.y
        treeNodeList[:numT, 2] += trln.z


        for ii in range(numT):

            #if node is dead assign it to its own skeleton
            if treeNodeList[ii,0] < -1e30 :
                treeNodeList[ii,6] = -1
            #figure out parentId and skeletonId    
            par = np.int64(treeNodeList[ii,6])
            if par < 0:#new lineage
                treeNodeList[ii,6] = nullVal
                skeletonIdCurrent[ii] = create_skeleton_new_lineage( treeNodeList[ii,:], project_id, request )
                numSkeletons += 1
            else:
                treeNodeList[ii,6] = parentId[ par ]
                skeletonIdCurrent[ii] = skeletonId[ par ]


        #update tree nodes in batch mode and obtain parentId and skeletonId in the database
        parentId, skeletonId = import_treeNodes_bulk_allWithParents( treeNodeList, numT, parentId, skeletonId, skeletonIdCurrent, project_id, request, nullVal )       

        numNodes += numT
        tOld = t
        toc = time.time()
        fout.write("Done saving all nodes from file " + f + " in " + str(toc-tic) + " secs \n")
        fout.flush()

    fout.write("Job completed successfully\n")
    fout.write("Saved a total of " + str(numNodes) + " nodes from " + str(numSkeletons) + " lineages in the database\n")
    fout.close()


def relate_neuron_to_skeleton(neuron, skeleton, relation_map, request, project_id):
        return treenode._create_relation(request.user, project_id, relation_map['model_of'], skeleton, neuron)

def insert_new_treenode(request, project_id, parent_id=None, skeleton=None, params={}):
    """ If the parent_id is not None and the skeleton_id of the parent does not match with the skeleton.id, then the database will throw an error given that the skeleton_id, being defined as foreign key in the treenode table, will not meet the being-foreign requirement.
    """
    new_treenode = Treenode()
    new_treenode.user = request.user
    new_treenode.editor = request.user
    new_treenode.project_id = project_id
    new_treenode.location = Double3D(float(params['x']), float(params['y']), float(params['z']))
    new_treenode.radius = int(params['radius'])
    new_treenode.skeleton = skeleton
    new_treenode.confidence = int(params['confidence'])

    new_treenode.location_t = int( params['t'] )
    new_treenode.location_c = int( params['c'] )


    if parent_id:
        new_treenode.parent_id = parent_id
    #so I can reuse teh function for bulk queries
    if bool(params['saveInDB']) == True:
        new_treenode.save()
    
    return new_treenode

def import_treeNodes( treeNodeList, numT, parentId, parentIdCurrent, skeletonId, skeletonIdCurrent, nullVal, project_id, request ):
    """Save a list of treenodes into the database 
        TreeNodeList order is x,y,z,t,c, radius, parentId, confidence"""


    for ii in range(numT):
        #if node is dead do not do anything
        if treeNodeList[ii,0] < -1e30 :
            continue
        #copied from treeNode.py::createNewNode()
        params = {
                'x': treeNodeList[ii,0],
                'y': treeNodeList[ii,1],
                'z': treeNodeList[ii,2],
                'radius': treeNodeList[ii,5],

                'confidence': int(treeNodeList[ii,7]),
                't'        :  int(treeNodeList[ii,3]),
                'c'         : int(treeNodeList[ii,4]),

                'targetgroup': "Fragments",

                'useneuron': np.int64(-1),
                'parent_id': np.int64(treeNodeList[ii,6]),

                'saveInDB' : True
                }

        relation_map = common.get_relation_to_id_map(project_id)
        class_map = common.get_class_to_id_map(project_id)
        response_on_error = ''

        try:
            if nullVal != int(params['parent_id']):  # A root node and parent node exist
                #parent_treenode = Treenode.objects.get(pk=params['parent_id'])
                parent_treenode = parentIdCurrent[ii]
                
                #Not needed for TGMM importer
                #has_changed_group = False     
                #if parent_treenode.parent_id is None and 1 == Treenode.objects.filter(skeleton_id=parent_treenode.skeleton_id).count():
                #    # Node is isolated. If it is a part_of 'Isolated synapatic terminals',
                #    # then reassign the skeleton's and neuron's user_id to the user.
                #    # The treenode remains the property of the original user.
                #    neuron_id, skeleton_id = treenode._maybe_move_terminal_to_staging(request.user, project_id, parent_treenode.id)
                #    has_changed_group = True

                response_on_error = 'Could not insert new treenode!'
                #skeleton = ClassInstance.objects.get(pk=parent_treenode.skeleton_id)
                skeleton = skeletonIdCurrent[ii] #saved before hand
                new_treenode = insert_new_treenode(request, project_id, params['parent_id'], skeleton, params)

                skeletonId[ii] = skeleton
                parentId[ii] = new_treenode
                #return HttpResponse(json.dumps({'treenode_id': new_treenode.id, 'skeleton_id': skeleton.id, 'has_changed_group': has_changed_group}))

            else:
                # No parent node: We must create a new root node, which needs a
                # skeleton and a neuron to belong to.
                response_on_error = 'Could not insert new treenode instance!'

                new_skeleton = ClassInstance()
                new_skeleton.user = request.user
                new_skeleton.project_id = project_id
                new_skeleton.class_column_id = class_map['skeleton']
                new_skeleton.name = 'skeleton'
                new_skeleton.save()
                new_skeleton.name = 'skeleton %d' % new_skeleton.id
                new_skeleton.save()

                if -1 == params['useneuron']:
                    # Check that the neuron to use exists
                    if 0 == ClassInstance.objects.filter(pk=params['useneuron']).count():
                        params['useneuron'] = -1

                if -1 != params['useneuron']:  # A neuron already exists, so we use it
                    response_on_error = 'Could not relate the neuron model to the new skeleton!'
                    relate_neuron_to_skeleton(params['useneuron'], new_skeleton.id, relation_map, request, project_id)

                    response_on_error = 'Could not insert new treenode!'
                    new_treenode = insert_new_treenode(request,project_id, None, new_skeleton, params)

                    #return HttpResponse(json.dumps({
                    #    'treenode_id': new_treenode.id,
                    #    'skeleton_id': new_skeleton.id,
                    #    'neuron_id': params['useneuron']}))
                    skeletonId[ii] = new_skeleton
                    parentId[ii] = new_treenode
                else:
                    # A neuron does not exist, therefore we put the new skeleton
                    # into a new neuron, and put the new neuron into a group.
                    # Instead of placing the new neuron in the Fragments group,
                    # place the new neuron in the staging area of the user.

                    # Fetch the parent group: can be the user staging group
                    # or the Isolated synaptic terminals group
                    parent_group, is_new = treenode._fetch_targetgroup(request.user, project_id, params['targetgroup'], relation_map['part_of'], class_map)
                    response_on_error = 'Failed to insert new instance of a neuron.'
                    new_neuron = ClassInstance()
                    new_neuron.user = request.user
                    new_neuron.project_id = project_id
                    new_neuron.class_column_id = class_map['neuron']
                    new_neuron.name = 'neuron'
                    new_neuron.save()
                    new_neuron.name = 'neuron %d' % new_neuron.id
                    new_neuron.save()

                    response_on_error = 'Could not relate the neuron model to the new skeleton!'
                    relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id, relation_map, request, project_id)

                    # Add neuron to the group
                    response_on_error = 'Failed to insert part_of relation between neuron id and fragments group.'
                    treenode._create_relation(request.user, project_id, relation_map['part_of'], new_neuron.id, parent_group.id)

                    response_on_error = 'Failed to insert instance of treenode.'
                    new_treenode = insert_new_treenode(request, project_id,None, new_skeleton, params)

                    response_on_error = 'Failed to write to logs.'
                    common.insert_into_log(project_id, request.user.id, 'create_neuron', new_treenode.location, 'Create neuron %d and skeleton %d' % (new_neuron.id, new_skeleton.id))

                    skeletonId[ii] = new_skeleton
                    parentId[ii] = new_treenode

                    #return HttpResponse(json.dumps({
                    #    'treenode_id': new_treenode.id,
                    #    'skeleton_id': new_skeleton.id,
                    #    'refresh': is_new
                    #    }))

        except Exception as e:
            import traceback
            raise Exception(response_on_error + ':' + str(e) + str(traceback.format_exc()))   

    return (parentId, skeletonId)

def create_skeleton_new_lineage( treeNodeList, project_id, request ):
    """Save a list of treenodes into the database 
        TreeNodeList order is x,y,z,t,c, radius, parentId, confidence"""


    #copied from treeNode.py::createNewNode()
    params = {
            'x': treeNodeList[0],
            'y': treeNodeList[1],
            'z': treeNodeList[2],
            'radius': treeNodeList[5],

            'confidence': int(treeNodeList[7]),
            't'        :  int(treeNodeList[3]),
            'c'         : int(treeNodeList[4]),

            'targetgroup': "Fragments",

            'useneuron': np.int64(-1),
            'parent_id': np.int64(treeNodeList[6]), #it should be nullVal

            'saveInDB' : True
            }

    relation_map = common.get_relation_to_id_map(project_id)
    class_map = common.get_class_to_id_map(project_id)
    response_on_error = ''

    try:
        # No parent node: We must create a new root node, which needs a
        # skeleton and a neuron to belong to.
        response_on_error = 'Could not insert new treenode instance!'

        new_skeleton = ClassInstance()
        new_skeleton.user = request.user
        new_skeleton.project_id = project_id
        new_skeleton.class_column_id = class_map['skeleton']
        new_skeleton.name = 'skeleton'
        new_skeleton.save()
        new_skeleton.name = 'skeleton %d' % new_skeleton.id
        new_skeleton.save()

        if -1 == params['useneuron']:
            # Check that the neuron to use exists
            if 0 == ClassInstance.objects.filter(pk=params['useneuron']).count():
                params['useneuron'] = -1

        if -1 != params['useneuron']:  # A neuron already exists, so we use it
            response_on_error = 'Could not relate the neuron model to the new skeleton!'
            relate_neuron_to_skeleton(params['useneuron'], new_skeleton.id, relation_map, request, project_id)

            #response_on_error = 'Could not insert new treenode!'
            #new_treenode = insert_new_treenode(request,project_id, None, new_skeleton, params)

            #return HttpResponse(json.dumps({
            #    'treenode_id': new_treenode.id,
            #    'skeleton_id': new_skeleton.id,
            #    'neuron_id': params['useneuron']}))
            return new_skeleton
        else:
            # A neuron does not exist, therefore we put the new skeleton
            # into a new neuron, and put the new neuron into a group.
            # Instead of placing the new neuron in the Fragments group,
            # place the new neuron in the staging area of the user.

            # Fetch the parent group: can be the user staging group
            # or the Isolated synaptic terminals group
            parent_group, is_new = treenode._fetch_targetgroup(request.user, project_id, params['targetgroup'], relation_map['part_of'], class_map)
            response_on_error = 'Failed to insert new instance of a neuron.'
            new_neuron = ClassInstance()
            new_neuron.user = request.user
            new_neuron.project_id = project_id
            new_neuron.class_column_id = class_map['neuron']
            new_neuron.name = 'neuron'
            new_neuron.save()
            new_neuron.name = 'neuron %d' % new_neuron.id
            new_neuron.save()

            response_on_error = 'Could not relate the neuron model to the new skeleton!'
            relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id, relation_map, request, project_id)

            # Add neuron to the group
            response_on_error = 'Failed to insert part_of relation between neuron id and fragments group.'
            treenode._create_relation(request.user, project_id, relation_map['part_of'], new_neuron.id, parent_group.id)

            #response_on_error = 'Failed to insert instance of treenode.'
            #new_treenode = insert_new_treenode(request, project_id,None, new_skeleton, params)

            response_on_error = 'Failed to write to logs.'
            common.insert_into_log(project_id, request.user.id, 'create_neuron', Double3D(float(params['x']), float(params['y']), float(params['z'])), 'Create neuron %d and skeleton %d' % (new_neuron.id, new_skeleton.id))

            return new_skeleton

            #return HttpResponse(json.dumps({
            #    'treenode_id': new_treenode.id,
            #    'skeleton_id': new_skeleton.id,
            #    'refresh': is_new
            #    }))

    except Exception as e:
        import traceback
        raise Exception(response_on_error + ':' + str(e) + str(traceback.format_exc()))   



def import_treeNodes_bulk_allWithParents( treeNodeList, numT, parentId, skeletonId, skeletonIdCurrent, project_id, request, nullVal ):
    """Save a list of treenodes into the database in bulk to save time in the transaction.
        We assume all the nodes have a parent so we do not have to create new skeletons or neurons 
        TreeNodeList order is x,y,z,t,c, radius, parentId, confidence"""


    bulkQuery = list( range(numT) ) #I preallocate it only once
    for ii in range(numT):
        #copied from treeNode.py::createNewNode()
        #params = {
        #        'x': treeNodeList[ii,0],
        #        'y': treeNodeList[ii,1],
        #        'z': treeNodeList[ii,2],
        #        'radius': treeNodeList[ii,5],

        #        'confidence': int(treeNodeList[ii,7]),
        #        't'        :  int(treeNodeList[ii,3]),
        #        'c'         : int(treeNodeList[ii,4]),

        #        'parent_id': np.int64(treeNodeList[ii,6]),

        #        'saveInDB' : False
        #        }
        #bulkQuery[ii] = insert_new_treenode(request, project_id, parentIdCurrent[ii].id, skeletonIdCurrent[ii], params)

        parent_id = np.int64(treeNodeList[ii,6]) 
        
        #these thre values are always the same
        bulkQuery[ii] = Treenode()
        bulkQuery[ii].user = request.user
        bulkQuery[ii].editor = request.user
        bulkQuery[ii].project_id = project_id

        bulkQuery[ii].location = Double3D(float(treeNodeList[ii,0]), float(treeNodeList[ii,1]), float(treeNodeList[ii,2]))
        bulkQuery[ii].radius = int(treeNodeList[ii,5])
        bulkQuery[ii].skeleton = skeletonIdCurrent[ii]
        bulkQuery[ii].confidence = int(treeNodeList[ii,7])

        bulkQuery[ii].location_t = int( treeNodeList[ii,3] )
        bulkQuery[ii].location_c = int( treeNodeList[ii,4] )

        if parent_id != nullVal:
            bulkQuery[ii].parent_id = parent_id
        else:
            bulkQuery[ii].parent_id = None

    #perform bulk query
    try:
        response_on_error = 'Could not insert new bulk of treenodes!'
        Treenode.objects.bulk_create(bulkQuery)
    except Exception as e:
        import traceback
        raise Exception(response_on_error + ':' + str(e) + str(traceback.format_exc())) 

    #retrieve skeleton and parent_id information after bulk update
    try:
        nn = 0
        #for tt in Treenode.objects.select_related('parent').filter(project_id = project_id, location_t = int(treeNodeList[ii,3]), user_id = request.user.id ).order_by('pk'):
        for tt in Treenode.objects.values('id').filter(project_id = project_id, location_t = int(treeNodeList[ii,3]), user_id = request.user.id ).order_by('pk'):
            skeletonId[nn] = skeletonIdCurrent[nn]
            parentId[nn] = tt['id']
            #if tt.parent:
            #    parentId[nn] = tt.parent.id #this hits the database again because parent is a foreignKey relation unless we use select_related()
            #else:
            #    parentId[nn] = nullVal
            nn += 1

        if nn != numT:
            raise Exception("Number of objects retrieved is different than inserted")

    except Exception as e:
            import traceback
            raise Exception(response_on_error + ':' + str(e) + str(traceback.format_exc())) 

    return (parentId, skeletonId)

def parse_TGMM_XML_file(fileXML, treeNodeList, t, nullVal):
    """ Parses tracking information from TGMM xml files"""

    channel_ = 0 #default TODO: allow user to change it
    radius = -1  #TODO: extract it from W
#parse xml
    tree = ET.parse(fileXML)
    root = tree.getroot()

    numT = 0
    for gmm in root.findall('GaussianMixtureModel'):
        m = [float(x) for x in gmm.get('m').split()]
        parent = int(gmm.get('parent'))
        confidence = int(gmm.get('splitScore'))

        #save elements
        treeNodeList[numT, :] =[m[1], m[0], m[2], t, channel_, radius, parent, confidence] #apparently TGMM flips x,y woth respect how CATMAID displays elements
        numT = numT + 1




    return (treeNodeList, numT)


def setupTracingForProject(project_id, user_id):
    """Copied from catmaid_setup_tracing_for_project to stabish the necessary entries for the tracing tool in a project"""
    project = Project.objects.get(pk=project_id)
    user = User.objects.get(pk=user_id)

    # Create the classes first:

    class_dictionary = {}

    for required_class in ("skeleton",
                           "neuron",
                           "group",
                           "label",
                           "root"):
        class_object, _ = Class.objects.get_or_create(
            class_name=required_class,
            project=project,
            defaults={'user': user})
        class_dictionary[required_class] = class_object

    # Make sure that a root node exists:

    ClassInstance.objects.get_or_create(
        class_column=class_dictionary['root'],
        project=project,
        defaults={'user': user,
                  'name': 'neuropile'})

    # Now also create the relations:

    for relation_required in ("labeled_as",
                              "postsynaptic_to",
                              "presynaptic_to",
                              "element_of",
                              "model_of",
                              "part_of",
                              "is_a"):
        Relation.objects.get_or_create(
            relation_name=relation_required,
            project=project,
            defaults={'user': user})