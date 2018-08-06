# -*- coding: utf-8 -*-


def generate_mesh(request, project_id=None, stack_id=None):
    skeleton_id = int(request.POST.get('skeleton_id',-1))

    # retrieve all components for a given skeleton id
    components = Component.objects.filter(
        project = project_id,
        stack = stack_id,
        skeleton_id = skeleton_id
    ).all()

    # retrieve stack information
    stack_info = get_stack_info( project_id, stack_id )
    resolution=stack_info['resolution']
    dimension=stack_info['dimension']
    translation=stack_info['translation']

    # compute the skeleton bounding box
    #    minX, minY = int(dimension['x']), int(dimension['y'])
    #    maxX, maxY = 0,0
    #    minZ, maxZ = int(dimension['z']), 0
    #    for comp in components:
    #        minX = min(minX, comp.min_x)
    #        minY = min(minY, comp.min_y)
    #        minZ = min(minZ, comp.z)
    #        maxX = max(maxX, comp.max_x)
    #        maxY = max(maxY, comp.max_y)
    #        maxZ = max(maxZ, comp.z)
    #
    #    print('found bounding box', minX, minY, maxX, maxY, minZ, maxZ)

    # create 3d array
    data = np.zeros( (dimension['x'], dimension['y'], dimension['z']), dtype = np.uint8 )

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
            #indX = comp.min_x - minX
            #indY = comp.min_y - minY
            data[comp.min_y:comp.max_y,comp.min_x:comp.max_x,comp.z] = img
        except:
            pass

            # Load npy volume from given file, set origin and spacing of the volue
    npVolWrapper = VTKStructuredPoints.loadVolumeDS(data, spacing = (resolution['x'],resolution['y'],resolution['z']))

    # Convert npy volume to vtkImageData so vtk can handle it
    vtkNumpyDataImport = dataImporterFromNumpy(npVolWrapper)

    # Load pipeline from the xml file
    pipeline = barPipeline.fromXML('default_pipeline.xml')

    # Code just for exporting the mesh (no visualization at this point)
    mesh =  pipeline[0:-1].execute(vtkNumpyDataImport).GetOutput()

    writer = vtk.vtkPolyDataWriter()
    writer.SetInput(mesh)
    writer.SetFileName('test.vtk')
    writer.SetFileTypeToBinary()
    writer.Write()

    return HttpResponse(json.dumps(True), content_type="application/json")
