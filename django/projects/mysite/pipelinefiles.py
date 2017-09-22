# -*- coding: utf-8 -*-
from __future__ import unicode_literals

"""Specifies static assets (CSS, JS) required by the CATMAID front-end.

This module specifies all the static files that are required by the
CATMAID front-end. The configuration is separated in libraries and CATMAID's
own files:

Libraries: To add a new library, add a new entry into the libraries_js
dictionary and, if needed, add the libraries CSS files to sourcefiles
tuple of the 'library' entry in the ``STYLESHEETS`` dictionary.

CATMAID files: By default all CSS files in the ``static/css`` directory are
included as well as all JavaScript files in ``static/js`` and CATMAID's
subdirectories in it. However, if you want to add new files explicitly, add
CSS to the source_filenames tuple in the 'catmaid' entry of the ``STYLESHEETS``
dictionary. JavaScript files go into the 'catmaid' entry of the ``JAVASCRIPT``
dictonary at the end of this file.
"""

import six
from collections import OrderedDict


STYLESHEETS = {
    'libraries': {
        'source_filenames': (
            'libs/jquery/themes/smoothness/jquery-ui.css',
            'libs/jquery/datatable/css/demo_table.css',
            'libs/jquery/datatable/extras/Buttons/css/buttons.dataTables.css',
            'libs/jquery/jquery.growl.css',
            'libs/jquery/jquery-ui.combobox.css',
            'libs/jsTree/themes/default/style.css',
        ),
        'output_filename': 'css/libraries.css',
        'extra_context': {
            'media': 'screen,projection',
        }
    },
    'catmaid': {
        'source_filenames': (
            'css/*.css',
        ),
        'output_filename': 'css/catmaid.css',
        'extra_context': {
            'media': 'screen,projection',
        }
    },
}

libraries_js = OrderedDict([
    ('modernizr', ['*.js']),
    ('jquery', ['jquery-2.1.3.min.js',
               'jquery-ui.min.js', 'jquery-ui.*.js',
               'jquery.dataTables.min.js', 'jquery.*.js',
               'dataTables.buttons.js', 'buttons.html5.min.js']),
    ('jszip', ['*.js']),
    ('jsTree', ['jstree.js']),
    ('colorpicker', ['colors.js', 'colorPicker.data.js', 'colorPicker.js',
                    'jqColor.js']),
    ('fabric.js', ['all.modified.js']),
    ('raphael', ['raphael.js', 'g.raphael.js', 'g.pie-min.js', 'g.line.altered.js',
                'raphael-custom.js', 'colorwheel.js', 'raphael.export.js']),
    ('d3', ['d3.v3.js', 'venn.js', 'mds.js', 'colorbrewer.js']),
    ('sylvester', ['sylvester.js']),
    ('numeric', ['numeric-1.2.6.js']),
    ('three.js', ['three.js', 'controls/TrackballControls.js',
                 'camera/CombinedCamera.js', 'Detector.js',
                 'loaders/VRMLLoader.js', 'renderer/Projector.js',
                 'renderer/SVGRenderer.js']),
    ('threex', ['*.js']),
    ('pixi.js', ['*.js']),
    ('cytoscapejs', ['cytoscape.js', 'cytoscape-spread.js',
                    'arbor.js', 'cytoscape-arbor.js',
                    'cola.js', 'cytoscape-cola.js',
                    'dagre.js', 'cytoscape-dagre.js',
                    'springy.js', 'cytoscape-springy.js']),
    ('jsnetworkx', ['*.js']),
    ('filesaver', ['*.js']),
    ('whammy', ['whammy.js']),
    ('blazy', ['blazy.min.js']),
    ('geometry', ['geometry.js', 'intersects.js']), # order matters
    ('catmaid', ['request.js', 'CATMAID.js', 'error.js', 'events.js', 'state.js',
                'command.js', 'models/*.js', 'skeleton_source.js',
                'datastores.js', 'settings-manager.js', '*.js']),
])

JAVASCRIPT = OrderedDict()

for k, v in six.iteritems(libraries_js):
    JAVASCRIPT[k + '-lib'] = {
        'source_filenames': ['libs/%s/%s' % (k, f) for f in v],
        'output_filename': 'js/libs/%s-lib.js' % k,
    }


# Some libraries expect their own JavaScript files to be available under a
# particular name. Therefore, we can't use pipeline with them and include them
# separately. Entries follow the same pattern as above: key - path.
non_pipeline_js = {}

# Even non-pipeline files have to be made known to pipeline, because it takes
# care of collecting them into the STATIC_ROOT directory.
for k, v in six.iteritems(non_pipeline_js):
    JAVASCRIPT[k] = {
        'source_filenames': (v,),
        'output_filename': v
    }


# Regular CATMAID front-end files
JAVASCRIPT['catmaid'] = {
    'source_filenames': (
        'js/tools.js',
        'js/CATMAID.js',
        'js/dom.js',
        'js/extensions.js',
        'js/data-view.js',
        'js/action.js',
        'js/settings-manager.js',
        'js/helpers/*.js',
        'js/init.js',
        'js/network-api.js',
        'js/project.js',
        'js/stack.js',
        'js/stack-viewer.js',
        'js/tile-source.js',
        'js/treelines.js',
        'js/ui.js',
        'js/layout.js',
        'js/user.js',
        'js/WindowMaker.js',
        'js/skeleton-model.js',
        'js/skeleton-group.js',
        'js/time-series.js',
        'js/tools/navigator.js',
        'js/tools/box-selection-tool.js',
        'js/tools/roi-tool.js',
        'js/tools/segmentation-tool.js',
        'js/tools/*.js',
        'js/layers/tile-layer.js',
        'js/layers/pixi-layer.js',
        'js/layers/*.js',
        'js/widgets/detail-dialog.js',
        'js/widgets/options-dialog.js',
        'js/3d/*.js',
        'js/widgets/*.js',
    ),
    'output_filename': 'js/catmaid.js',
}
