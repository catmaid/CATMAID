import os
import skeletor as sk
import traceback
import time
import numpy as np
import trimesh
import navis as ns
import subprocess
import pandas
import networkx as nx
import math
from itertools import chain
from trimesh.exchange.obj import export_obj
import tempfile
from typing import Any, List, Iterator

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection
from django.contrib.auth import get_user_model

from catmaid.control.common import get_class_to_id_map, get_relation_to_id_map
from catmaid.control.skeleton import _import_skeleton_swc, edge_list_to_swc
from catmaid.control.volume import TriangleMeshVolume
from catmaid.control.neuron import _get_all_skeletons_of_neuron
from catmaid.models import ClassInstance
from catmaid.util import str2bool, str2list

try:
    import scyjava_config
    scyjava_config.add_options('-Xmx14g')
except ValueError as e:
    print(e)

import imagej

User = get_user_model()


class TrakEM2():

    Project = None
    Ball = None
    Tree = None
    Treeline = None
    AreaTree = None
    AreaList = None
    Connector = None
    Process = None
    TaskFactory = None
    String = None
    RadiusNode = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        TrakEM2.Project = autoclass('ini.trakem2.Project')
        TrakEM2.Ball = autoclass('ini.trakem2.display.Ball')
        TrakEM2.Tree = autoclass('ini.trakem2.display.Tree')
        TrakEM2.Treeline = autoclass('ini.trakem2.display.Treeline')
        TrakEM2.AreaTree = autoclass('ini.trakem2.display.AreaTree')
        TrakEM2.AreaList = autoclass('ini.trakem2.display.AreaList')
        TrakEM2.Connector = autoclass('ini.trakem2.display.Connector')
        TrakEM2.Process = autoclass('ini.trakem2.parallel.Process')
        TrakEM2.TaskFactory = autoclass('ini.trakem2.parallel.TaskFactory')
        TrakEM2.RadiusNode = autoclass('ini.trakem2.display.Treeline$RadiusNode')

class Java():

    String = None
    Array = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        Java.String = autoclass('java.lang.String')


class ImageJ():

    ImagePlus = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        ImageJ.ImagePlus = autoclass('ij.ImagePlus')


def _log(msg):
    print(msg)
log = _log


class SynapseSides:
    PRE = 0
    POST = 1


class SkeletonizationMethod:
    Skeletor = 0
    STL2SWC = 1


class ConnectorNode:

    def __init__(self, t, r, transformer, side:SynapseSides, parent_neuron_id:int,
            displayables:List[Any]):
        self.x, self.y, self.z = t
        self.r = r
        self.transformer = transformer
        self.side = side
        self.parent_neuron_id = parent_neuron_id
        # We currently only care about areatree and are_alist objects
        self.displayables = [d for d in displayables \
                if type(d) in (TrakEM2.AreaTree, TrakEM2.AreaList)]

        if len(self.displayables) > 1:
            arealists = list(filter(lambda x: type(x) == TrakEM2.AreaList, self.displayables))
            n_arealists = len(arealists)
            if n_arealists == 1:
                log('Can only assign connector node to a single displayable, '
                        'choosing the only area list')
                self.displayables = arealists
            elif n_arealists > 1:
                pixel_areas = list(zip(arealists,
                        map(lambda x: x.measure()[0], self.displayables)))
                log(str(pixel_areas))
                largest_arealist_entry = sorted(pixel_areas, key=lambda x: x[1])[0]
                largest_arealist = largest_arealist_entry[0]
                self.displayables = [largest_arealist]
                log('Can only assign connector node to a single displayable, '
                        f'found {len(self.displayables)}. Using largest arealist '
                        f'with {largest_arealist_entry[1]}px: {largest_arealist}')
            else:
                log('Can only assign connector node to a single displayable, '
                        'choosing the largest area tree')
                raise ValueError('Not implemented')


    def __str__(self):
        return f'({self.x},{self.y},{self.z}) radius: {self.r}'

    def treenode_within_radius(self, treenode):
        if abs(self.z - treenode.z) > (self.transformer.res_z / 2):
            return False
        xdiff = self.x - treenode.x
        ydiff = self.y - treenode.y
        return (xdiff*xdiff + ydiff*ydiff) < (self.r*self.r)

    def find_treenodes_under(self):
        in_cuboid_treenodes = self.transformer.get_treenodes_within(
                self.x - self.r, self.x + self.r,
                self.y - self.r, self.y + self.r,
                self.z - (self.transformer.res_z / 2.0), self.z + (self.transformer.res_z / 2.0))
        # That might find some which are with a squared region but not
        # within a circular region, so narrow that down:
        return [x for x in in_cuboid_treenodes if self.treenode_within_radius(x)]

    def get_import_neuron_and_skeleton(self):
        import_neuron_id = None
        if self.side == SynapseSides.PRE and \
                self.parent_neuron_id is not None:
            import_neuron_id = self.parent_neuron_id
            log(f'Imported neuron before: {self.parent_neuron_id}')

        if import_neuron_id is None:
            import_neuron_id = self.transformer.get_imported_neuron_under(
                    self.displayables, self.x, self.y, self.z)
            if import_neuron_id:
                log(f"Looked up neuron for connector based on intersecting TrakEM2 objects: {import_neuron_id}")

        if import_neuron_id is None:
            log('Could not find imported neuron. Skipping.')
            return None, None

        try:
            skeleton_ids = _get_all_skeletons_of_neuron(self.transformer.project_id,
                    import_neuron_id)
        except Exception as e:
            log(f'Error during skeleton lookup for imported neuron {import_neuron_id}: {e}')
            skeleton_ids = []

        if len(skeleton_ids) == 0:
            log(f'Could not find any skeletons for imported neuron {import_neuron_id}. Skipping.')
            return None, None

        if len(skeleton_ids) > 1:
            log(f'Found {len(skeleton_ids)} skeletons for neuron {import_neuron_id}, expected one. Skipping.')
            return None, None

        import_skeleton_id = skeleton_ids[0]

        return import_neuron_id, import_skeleton_id

    def find_closest_treenode_in_linked_skeleton(self):
        """For pre-sites, a possible parent neuron ID can be used to find the
        closest node in its skeleton. If no parent neuron ID is available or for
        post-sites, the neuron is found differently. The TrakEM2 project is
        checked for intersecting area lists or linked area trees. If one is
        found, the imported neuron is looked up and its closest node will be
        returned.
        """
        import_neuron_id, import_skeleton_id = self.get_import_neuron_and_skeleton()

        if None in (import_neuron_id, import_skeleton_id):
            log('Found no imported neuron for this connector linked treenode')
            return None, 0

        # With the neuron ID of an imported object available, look up the
        # closest node.
        cursor = connection.cursor()
#        cursor.execute("""
#            SELECT id, dist
#            FROM (
#                WITH closest_edge AS (
#                    SELECT t.id, t.parent_id, edge,
#                        te.edge <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s) AS dist
#                    FROM treenode t
#                    JOIN LATERAL (
#                        SELECT edge
#                        FROM treenode_edge te
#                        WHERE te.id = t.id
#                    ) te ON TRUE
#                    WHERE t.project_id = %(project_id)s
#                    AND t.skeleton_id = %(skeleton_id)s
#                    ORDER BY te.edge <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s) ASC
#                    LIMIT 1
#                )
#                SELECT id, dist FROM closest_edge
#                UNION ALL
#                SELECT parent_id,
#                        ST_StartPoint(edge) <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s) AS dist
#                FROM closest_edge
#            ) closest_nodes
#            ORDER BY dist ASC
#            LIMIT 1
#        """, {
#            'project_id': self.transformer.project_id,
#            'skeleton_id': import_skeleton_id,
#            'x': self.x,
#            'y': self.y,
#            'z': self.z,
#        })
        cursor.execute("""
            SELECT t.id,
                ST_StartPoint(te.edge) <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s) AS dist
            FROM treenode t
            JOIN LATERAL (
                SELECT edge
                FROM treenode_edge te
                WHERE te.id = t.id
            ) te ON TRUE
            WHERE t.project_id = %(project_id)s
            AND t.skeleton_id = %(skeleton_id)s
            ORDER BY ST_StartPoint(te.edge) <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s) ASC
            LIMIT 1
        """, {
            'project_id': self.transformer.project_id,
            'skeleton_id': import_skeleton_id,
            'x': self.x,
            'y': self.y,
            'z': self.z,
        })

        result = cursor.fetchone()
        if not result:
            log(f'Found no closest node in skeleton {import_skeleton_id} for location {(self.x, self.y, self.z)}')
            return None, 0

        return result[0], result[1]


class TreeNode:
    def __init__(self, treenode_id, x, y, z):
        self.treenode_id = treenode_id
        self.x = x
        self.y = y
        self.z = z


descent_into = ["pn", "osn", "ln", "n"]
neuron_groups = ["pnx", "osnx", "lnx", "nx"]
ignore_groups = ["sensory", "class", "vnc", "contour", "group", "neuropile",
        "synapses", "trachea", "imported_labels", "commissures", "bouton",
        "cell", "non_da2", "synapse", "synapsee", "networks"]


class Command(BaseCommand):
    help = ("Import data from a TrakEM2 XML file using pyimagej. This requires "
            "the installation of additional dependencies: pip install pyimagej, scijava. "
            "It also requires setting ethe JAVA_HOME and PYJNIUS_JAR environment variables.")

    def add_arguments(self, parser):
        parser.add_argument('--project-id', dest='project_id', required=True,
            help='Compute only statistics for these projects only (otherwise all)'),
        parser.add_argument('--trakem2-xml', dest='xml_path', required=True,
            help='Compute only statistics for these projects only (otherwise all)'),
        parser.add_argument('--imagej', dest='imagej', required=False,
            help='An ImageJ specification like a path to Fiji.app or a version'),
        parser.add_argument('--pyjnius', dest='pyjnius', required=False,
            help='Set the PYJNIUS_JAR environment variable.'),
        parser.add_argument('--java-home', dest='java_home', required=False,
            help='Set the JAVA_HOME environment variable.'),
        parser.add_argument('--user-id', dest='user_id', required=True,
            help='The user to impersonate during the import.'),
        parser.add_argument('--resample', dest='resample', required=False,
            help='The user to impersonate during the import.', default=1)
        parser.add_argument('--headless', dest='headless', required=False, default=False,
            help='Whether GUI elements should be hidden.')
        parser.add_argument('--ignore-errors', dest='ignore_errors', required=False, default=False,
            action="store_true", help='Whether GUI elements should be hidden.')
        parser.add_argument('--only-largest-fragment', dest='only_largest_fragment', required=False, default=False,
            action="store_true", help='Whether to only use the largest skeleton '
            'that was generatedl rather than try to heal all fragments.')
        parser.add_argument('--import-volumes', dest='import_volumes', required=False, default=False,
            action="store_true", help='Whether volumes should be create from e.g. arealists'),
        parser.add_argument('--import-contracted-volumes',
                dest='import_contracted_volumes', required=False, default=False,
                action="store_true", help='Whether contracted volumes should be create from e.g. arealists'),
        parser.add_argument('--name-filter', dest='name_filters', nargs='*', action='append', required=False,
            default=[], help='Optionally allow only neurons with a name matching this expression.')
        parser.add_argument('--skeleton-sampling-dist',
                dest='skeleton_sampling_dist', required=False, default=1000,
            help='Override the default distance between points during skeletonization.')
        parser.add_argument('--skeleton-join-dist',
                dest='skeleton_join_dist', required=False, default=1000,
            help='Override the default distance between two points that can be joined during skeleton healing.')
        parser.add_argument('--min-healing-size',
                dest='min_healing_size', required=False, default=0,
            help='Define a minimum size of fragments that can be joined.')
        parser.add_argument('--res-x', dest='res_x', required=True,
            help='The X resolution in nm of the TrakEM2 project')
        parser.add_argument('--res-z', dest='res_z', required=True,
            help='The Z resolution in nm of the TrakEM2 project')
        parser.add_argument('--new-synapse-link-node-dist', type=float,
                dest='new_syn_link_node_dist', required=False, default=500,
            help='Distance in nm until which the closest node of an existing '
                    'skeleton is used for a synaptic link. If the distance is '
                    'larger, a new link node will be added to the skeleton.')
        parser.add_argument('--stl2swc', dest='stl2swc', required=False,
                default=None, help='Path the stl2swc binary. Enables the use of stl2swc for skeltonization.')
        parser.add_argument('--open3d-mesh-repair', dest='open3d_mesh_repair',
                required=False, default=False, nargs='?', type=str2bool,
                help='If set to true, Open3D will be used (needs to be installed) to repair the generated TrakEM2 mesh')
        parser.add_argument('--meshfix-repair', dest='open_3d_mesh_repair',
                required=False, default=False, nargs='?', type=str2bool,
                help='If set to true, Open3D will be used (needs to be installed) to repair the generated TrakEM2 mesh')
        parser.add_argument('--meshfix-mesh-repair', dest='meshfix_mesh_repair',
                required=False, default=False, nargs='?', type=str2bool,
                help='If set to true, MeshFix will be used (needs to be installed) to repair the generated TrakEM2 mesh')
        parser.add_argument('--blender-remesh', dest='blender_remesh',
                required=False, default=True, nargs='?', type=str2bool,
                help='Whether the TrakEM2 mesh should be remeshed using Blender (needs to be installed)')
        parser.add_argument('--blender-simplify', dest='blender_simlify',
                required=False, default=True, nargs='?', type=str2bool,
                help='Whether the TrakEM2 mesh should be simplified using Blender (needs to be installed)')
        parser.add_argument('--only-largest-mesh-component', dest='only_largest_mesh_component',
                required=False, default=True, nargs='?', type=str2bool,
                help='Whether or not only the largest individual connected component should be used from the generated TrakEM2 mesh.')
        parser.add_argument('--remesh-voxel-size', dest='remesh_voxel_size',
                required=False, default=50.0, type=float, help='The remeshing voxel size if blender remeshing is enabled..')
        parser.add_argument('--remesh-adaptivity', dest='remesh_adaptivity',
                required=False, default=5, type=float, help='The remeshing adaptivityif Blender remeshing is enabled..')
        parser.add_argument('--simplify-ratio', dest='simplify_ratio',
                required=False, default=0.2, type=float, help='The simplification ratio if Blender simplification is enabled..')
        parser.add_argument('--stl2swc-subdiv-steps', dest='stl2swc_subdiv_steps',
                required=False, default=1, type=float, help='The number of Loop subdivision steps. Incrementing this value often improves quality. A value of zero disabled it.')
        parser.add_argument('--stl2swc-quality-speed-tradeoff', dest='stl2swc_quality_speed_tradeoff',
                required=False, default=0.3, type=float, help='The quality speed tradeoff in [0,1] for the CGAL Mean Curvature Skelton implementation.')
        parser.add_argument('--stl2swc-medially-centered-speed-tradeoff', dest='stl2swc_medially_centered_speed_tradeoff',
                required=False, default=0.4, type=float, help='The medially centered speed tradeoff in [0,1] for the CGAL Mean Curvature Skelton implementation.')
        parser.add_argument('--descent-into', dest='descent_into',
                type=str2list, nargs='?', const=True, default=None,
                help='The list of known TrakEM2 groups that the importer descents ' +
                'into. If omitted, the default list of known groups is:  ' + ', '.join(descent_into))
        parser.add_argument('--neuron-groups', dest='neuron_groups',
                type=str2list, nargs='?', const=True, default=None,
                help='The list of known TrakEM2 groups that contain neuron types. ' +
                'If omitted, the default list of known groups is:  ' + ', '.join(neuron_groups))
        parser.add_argument('--ignore-groups', dest='ignore_groups',
                type=str2list, nargs='?', const=True, default=None,
                help='The list of ignored TrakEM2 groups. ' +
                'If omitted, the default list of known groups is:  ' + ', '.join(ignore_groups))

    def handle(self, *args, **options):
        global log, descent_into, neuron_groups, ignore_groups
        log = lambda x: self.stdout.write(x)
        if options.get('imagej'):
            ij = imagej.init(options['imagej'], headless=options['headless'])
        else:
            ij = imagej.init(headless=options['headless'])
        self.stdout.write('Done')
        log(f'ImageJ version: {ij.getInfo(True)}')

        # Needs to happen after imagej.init()
        Java.init()
        TrakEM2.init()
        ImageJ.init()

        # Check environment variable
        if 'PYJNIUS_JAR' not in os.environ:
            if 'pyjnius' not in options:
                raise CommandError('Neither the PYJNIUS_JAR environment variable is set nor is the --pyjnius parameter provided. Pyjnius needs to be installed.')
            else:
                os.environ['PYJNIUS_JAR'] = options['pyjnius']
                log(f'Setting PYJNIUS_JAR environment variable to "{options["pyjnius"]}')
        else:
            log(f'PYJNIUS_JAR environment variable is set to "{os.environ["PYJNIUS_JAR"]}')

        if 'JAVA_HOME' not in os.environ:
            if 'java_home' not in options:
                raise CommandError('Neither the JAVA_HOME environment variable is set nor is the --java-home parameter provided. Java needs to be installed.')
            else:
                os.environ['JAVA_HOME'] = options['java_home']
                log(f'Setting JAVA_HOME environment variable to "{options["java_home"]}"')
        else:
            log(f'JAVA_HOME environment variable is set to "{os.environ["JAVA_HOME"]}"')

        # Update default groups
        if options['descent_into']:
            descent_into = options['descent_into']
        if options['neuron_groups']:
            neuron_groups = options['neuron_groups']
        if options['ignore_groups']:
            ignore_groups = options['ignore_groups']

        transformer = TrakEM2ToCATMAIDTransformer(options['xml_path'],
                options['project_id'], options['user_id'], options['headless'],
                int(options['resample']), options['ignore_errors'],
                only_largest_fragment=options['only_largest_fragment'],
                import_volumes=options['import_volumes'],
                import_contracted_volumes=options['import_contracted_volumes'],
                name_filters=list(chain.from_iterable(options['name_filters'])),
                skeleton_sampling_dist=options['skeleton_sampling_dist'],
                skeleton_max_join_dist=options['skeleton_join_dist'],
                min_healing_size=options['min_healing_size'],
                res_x=options['res_x'], res_z=options['res_z'],
                new_syn_link_node_dist=options['new_syn_link_node_dist'],
                stl2swc=options['stl2swc'],
                open3d_mesh_repair=options['open_3d_mesh_repair'],
                meshfix_mesh_repair=options['meshfix_mesh_repair'],
                blender_remesh=options['blender_remesh'],
                only_largest_mesh_component=options['only_largest_mesh_component'],
                remesh_voxel_size=options['remesh_voxel_size'],
                remesh_adaptivity=options['remesh_adaptivity'],
                blender_simlify=options['blender_simlify'],
                simplify_ratio=options['simplify_ratio'],
                stl2swc_subdiv_steps=options['stl2swc_subdiv_steps'],
                stl2swc_quality_speed_tradeoff=options['stl2swc_quality_speed_tradeoff'],
                stl2swc_medially_centered_speed_tradeoff=options['stl2swc_medially_centered_speed_tradeoff'])
        try:
            transformer.transform()
        except Exception as e:
            traceback.print_exc()
            transformer.destroy()

        input("Press Enter to close TrakEM2 and continue...")


class AbstractNode:
    pass


class TrakEM2ToCATMAIDTransformer():

    def __init__(self, xml_path, catmaid_project_id, user_id, headless=True,
            resample=1, ignore_errors=False, only_largest_fragment=False,
            import_volumes=False, import_contracted_volumes=False,
            name_filters=None, skeleton_sampling_dist=1000,
            skeleton_max_join_dist=1000, unit='nm', min_healing_size=0, res_x=4,
            res_z=40, new_syn_link_node_dist=500, stl2swc=None,
            open3d_mesh_repair=False, meshfix_mesh_repair=False,
            pygamer_mesh_repair=False, blender_remesh=True,
            only_largest_mesh_component=True, remesh_voxel_size=50.0,
            remesh_adaptivity=5, blender_simlify=True, simplify_ratio=0.2,
            stl2swc_subdiv_steps=1, stl2swc_quality_speed_tradeoff=0.3,
            stl2swc_medially_centered_speed_tradeoff=0.4):
        self.user_id = user_id
        self.user = User.objects.get(id=user_id)
        self.project_id = int(catmaid_project_id)
        self.p = TrakEM2.Project.openFSProject(Java.String(xml_path), False) # type: ignore
        if not self.p:
            raise ValueError("Could not open project")

        self.ls = self.p.getRootLayerSet()
        self.cal = self.ls.getCalibrationCopy()
        self.pw = float(self.cal.pixelWidth)
        self.ph = float(self.cal.pixelHeight)
        self.rpt = self.p.getRootProjectThing()
        self.res_x = float(res_x)
        self.res_z = float(res_z)

        self.projectRoot = AbstractNode()
        self.resample = resample
        self.ignore_errors = ignore_errors
        self.only_largest_fragment = only_largest_fragment
        self.only_largest_mesh_component = only_largest_mesh_component
        self.import_volumes = import_volumes
        self.import_contracted_volumes = import_contracted_volumes
        self.name_filters = name_filters
        self.skeleton_sampling_dist = float(skeleton_sampling_dist)
        self.skeleton_max_join_dist = float(skeleton_max_join_dist)
        self.min_healing_size = int(min_healing_size)

        self.new_syn_link_node_dist = float(new_syn_link_node_dist)

        self.class_id_map = get_class_to_id_map(self.project_id)
        self.relation_id_map = get_relation_to_id_map(self.project_id)

        log(f'Opened project from file ({xml_path}):')
        log(self.p.getInfo())
        log(f'Target CATMAID project: {self.project_id}')

        self.n_import_errors = 0
        self.n_arealist_imports = 0
        self.n_areatree_imports = 0
        self.n_treeline_imports = 0

        self.n_connectors_created = 0
        self.n_connector_links_created = 0
        self.n_orphaned_nodes_created = 0
        self.n_closest_node_matches = 0

        if stl2swc:
            self.skeletonization_method = SkeletonizationMethod.STL2SWC
        else:
            self.skeletonization_method = SkeletonizationMethod.Skeletor
        self.stl2swc = stl2swc

        self.open3d_mesh_repair = open3d_mesh_repair
        self.meshfix_mesh_repair = meshfix_mesh_repair
        self.pygamer_mesh_repair = pygamer_mesh_repair
        self.blender_remesh = blender_remesh
        self.blender_simlify = blender_simlify
        self.simplify_ratio = simplify_ratio
        self.stl2swc_subdiv_steps = stl2swc_subdiv_steps
        self.stl2swc_quality_speed_tradeoff = stl2swc_quality_speed_tradeoff
        self.stl2swc_medially_centered_speed_tradeoff = stl2swc_medially_centered_speed_tradeoff

        # Used if Blender remeshing is enabled
        self.remesh_voxel_size = remesh_voxel_size
        self.remesh_adaptivity = remesh_adaptivity

        # Maps TrakEM2 IDs to imported CATMAID IDs
        self.neuron_map = dict()
        # Maps TrakEM2 connector IDs to their 'parent' neuron in the XML (if any)
        self.connector_pre_neuron_map = dict()
        # Maps TrakEM2 displayables to CATMAID neuron IDs
        self.displayable_map = dict()


    def transform(self):
        log('Start adding data at the root node')
        start_time = time.time()
        self.add_recursively(self.rpt, None, annotations=['Import'])
        skeleton_end_time = time.time()
        self.add_connectors_recursively(self.rpt)
        connecticity_import_end = time.time()
        log(f'Skeleton import finished in {skeleton_end_time - start_time}s')
        log(f'- Imported area lists: {self.n_arealist_imports}')
        log(f'- Imported area trees: {self.n_areatree_imports}')
        log(f'- Imported tree lines: {self.n_treeline_imports}')
        log(f'- Import errors: {self.n_import_errors}')
        log(f'Connectivity import finished in {connecticity_import_end - skeleton_end_time}s')
        log(f'- Connector nodes created: {self.n_connectors_created}')
        log(f'- Connector links created: {self.n_connector_links_created}')
        log(f'- Orphaned connector link nodes created: {self.n_orphaned_nodes_created}')
        log(f'- Closest node matches: {self.n_closest_node_matches}')


    def add_recursively(self, pt, parent_id, depth=0, annotations=[]):
        pad = " "*depth
        name_with_id = self.get_project_thing_name(pt)
        pt_type = pt.getType()
        log(f'{pad}{str(pt.toString())} {name_with_id}')
        ignore = True
        is_neuron = False
        descent = False
        new_id = None
        # FIXME: All of this should be more consistent and use the shared keyword
        # categories.
        if not parent_id:
            # Then this should be the root:
            # new_id = insert_project_root_node(name_with_id)
            new_id = self.projectRoot
            log(pad + "Ignoring project root")
        elif pt_type == "neuropil":
            new_id = parent_id
            ignore = False
            log(pad + "Descending into neuropil")
        elif pt_type in ignore_groups:
            # Just create all of these as groups for the moment:
            # new_id = insert_group(parent_id,name_with_id)
            log(pad + "Ignoring group: " + pt_type)
        elif pt_type == "nucleus":
            log(pad + "Ignoring nucleus")
        elif pt_type in ("pre", "post"):
            log(pad + "Ignoring pre/post object")
        elif pt_type == "neuron":
            # is_neuron = True
            ignore = False
            descent = True
            new_id = self.insert_neuron(name_with_id)
            self.neuron_map[name_with_id] = new_id
        elif pt_type == "connector":
            self.connector_pre_neuron_map[name_with_id] = parent_id
            log(pad + "Noting connector")
        elif pt_type == "treeline":
            ignore = False
            skeleton_id = self.insert_skeleton(parent_id, name_with_id)
            tl = pt.getObject()
            self.insertTree(tl,skeleton_id)
            self.n_treeline_imports += 1
        elif pt_type == "areatree":
            # FIXME: no proper support for areatrees yet, so just import as a
            # treeline for the moment:
            ignore = False
            skeleton_id = self.insert_skeleton(parent_id, name_with_id)
            tl = pt.getObject()
            self.insertTree(tl,skeleton_id)
            self.n_areatree_imports += 1
            self.displayable_map[tl.getId()] = parent_id
        elif pt_type == "ball":
            # TODO: could just be supported by a treenode, since they
            # have a radius
            log(pad + "Ignoring ball")
        elif pt_type == "profile":
            log(pad + "Ignoring profile")
        elif pt_type == "profile_list":
            log(pad + "Ignoring profile list")
        elif pt_type == "area_list":
            ignore = False
            skeleton_id = self.insert_skeleton(parent_id, name_with_id)
            tl = pt.getObject()
            self.insertAreaList(tl, skeleton_id, parent_id, self.resample, annotations)
            self.displayable_map[tl.getId()] = parent_id
        elif pt_type == "pipe":
            log(pad + "Ignoring pipe")
        elif pt_type == "centrosome_without_cilium":
            log(pad + "Ignoring centrosome_without_cilium")
        elif pt_type == "glomerulus":
            new_id = parent_id
            ignore = False
            log(pad + "Descending into glomerulus")
        elif pt_type in descent_into:
            annotations.append(pt_type)
            new_id = parent_id
            ignore = False
            descent = True
            log(pad + "Descending into " + pt_type)
        elif pt_type in neuron_groups:
            if self.name_filters and not any([x in name_with_id for x in self.name_filters]):
                ignore = True
                log(f'{pad}Ignoring {name_with_id}, because of no matching name filter')
            else:
                new_id = self.insert_neuron(name_with_id)
                ignore = False
                descent = True
                log(pad + "Created neuron (" + name_with_id + ") and descending into " + pt_type)
        elif pt_type in ("pres", "posts"):
            log(pad + "Ignoring " + pt_type)
        elif pt_type == "marker":
            ignore = True
            log(pad + "Ignoring marker")
        elif pt_type == "network":
            new_id = parent_id
            ignore = False
            descent = True
            log(pad + "Descending into " + pt_type)
        else:
            raise Exception("Unknown type: "+str(pt_type))
        children = pt.getChildren()
        if children and (new_id or descent):
            all_ignored = True
            for c in children:
                all_ignored = self.add_recursively(c, new_id, depth+1, annotations.copy()) and all_ignored
            if is_neuron and all_ignored:
                log(pad + "Deleted empty neuron {}".format(new_id))
                self.delete_neuron(new_id)
        return ignore

    def add_synapse(self, name, connector, pre_nodes, post_nodes):
        # Find the centroid of those points:
        all_nodes = pre_nodes + post_nodes
        summed_tuple:Iterator[float] = map(sum,zip(*[(n.x, n.y, n.z) for n in all_nodes]))
        centroid = list(map(lambda x: x / len(all_nodes), summed_tuple))
        # create a connector at the centroid
        # create a synapse
        # make the connector a model_of the synapse
        # for each node pre and post:
        #    find if there is a treenode in the same layer
        #    and within the right distance
        #    if not:
        #       create one isolated treenode in a skeleton
        #    for each of treenodes:
        #       create a new pre/post synaptic terminal
        #       make the treenode a model_of the pre/postsynaptic terminal
        #       make the terminal pre/postsynaptic_to the synapse
        #       FIXME: TODO make the terminal part_of a skeleton or a neuron
        #
        # Now do these one at a time...
        # * create a connector at the centroid
        # * create a synapse
        # * make the connector a model_of the synapse
        connector_id = self.insert_connector_and_synapse(centroid[0], centroid[1], centroid[2])
        # * for each node pre and post:
        for side in (SynapseSides.PRE, SynapseSides.POST):
            side_string = "pre" if side == SynapseSides.PRE else "post"
            for node in (pre_nodes if side == SynapseSides.PRE else post_nodes):
                # * find if there is a treenode in the same layer
                #   and within the right distance
                # treenodes = node.find_treenodes_under()
                closest_treenode_id, distance = node.find_closest_treenode_in_linked_skeleton()
                neuron_id, skeleton_id = node.get_import_neuron_and_skeleton()
                # * if not:
                #   * create one isolated treenode in a skeleton
                treenode_id = None
                if not treenode_id:
                    if closest_treenode_id:
                        self.n_closest_node_matches += 1
                    else:
                        # treenodes.append(TreeNode(treenode_id, node.x, node.y, node.z))
                        # Create a skeleton, a neuron and make this part of the 'Fragments' group
                        neuron_id = self.insert_neuron('orphaned ' + side_string)
                        skeleton_id = self.insert_skeleton(neuron_id, 'orphaned ' + side_string)
                        log(f'orphaned {side_string}')
                        self.n_orphaned_nodes_created += 1

                    # Insert a treenode for the synaptic terminals
                    if distance > self.new_syn_link_node_dist or not closest_treenode_id:
                        treenode_id = self.insert_treenode(None, node.x, node.y, node.z, -1, 5, skeleton_id)

                        if closest_treenode_id:
                            cursor = connection.cursor()
                            cursor.execute("""
                                UPDATE treenode
                                SET skeleton_id = %(skeleton_id)s, parent_id = %(new_parent)s
                                WHERE id = %(treenode_id)s
                            """, {
                                'treenode_id': treenode_id,
                                'skeleton_id': skeleton_id,
                                'new_parent': closest_treenode_id,
                            })
                            log(f'Made treenode {closest_treenode_id} parent of {treenode_id}')
                    else:
                        treenode_id = closest_treenode_id

                # * create a new pre/post synaptic terminal
                terminal_relationship = side_string + "synaptic_to"
                # * make the treenode pre/postsynaptic_to the connector
                self.new_treenode_connector(terminal_relationship, treenode_id,
                        connector_id, treenode_id)

                #  * for each of treenodes:
                # for tn in treenodes:
                #      * create a new pre/post synaptic terminal
                #     terminal_relationship = side_string + "synaptic_to"
                #      * make the treenode pre/postsynaptic_to the connector
                #     new_treenode_connector(terminal_relationship, tn.treenode_id, connector_id)
                #     terminal_class_name = side_string + "synaptic terminal"
                #     terminal_id = self.new_class_instance(terminal_class_name, terminal_class_name)
                #      * make the treenode a model_of the pre/postsynaptic terminal
                #     new_treenode_class_instance('model_of',tn.treenode_id,terminal_id)
                #      * make the terminal pre/postsynaptic_to the synapse
                #     new_class_instance_class_instance(terminal_relationship,terminal_id,synapse_id)
                #      * make the pre/postsynaptic terminal a part_of the skeleton
                #      * find the skeleton ID
                #     skeleton_id = get_class_instance_from_treenode(tn.treenode_id,'element_of')
                #     new_class_instance_class_instance('part_of',terminal_id,skeleton_id)

    def add_connectors_recursively(self, pt, depth=0):
        name_with_id = self.get_project_thing_name(pt)
        pt_type = pt.getType()
        prefix = " "*depth
        log(f'{prefix} {pt} {name_with_id} :: {pt_type}')
        if pt_type == "connector":
            c = pt.getObject()
            log(f'{prefix}#########################################')
            log(f'{prefix}Got connector: {c} of type {type(c)}')
            aff = None
            try:
                aff = c.getAffineTransform()
            except AttributeError:
                pass
            if not aff:
                log(f"Connector didn't have getAffineTransform(), probably the type is wrong: {type(c)}")
            elif not c.root:
                log("Connector had no origin node")
            else:
                connector_target_nodes = c.root.getChildrenNodes()
                originNeuronId = self.connector_pre_neuron_map.get(name_with_id)
                log(f"Origin neuron ID: {originNeuronId} Query ID: {name_with_id}")
                originNode = ConnectorNode(self.node_to_coordinates(aff, c.root),
                        c.root.getData() * self.res_x, self,
                        SynapseSides.PRE, originNeuronId, c.getOrigins()) # type: ignore
                targetDisplayables = c.getTargets()
                targetNodes = [ConnectorNode(self.node_to_coordinates(aff, x),
                        x.getData() * self.res_x, self, SynapseSides.POST, # type: ignore
                        # It is okay to use originNeuronId here,
                        # because it is in fact correct for the XML hierarchy.
                        originNeuronId, targetDisplayables[i]) # type: ignore
                        for i, x in enumerate(connector_target_nodes)]
                log(f"{prefix}Got originNode: {originNode}")
                for t in targetNodes:
                    log(f"{prefix}Got targetNode: {t}")
                self.add_synapse(name_with_id, c, [ originNode ], targetNodes)
        else:
            if pt_type in ("pnx", "osnx", "lnx", "nx"):
                if self.name_filters and not any([x in name_with_id for x in self.name_filters]):
                    log(f'{prefix}Ignoring {name_with_id}, because of no matching name filter')
                    return
            children = pt.getChildren()
            if children:
                for c in children:
                    self.add_connectors_recursively(c, depth + 1)

    def get_imported_neuron_under(self, displayables, x, y, z):
        if len(displayables) > 1:
            raise ValueError("Currently only single objects under a node are "
                    f"allowed, found {len(displayables)}:{' '.join([str(d) for d in displayables])}")
        elif not displayables:
            return None
        obj = displayables[0]
        imported_neuron_id = self.displayable_map.get(obj.getId())

        if imported_neuron_id:
            log(f'Found imported neuron {imported_neuron_id} for intersected displayable: {obj}')
        else:
            log(f'Found no imported neuron for displayable: {obj}')

        return imported_neuron_id

    def get_project_thing_name(self, pt):
        o = pt.getObject()
        return f'{o if type(o) == str else o.toString()} #{str(pt.getId())}'

    def node_to_coordinates(self, aff, nd):
        # fp = self.ij.py.to_java([nd.x, nd.y], 'f')
        fp = [nd.x, nd.y]
        aff.transform(fp, 0, fp, 0, 1)
        x = fp[0] * self.pw
        y = fp[1] * self.ph
        z = float(nd.layer.z) * self.pw
        return (x, y, z)

    def insert_neuron(self, name):
        new_id = self.new_class_instance('neuron', name)
        log(f'insert neuron {new_id} name: {name}')
        return new_id

    def delete_neuron(self, part_of_group_id):
        self.delete_class_instance(part_of_group_id)

    def insert_skeleton(self, model_of_neuron_id, name):
        new_id = self.new_class_instance('skeleton', name)
        log(f'insert skeleton {new_id} {model_of_neuron_id}')
        self.new_class_instance_class_instance('model_of', new_id, model_of_neuron_id)
        return new_id

    def insertTree(self, tree, skeleton_id):
        if isinstance(tree, str):
            return
        root = tree.getRoot()
        if root is None:
            return None
        aff = tree.getAffineTransform()
        table = {} # type: ignore
        log('number of subtreenodes is:' + " " + str(len(tree.getRoot().getSubtreeNodes())) + " " + 'for TrakEM2 treeline' + " " + str(tree.getId()))
        for nd in tree.getRoot().getSubtreeNodes():
            x, y, z = self.node_to_coordinates(aff,nd)
            confidence = nd.getConfidence()
            parent = None
            log(f'parent: {nd.parent} {type(nd.parent)} {nd.parent.hashCode() if nd.parent else "root"}')
            if nd.parent:
                try:
                    parent = table[nd.parent.hashCode()]
                except KeyError:
                    log(f'Key Error {nd} {nd.parent}')
                    log(str(table))
                    raise
            radius = -1
            log(f'Classes {nd.hashCode()} {TrakEM2.RadiusNode} {nd.getClass() == TrakEM2.RadiusNode}')
            if nd.getClass() == TrakEM2.RadiusNode:
                radius = nd.getData()
            # In TrakEM2, 0 is "unset" as well as "radius 0" - in CATMAID,
            # we're making "-1" unset for the moment...
            if radius == 0:
                radius = -1
            new_id = self.insert_treenode(parent, x, y, z, radius, confidence, skeleton_id)
            table[nd.hashCode()] = new_id
            # Also try to find any tags:
            all_tags = nd.getTags()
            if all_tags:
                for tag in all_tags:
                    tag_as_string = tag.toString()
                    log("Trying to add tag: "+tag_as_string)

    def insertAreaList(self, arealist, skeleton_id, neuron_id, resample=1,
            annotations=['Import']):
        if isinstance(arealist, str):
            return

        try:
            pre_mesh_time = time.time()

            # Get triangles into python
            jtriangles = arealist.generateTriangles(1, resample)

            post_mesh_time = time.time()
            log(f'Meshing time (resample: {resample}): {str(post_mesh_time - pre_mesh_time)}s')

            vertices = [(t.x, t.y, t.z) for t in jtriangles]
            faces = [(3*x, 3*x+1, 3*x+2) for x in range(len(vertices)//3)]
            original_mesh = trimesh.Trimesh(vertices, faces)
            fixed_mesh = sk.preprocessing.fix_mesh(original_mesh)
            trimesh.repair.fill_holes(fixed_mesh)

            # Remove degenerate faces
            # Remove non-manifold faces

            # Simplify more (needs Blender 3D installed)
            if self.blender_simlify:
                simplified_mesh = sk.simplify(fixed_mesh, ratio=self.simplify_ratio)
                fragments = list(sorted(simplified_mesh.split(),
                        key=lambda x: len(x.vertices), reverse=True))

                # Only use largest connected component
                if self.only_largest_fragment:
                    log([len(f.vertices) for f in fragments])
                    mesh = fragments[0]
                    log(f'Selected mesh with {len(mesh.vertices)} vertices from a '
                            f'total of {len(fragments)} fragments with a total of '
                            f'{len(simplified_mesh.vertices)} vertices')
                else:
                    mesh = simplified_mesh
                    log(f'Using all {simplified_mesh.body_count} fragments '
                            f'with a total of {len(simplified_mesh.vertices)} vertices. '
                            'After the skeletonization, disconnected fragments will be '
                            'attempted to join.')

            # Remove faces that aren't connected to two other faces
            n_old_faces = len(mesh.faces)
            cc = trimesh.graph.connected_components(mesh.face_adjacency, min_len=2)
            mask = np.zeros(n_old_faces, dtype=np.bool)
            mask[np.concatenate(cc)] = True
            mesh.update_faces(mask)
            n_faces = len(mesh.faces)
            if n_faces == n_old_faces:
                log(f'All {n_faces} faces are connected to at least 2 other faces')
            else:
                log(f'Removed {n_old_faces - n_faces} not fully connected faces, out of {n_old_faces} in total')

            if self.blender_remesh:
                mesh = sk.remesh(mesh, self.remesh_voxel_size, self.remesh_adaptivity)

            if self.only_largest_mesh_component:
                meshes = mesh.split()
                if len(meshes) > 1:
                    mesh = sorted(meshes, key=lambda x: len(x.faces))[-1]
                    log(f'Keeping only largest component of {len(meshes)} with {len(mesh.faces)} faces')

            if self.open3d_mesh_repair:
                log('Using Open3D to repair defects in the generated mesh')
                import open3d as o3d

                point_cloud = np.array(mesh.vertices)
                pcd_raw = o3d.geometry.PointCloud()
                pcd_raw.points = o3d.utility.Vector3dVector(point_cloud[:,:3])
                # To visualize: o3d.visualization.draw_geometries([pcd])

                # Remove outlier points
                pcd, removed_idx = pcd_raw.remove_statistical_outlier(
                        nb_neighbors=10, std_ratio=3.0)

                # Estimate normals
                distances = pcd.compute_nearest_neighbor_distance()
                avg_dist = np.mean(distances)
                radius = 3 * avg_dist
                pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=radius, max_nn=10))

                # Create a mesh
                tetra_mesh, tetra_mesh_ind = o3d.geometry.TetraMesh.create_from_point_cloud(pcd)

                poisson_mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson( pcd, depth=8, width=0, scale=1.1, linear_fit=False)[0]

                alpha_mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(pcd, alpha=0.03)

                radii = [radius * 0.05, radius * 0.1, radius * 0.5, radius, radius * 2, radius * 4, radius * 8]
                bpa_mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(pcd, o3d.utility.DoubleVector(radii))

            if self.meshfix_mesh_repair:
                log('Using MeshFixD to repair defects in the generated mesh')
                import pymeshfix
                from pymeshfix import _meshfix
                v = np.array(mesh.vertices)
                f = np.array(mesh.faces)
                vclean, fclean = _meshfix.clean_from_arrays(v, f, True, False, False)
                meshfix = pymeshfix.MeshFix(v, f)
                meshfix.repair(True, True, False)
                log(f'Cleaned mesh using MeshFix, vertices/faces before {len(v)}/{len(f)}, after: {len(vclean)}/{len(fclean)}')
                mesh = trimesh.Trimesh(vclean, fclean)

            if self.pygamer_mesh_repair:
                log('Using PyGamer to repair defects in the generated mesh')
                import pygamer
                # TODO: Does't currently work due to a problem in pygamer
                obj_str = export_obj(mesh)
                with open('tmp.obj', 'w') as f:
                    f.write(obj_str)

                fix_mesh = pygamer.readOBJ('tmp.obj')

                # Compute the normal orientation
                components, orientable, manifold = fix_mesh.compute_orientation()
                fix_mesh.correctNormals()

                fix_meshes = fix_mesh.splitSurfaces()
                log('Repaired with PyGAMer')

            if self.import_volumes:
                log(f'Importing volume with {len(mesh.faces)} faces')
                neuron_name = ClassInstance.objects.get(id=neuron_id).name
                catmaid_volume = TriangleMeshVolume(self.project_id,
                        self.user.id, {
                            'type': 'trimesh',
                            'title': neuron_name,
                            'mesh': [mesh.vertices.tolist(), mesh.faces.tolist()],
                        })
                catmaid_volume_id = catmaid_volume.save()
                log(f'Created CATMAID volume with ID {catmaid_volume_id} and '
                        f'name {neuron_name}')

            # Use skeletor for skeletonization
            # Contract the mesh
            if self.skeletonization_method == SkeletonizationMethod.Skeletor:
                # Optionally add umbrella operator: operator='umbrella')
                cont = sk.contract(mesh, SL=40, WH0=1, iter_lim=20, epsilon=0.001,
                        precision=1e-6, progress=True, validate=False)
                post_contract_time = time.time()
                log(f'Skeleton contract time: {str(post_contract_time - post_mesh_time)}s')

                smooth_steps = 2000
                log(f'Smooting contracted mesh with {smooth_steps} Taubin smoothing')
                trimesh.smoothing.filter_taubin(cont, iterations=smooth_steps)

                if self.import_contracted_volumes:
                    neuron_name = ClassInstance.objects.get(id=neuron_id).name
                    catmaid_volume = TriangleMeshVolume(self.project_id,
                            self.user.id, {
                                'type': 'trimesh',
                                'title': f'{neuron_name} [contracted]',
                                'mesh': [cont.vertices.tolist(), cont.faces.tolist()],
                            })
                    catmaid_volume_id = catmaid_volume.save()
                    log(f'Created contracted CATMAID volume with ID {catmaid_volume_id} and '
                            f'name {neuron_name} [contracted]')


                # Extract the skeleton from the contracted mesh
                swc = sk.skeletonize(cont, output='swc', method='edge_collapse')
                # Optionally with parameters:
                #         shape_weight=0.5, sample_weight=0.05)
                # Alternatively:
                # swc = sk.skeletonize(cont, output='swc', method='vertex_clusters',
                #         sampling_dist=self.skeleton_sampling_dist)
                post_skeletonize_time = time.time()
                log(f'Skeletonization time (sample dist: {self.skeleton_sampling_dist}): '
                        f'{str(post_skeletonize_time - post_contract_time)}s')
                swc = sk.clean(swc, mesh, theta=0.03, max_dist=100)
                post_clean_time = time.time()
                log(f'(Skeleton clean time: {str(post_clean_time - post_skeletonize_time)}s')
                # Add/update radii
                swc['radius'] = sk.radii(swc, mesh, method='knn', n=5, aggregate='mean')
            elif self.skeletonization_method == SkeletonizationMethod.STL2SWC:
                log('Skeletonizing using stl2swc (CGAL)')
                before_skel_time = time.time()
                # Export mesh as STL
                in_fd, in_path = tempfile.mkstemp(suffix='.stl')
                out_fd, out_path = tempfile.mkstemp(suffix='.edges')
                lines = []
                try:
                    # We don't need a file handle here
                    os.close(in_fd)
                    os.close(out_fd)
                    pwd = os.getcwd()
                    os.chdir('/tmp')
                    mesh.export(in_path)
                    # More Loop subdivisions move the the skeleton closer to the
                    # center
                    num_subdiv_steps = self.stl2swc_subdiv_steps
                    # Increase for slower and better quality (default: 0.1)
                    quality_speed_tradeoff = self.stl2swc_quality_speed_tradeoff
                    # Increase value to move skeleton closer to the medial axis
                    # (default: 0.2)
                    medially_centered_speed_tradeoff = self.stl2swc_medially_centered_speed_tradeoff
                    out = subprocess.Popen([self.stl2swc,
                        in_path, out_path, str(num_subdiv_steps),
                        str(quality_speed_tradeoff),
                        str(medially_centered_speed_tradeoff)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                    stdout,stderr = out.communicate()
                    log(str(stdout))
                    log(str(stderr))
                    with open(out_path) as f:
                        lines = [list(map(lambda x: float(x), line.replace('\n', '').split(' '))) for line in f]
                    os.chdir(pwd)
                finally:
                    os.remove(in_path)
                    os.remove(out_path)

                if not lines:
                    raise ValueError("No skeleton edges generated")

                after_skel_time = time.time()
                log(f'Skeletonized using stl2swc in {after_skel_time - before_skel_time}s')
                swc_data = edge_list_to_swc(lines)
                swc = pandas.DataFrame(swc_data)
            else:
                raise ValueError(f'Unknown skeletonization method: {self.skeletonization_method}')

            swc.columns = ['node_id', 'label', 'x', 'y', 'z', 'radius', 'parent_id']

            # Try to heal mesh by connecting fragments
            if not self.only_largest_fragment:
                max_healing_dist = self.skeleton_max_join_dist
                nv_neuron = ns.TreeNeuron(swc, units='nm')
                # To add tags:
                # nv_neuron.tags = {}
                n_roots = len(nv_neuron.root)
                if n_roots > 1:
                    healed_neurons = ns.heal_fragmented_neuron(ns.NeuronList(nv_neuron),
                            min_size=self.min_healing_size, max_dist=max_healing_dist)
                    post_heal_time = time.time()
                    log(f'Healed skeleton in {post_heal_time - post_clean_time} s '
                            f'with min_size = {self.min_healing_size} and max_dist = '
                            f'{max_healing_dist}. It had {n_roots} roots before and '
                            f'now has {len(healed_neurons.n_trees)}.')

                    healed_neuron = healed_neurons[0]
                    n_roots_new = len(healed_neuron.root)
                    n_init_skeleton_nodes = len(swc)
                    if n_roots_new > 1:
                        # Get fragments sorted decending by size and create navis
                        # neuron data structure for the respective set of nodes.
                        components = sorted(healed_neuron.subtrees, key=lambda x: len(x))
                        largest_nv_neuron = ns.subset_neuron(healed_neuron, list(components[-1]))
                        # Convert this neuron back to a SWC data frame
                        swc = ns.io.swc_io.make_swc_table(largest_nv_neuron)
                        swc.columns = ['node_id', 'label', 'x', 'y', 'z', 'radius', 'parent_id']

                        log('Kept only single largest skeleton with '
                                f'{len(largest_nv_neuron.nodes)} vertices. The '
                                'largest pre-healing fragment has '
                                f'{n_init_skeleton_nodes} vertices.')
                    else:
                        swc = ns.io.swc_io.make_swc_table(healed_neuron)
                        swc.columns = ['node_id', 'label', 'x', 'y', 'z', 'radius', 'parent_id']
                        log(f'The skeleton has {len(swc)} vertices after healing. The '
                                f'largest pre-healing fragment has {n_init_skeleton_nodes} vertices.')
                else:
                    log('No need to heal, skeleton has only one fragment')

            post_trimesh_time = time.time()
            log(f'Total mesh skeletonization time: {str(post_trimesh_time - post_mesh_time)}s')
            log(f'Total overall skeletonization time: {str(post_trimesh_time - pre_mesh_time)}s')
            log(f'Number of treenodes: {len(swc)}')

            # This pandas data frame can now be added as a skeleton to CATMAID by
            # using its import API. This will create both the skeleton and neuron
            # plus all treenodes.
            swc_string = swc.to_csv(header=False, sep=' ', index=False,
                    columns=['node_id', 'node_id', 'x', 'y', 'z', 'radius', 'parent_id'])
            result = _import_skeleton_swc(self.user, self.project_id,
                    swc_string, annotations=annotations,
                    neuron_id=neuron_id, skeleton_id=skeleton_id, force=True)
            post_import_time = time.time()
            log(f'Imported neuron {result["neuron_id"]}, skeleton {result["skeleton_id"]}, '
                    f'{len(result["node_id_map"])} treenodes in {post_import_time - post_trimesh_time}s')

            if not result:
                raise ValueError(f"Could not import skeleton {skeleton_id}")

            log(f'number of btreenodes is: {str(len(result["node_id_map"]))} for '
                    f'TrakEM2 arealist {str(arealist.getId())}')
            self.n_arealist_imports += 1
        except Exception as e:
            self.n_import_errors += 1
            if self.ignore_errors:
                log(f'Received error for arealist {str(arealist.getId())}: {str(e)}')
                traceback.print_exc()
                return None
            else:
                raise e

    def new_class_instance(self, class_name, class_instance_name):
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO class_instance
            (user_id, project_id, class_id, name)
            VALUES (%(user_id)s, %(project_id)s, %(class_id)s, %(name)s)
            RETURNING id
        """, {
            'project_id': self.project_id,
            'user_id': self.user_id,
            'class_id': self.class_id_map[class_name],
            'name': class_instance_name,
        })

        new_id = cursor.fetchone()[0]
        return new_id

    def delete_class_instance(self, obj_id):
        cursor = connection.cursor()
        cursor.execute("""
            DELETE FROM class_instance
            WHERE id = %(id)s
            RETURNING id
        """, {
            'id': obj_id,
        })
        old_id = cursor.fetchone()
        if obj_id:
            obj_id = obj_id[0]
        return old_id

    def new_class_instance_class_instance(self, relation_name, ci1, ci2):
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO class_instance_class_instance
            (user_id, project_id, relation_id, class_instance_a, class_instance_b)
            VALUES (%(user_id)s, %(project_id)s, %(relation_id)s, %(class_instance_a)s, %(class_instance_b)s)
            RETURNING id
        """, {
            'project_id': self.project_id,
            'user_id': self.user_id,
            'relation_id': self.relation_id_map[relation_name],
            'class_instance_a': ci1,
            'class_instance_b': ci2,
        })
        new_id = cursor.fetchone()[0]
        return new_id

    def insert_treenode(self, parent_id, x, y, z, radius, confidence, skeleton_id=None):
        cursor = connection.cursor()
        cursor.execute("""
          INSERT INTO treenode (user_id, editor_id, project_id, parent_id,
              location_x,location_y,location_z, radius, confidence, skeleton_id)
          VALUES (%(user_id)s, %(editor_id)s, %(project_id)s, %(parent_id)s,
              %(location_x)s, %(location_y)s, %(location_z)s,%(radius)s,
              %(confidence)s, %(skeleton_id)s)
          RETURNING id
        """, {
              'project_id': self.project_id,
              'user_id': self.user_id,
              'editor_id': self.user_id,
              'parent_id': parent_id, # Can be None
              'location_x': x,
              'location_y': y,
              'location_z': z,
              'radius': radius,
              'confidence': confidence,
              'skeleton_id': skeleton_id,
        })
        # if skeleton_id:
        #   new_treenode_class_instance('element_of',new_id,skeleton)
        new_id = cursor.fetchone()[0]
        return new_id

    def insert_connector_and_synapse(self, x, y, z):
        cursor = connection.cursor()
        cursor.execute("""
          INSERT INTO connector
                (user_id, editor_id, project_id, location_x, location_y, location_z)
          VALUES (%(user_id)s, %(editor_id)s, %(project_id)s, %(location_x)s,
                %(location_y)s, %(location_z)s)
          RETURNING id
        """, {
            'project_id': self.project_id,
            'user_id': self.user_id,
            'editor_id': self.user_id,
            'location_x': x,
            'location_y': y,
            'location_z': z,
        })
        connector_id = cursor.fetchone()
        self.n_connectors_created += 1
        return connector_id

    def new_treenode_connector(self, relation_name, treenode_name, connector_id,
            treenode_id):
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO treenode_connector
                (user_id, project_id, relation_id, treenode_id, connector_id,
                skeleton_id)
            SELECT %(user_id)s, %(project_id)s, %(relation_id)s, %(treenode_id)s,
                %(connector_id)s, t.skeleton_id
            FROM treenode t
            WHERE t.id = %(treenode_id)s
            ON CONFLICT ON CONSTRAINT treenode_connector_project_id_treenode_id_connector_id_relation DO UPDATE SET user_id = %(user_id)s
            RETURNING id
        """, {
            'project_id': self.project_id,
            'relation_id': self.relation_id_map[relation_name],
            'connector_id': connector_id,
            'user_id': self.user_id,
            'treenode_id': treenode_id,
        })
        row = cursor.fetchone()
        self.n_connector_links_created += 1
        return row[0]

    def get_treenodes_within(self, x1, x2, y1, y2, z1, z2):
        cursor = connection.cursor()
        cursor.execute("""
            SELECT id, t.location_x, t.location_y, t.location_z
            FROM treenode AS t WHERE project_id = %(project_id)s AND
            t.location_x >= %(x1)s AND t.location_x <= %(x2)s AND
            t.location_y >= %(y1)s AND t.location_y <= %(y2)s AND
            t.location_z >= %(z1)s AND t.location_z <= %(z2)s
        """, {
            'project_id': self.project_id,
            'x1': x1,
            'x2': x2,
            'y1': y1,
            'y2': y2,
            'z1': z1,
            'z2': z2,
        })
        result = [TreeNode(r[0], r[1], r[2], r[3]) for r in cursor.fetchall()]
        return result

    def destroy(self):
        if self.p:
            self.p.destroy()

def render_trimesh(mesh):
    import pyrender
    render_mesh = pyrender.Mesh.from_trimesh(mesh)
    scene = pyrender.Scene()
    scene.add(render_mesh)
    pyrender.Viewer(scene, use_raymond_lighting=True)


def neuron_to_swc(x):
    # Make copy of nodes and reorder such that the parent comes always before
    # its child(s)
    nodes_ordered = [n for seg in x.segments for n in seg[::-1]]
    this_tn = x.nodes.set_index('node_id', inplace=False).loc[nodes_ordered]

    # Because the last node ID of each segment is a duplicate
    # (except for the first segment ), we have to remove these
    this_tn = this_tn[~this_tn.index.duplicated(keep='first')]

    # Add an index column (must start with "1", not "0")
    this_tn['index'] = list(range(1, this_tn.shape[0] + 1))

    # Make a dictionary node_id -> index
    tn2ix = this_tn['index'].to_dict()

    # Make parent index column
    this_tn['parent_ix'] = this_tn.parent_id.map(lambda x: tn2ix.get(x, -1))

    # Add labels
    labels = None
    if isinstance(labels, dict):
        this_tn['label'] = this_tn.index.map(labels)
    elif isinstance(labels, str):
        this_tn['label'] = this_tn[labels]
    else:
        this_tn['label'] = 0
        # Add end/branch labels
        this_tn.loc[this_tn.type == 'branch', 'label'] = 5
        this_tn.loc[this_tn.type == 'end', 'label'] = 6
        # Add soma label
        # if x.soma:
        #     this_tn.loc[x.soma, 'label'] = 1
        # if export_synapses:
        #     # Add synapse label
        #     this_tn.loc[x.presynapses.node_id.values, 'label'] = 7
        #     this_tn.loc[x.postsynapses.node_id.values, 'label'] = 8

    # Generate table consisting of PointNo Label X Y Z Radius Parent
    # .copy() is to prevent pandas' chaining warnings
    swc = this_tn[['index', 'label', 'x', 'y', 'z',
                   'radius', 'parent_ix']].copy()

    # Adjust column titles
    swc.columns = ['node_id', 'label', 'x', 'y', 'z', 'radius', 'parent_id']

    return swc
