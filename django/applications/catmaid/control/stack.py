from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

import os, os.path
from contextlib import closing
import h5py

def get_stack_info(project_id=None, stack_id=None, user=None):
    """ Returns a dictionary with relevant information for stacks.
    Depending on the tile_source_type, get information from database
    or from tile server directly
    """
    p = get_object_or_404(Project, pk=project_id)
    s = get_object_or_404(Stack, pk=stack_id)
    ps_all = ProjectStack.objects.filter(project=project_id, stack=stack_id)
    num_stacks = len(ps_all)
    if num_stacks == 0:
        return {'error': 'There is no stack with ID %s linked to the ' \
                         'project with ID %s.' % (stack_id, project_id)}
    elif num_stacks > 1:
        return {'error': 'The stack with ID %s is linked multiple times ' \
                         'to the project with ID %s, but there should only be ' \
                         'one link.' % (stack_id, project_id)}
    ps=ps_all[0]
    can_edit = user.has_perm('can_administer', p) or user.has_perm('can_annotate', p)

    # https://github.com/acardona/CATMAID/wiki/Convention-for-Stack-Image-Sources
    if int(s.tile_source_type) == 2:
        # request appropriate stack metadata from tile source
        url=s.image_base.rstrip('/').lstrip('http://')
        # Important: Do not use localhost, but 127.0.0.1 instead
        # to prevent an namespace lookup error (gaierror)
        # Important2: Do not put http:// in front!
        conn = httplib.HTTPConnection(url)
        conn.request('GET', '/metadata')
        response = conn.getresponse()
        # read JSON response according to metadata convention
        # Tornado reponse is escaped JSON string
        read_response = response.read()
        # convert it back to dictionary str->dict
        return json.loads(read_response)
    else:
        broken_slices_qs = BrokenSlice.objects.filter(stack=stack_id)
        broken_slices = {}
        for ele in broken_slices_qs:
            broken_slices[ele.index] = 1
        overlays = []
        overlays_qs = Overlay.objects.filter(stack=stack_id)
        for ele in overlays_qs:
            overlays.append( {
                'id': ele.id,
                'title': ele.title,
                'image_base': ele.image_base,
                'default_opacity': ele.default_opacity,
                'tile_width': ele.tile_width,
                'tile_height': ele.tile_height,
                'tile_source_type': ele.tile_source_type,
                'file_extension': ele.file_extension
                } )
        result={
            'sid': int(s.id),
            'pid': int(p.id),
            'ptitle': p.title,
            'stitle': s.title,
            'image_base': s.image_base,
            'num_zoom_levels': int(s.num_zoom_levels),
            'file_extension': s.file_extension,
            'editable': can_edit,
            'translation': {
                'x': ps.translation.x,
                'y': ps.translation.y,
                'z': ps.translation.z
            },
            'resolution': {
                'x': float(s.resolution.x),
                'y': float(s.resolution.y),
                'z': float(s.resolution.z)
            },
            'dimension': {
                'x': int(s.dimension.x),
                'y': int(s.dimension.y),
                'z': int(s.dimension.z)
            },
            'tile_height': int(s.tile_height),
            'tile_width': int(s.tile_width),
            'tile_source_type': int(s.tile_source_type),
            'metadata' : s.metadata,
            'broken_slices': broken_slices,
            'trakem2_project': int(s.trakem2_project),
            'overlay': overlays,
            'orientation': ps.orientation,
        }

    return result

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_stack_tags(request, project_id=None, stack_id=None):
    """ Return the tags associated with the stack.
    """
    s = get_object_or_404(Stack, pk=stack_id)
    tags = [ str(t) for t in s.tags.all()]
    result = {'tags':tags}
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def update_stack_tags(request, project_id=None, stack_id=None, tags=None):
    """ Updates the given stack with the supplied tags. All
    existing tags will be replaced.
    """
    s = get_object_or_404(Stack, pk=stack_id)
    # Create list of single stripped tags
    if tags is None:
        tags = []
    else:
        tags = tags.split(",")
        tags = [t.strip() for t in tags]

    # Add tags to the model
    s.tags.set(*tags)

    # Return an empty closing response
    return HttpResponse(json.dumps(""), mimetype="text/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stack_info(request, project_id=None, stack_id=None):
    result=get_stack_info(project_id, stack_id, request.user)
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stack_models(request, project_id=None, stack_id=None):
    """ Retrieve Mesh models for a stack
    """
    d={}
    filename=os.path.join(settings.HDF5_STORAGE_PATH, '%s_%s.hdf' %(project_id, stack_id) )
    if not os.path.exists(filename):
        return HttpResponse(json.dumps(d), mimetype="text/json")
    with closing(h5py.File(filename, 'r')) as hfile:
        meshnames=hfile['meshes'].keys()
        for name in meshnames:
            vertlist=hfile['meshes'][name]['vertices'].value.tolist()
            facelist= hfile['meshes'][name]['faces'].value.tolist()
            d[str(name)] = {
                'metadata': {
                    'colors': 0,
                    'faces': 2,
                    'formatVersion': 3,
                    'generatedBy': 'NeuroHDF',
                    'materials': 0,
                    'morphTargets': 0,
                    'normals': 0,
                    'uvs': 0,
                    'vertices': 4},
                'morphTargets': [],
                'normals': [],
                'scale': 1.0,
                'uvs': [[]],
                'vertices': vertlist,
                'faces': facelist,
                'materials': [],
                'colors': []
            }
    return HttpResponse(json.dumps(d), mimetype="text/json")

def stacks(request, project_id=None):
    """ Returns a response containing the JSON object with menu information
    about the project's stacks.
    """
    p = Project.objects.get(pk=project_id)
    info = get_stacks_menu_info(p)
    return HttpResponse(json.dumps(info, sort_keys=True, indent=4),
        mimetype="text/json")

def get_stacks_menu_info(project):
    """ Returns a dictionary with information needed to create a menu
    entry for opening a stack.
    """
    info = []
    for s in project.stacks.all():
        info.append( {
            'id': s.id,
            'title': s.title,
            'comment': s.comment,
            'note': '',
            'action': 'javascript:openProjectStack(%d,%d)' % (project.id, s.id)} )

    return info

