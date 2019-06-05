# -*- coding: utf-8 -*-

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

from collections import Iterable, OrderedDict
from importlib import import_module

import six

# python module names of CATMAID extensions which could potentially be installed
KNOWN_EXTENSIONS = (
    'synapsesuggestor',
    'autoproofreader',
)


class PipelineSpecUpdater(object):
    def __init__(self, input_dict=None):
        if input_dict is None:
            input_dict = OrderedDict()
        self.result = input_dict
        self.existing_output_files = set()

    def update(self, other_dict, key_prefix='catmaid-ext-'):
        """Include items from other_dict in the input dict, ensuring that no data will be overwritten and the result
        will not cause multiple libraries to create static files of the same name. key_prefix will be prepended to
        the keys in other_dict when they are inserted into the input dict (default 'catmaid-ext-')."""
        for key, value in six.iteritems(other_dict):
            new_key = key_prefix + str(key)
            assert new_key not in self.result, 'Extension static file IDs must not overwrite existing static file IDs'
            assert value['output_filename'] not in self.existing_output_files, \
                'Extension static files must not overwrite existing static files ({})'.format(value['output_filename'])
            self.existing_output_files.add(value['output_filename'])
            self.result['{}{}'.format(key_prefix, key)] = value


STYLESHEETS = OrderedDict()
STYLESHEETS['libraries'] = {
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
    }
STYLESHEETS['catmaid'] = {
        'source_filenames': (
            'css/*.css',
        ),
        'output_filename': 'css/catmaid.css',
        'extra_context': {
            'media': 'screen,projection',
        }
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
    ('msgpack-lite', ['msgpack.min.js']),
    ('numeric', ['numeric-1.2.6.js']),
    ('numjs', ['numjs.min.js']),
    ('three.js', ['three.js', 'controls/TrackballControls.js',
                 'camera/CombinedCamera.js', 'WebGL.js',
                 'lines/LineSegmentsGeometry.js', 'lines/LineGeometry.js',
                 'lines/LineSegments2.js', 'lines/Line2.js',
                 'lines/LineMaterial.js', 'loaders/VRMLLoader.js',
                 'lines/Wireframe.js', 'lines.WireframeGeometry2',
                 'loaders/VRMLLoader.js', 'renderer/Projector.js',
                 'renderer/SVGRenderer.js', 'exporters/OBJExporter.js',
                 'math/Lut.js', 'modifiers/*.js']),
    ('threex', ['*.js']),
    ('plotly', ['*.js']),
    ('pixi.js', ['*.js']),
    ('pointyjs', ['*.js']),
    ('cytoscapejs', ['cytoscape.js', 'cytoscape-spread.js',
                    'arbor.js', 'cytoscape-arbor.js',
                    'cola.js', 'cytoscape-cola.js',
                    'dagre.js', 'cytoscape-dagre.js',
                    'springy.js', 'cytoscape-springy.js']),
    ('jsnetworkx', ['*.js']),
    ('filesaver', ['*.js']),
    ('screw-filereader', ['*.js']),
    ('streamsaver', ['StreamSaver.js', 'polyfill.min.js']),
    ('webm-writer.js', ['*.js']),
    ('blazy', ['blazy.min.js']),
    ('geometry', ['geometry.js', 'intersects.js']), # order matters
    ('catmaid', ['namespace.js', 'error.js', 'events.js', 'request.js',
                'tools.js', 'lru-cache.js', 'CATMAID.js', 'state.js',
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
        'source_filenames': [v],
        'output_filename': v
    }


# Like non_pipeline_js, these files aren't compressed. They are however only
# copied to the output directory and are not supposed to be imported/loaded by
# the front-end.
copy_only_files = {
        'streamsaver-worker-1': 'libs/streamsaver/worker/mitm.html',
        'streamsaver-worker-2': 'libs/streamsaver/worker/ping.html',
        'streamsaver-worker-3': 'libs/streamsaver/worker/ping.js',
        'streamsaver-worker-4': 'libs/streamsaver/worker/sw.js',
}

# Let pipeline know about copy-only files.
for k, v in six.iteritems(copy_only_files):
    JAVASCRIPT[k] = {
        'source_filenames': [v],
        'output_filename': v
    }

# Regular CATMAID front-end files
JAVASCRIPT['catmaid'] = {
    'source_filenames': (
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
        'js/reoriented-stack.js',
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
        'js/tools/*.js',
        'js/layers/stack-layer.js',
        'js/layers/tile-layer.js',
        'js/layers/pixi-layer.js',
        'js/layers/pixi-tile-layer.js',
        'js/layers/*.js',
        'js/widgets/detail-dialog.js',
        'js/widgets/options-dialog.js',
        'js/3d/*.js',
        'js/image-block.js',
        'js/label-annotations.js',
        'js/widgets/*.js',
    ),
    'output_filename': 'js/catmaid.js',
}

installed_extensions = []

stylesheet_updater = PipelineSpecUpdater(STYLESHEETS)
non_pipeline_js_updater = PipelineSpecUpdater(non_pipeline_js)
javascript_updater = PipelineSpecUpdater(JAVASCRIPT)

for app_name in KNOWN_EXTENSIONS:
    try:
        app = import_module(app_name)
        installed_extensions.append(app_name)
        app_pipelinefiles = import_module(app_name + '.pipelinefiles')
    except ImportError:
        continue

    try:
        stylesheet_updater.update(app_pipelinefiles.STYLESHEETS)
    except AttributeError:
        pass

    try:
        non_pipeline_js_updater.update(app_pipelinefiles.non_pipeline_js)
    except AttributeError:
        pass

    try:
        javascript_updater.update(app_pipelinefiles.JAVASCRIPT)
    except AttributeError:
        pass
