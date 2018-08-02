# -*- coding: utf-8 -*-

@login_required
def initialize_components_for_skeleton(request, project_id=None, stack_id=None):
    skeleton_id = int(request.POST['skeleton_id'])

    # retrieve all treenodes for the given skeleton
    treenodes_qs, labels_qs, labelconnector_qs = get_treenodes_qs( project_id, skeleton_id )
    # retrieve stack information to transform world coordinates to pixel coordinates
    stack_info = get_stack_info( project_id, stack_id )

    skeleton = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    project = get_object_or_404(Project, pk=project_id)

    # retrieve all the components belonging to the skeleton
    all_components = Component.objects.filter(
        project = project,
        stack = stack,
        skeleton_id = skeleton.id
    ).all()
    all_component_ids = [comp.component_id for comp in all_components]

    # TODO: some sanity checks, like missing treenodes in a section

    # for each treenode location
    for tn in treenodes_qs:

        x_pixel = int(tn.location.x / stack_info['resolution']['x'])
        y_pixel = int(tn.location.y / stack_info['resolution']['y'])
        z = str( int(tn.location.z / stack_info['resolution']['z']) )

        # select component with lowest threshold value and that contains the pixel value of the location
        component_ids = retrieve_components_for_location(project_id, stack_id, x_pixel, y_pixel, z, limit = 1)

        if not len(component_ids):
            print >> sys.stderr, 'No component found for treenode id', tn.id
            continue
        elif len(component_ids) == 1:
            print >> sys.stderr, 'Exactly one component found for treenode id', tn.id, component_ids
        else:
            print >> sys.stderr, 'More than one component found for treenode id', tn.id, component_ids
            continue

        component_key, component_value = component_ids.items()[0]

        # check if component already exists for this skeleton in the database
        if component_key in all_component_ids:
            print >> sys.stderr, 'Component with id', component_key, ' exists already in the database. Skip it.'
            continue

        # TODO generate default color for all components based on a map of
        # the skeleton id to color space

        # if not, create it
        new_component = Component(
            project = project,
            stack = stack,
            user = request.user,
            skeleton_id = skeleton.id,
            component_id = component_key,
            min_x = component_value['minX'],
            min_y = component_value['minY'],
            max_x = component_value['maxX'],
            max_y = component_value['maxY'],
            z = z,
            threshold = component_value['threshold'],
            status = 5 # means automatically selected component
        )
        new_component.save()

    return HttpResponse(json.dumps({'status': 'success'}), content_type="application/json")
