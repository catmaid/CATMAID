import os
import math
import time
import xml.etree.ElementTree
import traceback

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import connection, transaction

from catmaid.apps import get_system_user
from catmaid.control.edge import rebuild_edge_tables
from catmaid.history import add_log_entry
from catmaid.models import Project

from psycopg2.extras import execute_batch
from progressbar import progressbar

try:
    from molesq import Transformer
except ImportError:
    print('Can\'t import molesq, no MLS post-transformations are available.')

import imagej

User = get_user_model()

class Java():

    String = None
    Array = None
    AffineTransform = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        Java.String = autoclass('java.lang.String')
        Java.AffineTransform = autoclass('java.awt.geom.AffineTransform')


class MPICBG():

    AffineModel2D = None
    CoordinateTransformList = None
    Patch = None
    TransformMesh = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        MPICBG.AffineModel2D = autoclass('mpicbg.models.AffineModel2D')
        MPICBG.CoordinateTransformList = autoclass('mpicbg.models.CoordinateTransformList')
        MPICBG.Patch = autoclass('ini.trakem2.display.Patch')
        MPICBG.TransformMesh = autoclass('mpicbg.trakem2.transform.TransformMesh')


def _log(msg):
    print(msg)
log = _log


def parse_transform(xform):
    from jnius import autoclass
    if xform.tag in ('iict_transform', 'ict_transform'):
        Transform = autoclass(xform.attrib['class'])
        t = Transform()
        t.init(Java.String(xform.attrib['data']))
        return t
    elif xform.tag == 'ict_transform_list':
        coord_list = MPICBG.CoordinateTransformList() # type: ignore
        for sub_xform in xform:
            # For some reason, this doesn't work if parse_transform() is
            # directly invoked as parameter for add(). The returned
            # transformation is simply not added. Very strange, but I suspect
            # this has to do with pyjnius
            parsed_sub_xform = parse_transform(sub_xform)
            coord_list.add(parsed_sub_xform)
        return coord_list
    else:
        raise ValueError(f'Unsupported transformation type: {xform.tag}')




class TrakEM2Layer(object):

    def __init__(self, xml_data, res_x, res_y, res_z, offset_x=0, offset_y=0):
        self.z_start = float(xml_data.attrib['z']) * res_z - 0.00001
        self.z_end = self.z_start + res_z - 0.00001

        self.res_x = res_x
        self.res_y = res_y
        self.res_z = res_z

        self.offset_x = offset_x
        self.offset_y = offset_y

        patches = xml_data.findall('t2_patch')
        if not patches:
            raise ValueError("No patch found for layer with z={}".format(self.z_start))
        if len(patches) > 1:
            raise ValueError("Currently only one patch per layer is supported")
        self.patch_data = patches[0]
        self.title = self.patch_data.attrib['title']
        self.file_path = self.patch_data.attrib['file_path']
        self.mesh_resolution = int(self.patch_data.attrib['mres'])
        self.o_width = float(self.patch_data.attrib['o_width'])
        self.o_height = float(self.patch_data.attrib['o_height'])
        self.ct_id = self.patch_data.attrib['ct_id']
        self.id = int(self.patch_data.attrib['oid'])

        # To get the TrakEM2 patch (not needed here):
        # layer_set = project.getRootLayerSet()
        # layer = layer_set.getLayer(int(xml_data.attrib['oid']))
        # log(f'Found layer for id {xml_data.attrib["oid"]}: {layer.getId()}')

        # patches = layer.getPatches(True)
        # if patches.size() != 1:
        #     raise ValueError(f'Need exactly one patch, got {len(patches)}')
        # self.patch = patches.get(0)

        # The text representation of a matrix is expected to look like this:
        # matrix(a, b, c, d, e, f), which represents the matrix columns [a,b],
        # [c,d] and [e,f]
        transform_text = self.patch_data.attrib['transform']
        self.affine_transform = [float(n) for n in
                          transform_text.lstrip('matrix(').rstrip(')').split(',')]

        # Read ICT transformations
        ict_transform_lists = self.patch_data.findall('ict_transform_list')
        if ict_transform_lists and len(ict_transform_lists) > 1:
            raise ValueError('Can handle only one <ict_transform_list> entry')
        ict_transform_list = ict_transform_lists[0] if ict_transform_lists else None

        if ict_transform_list:
            transform_list = MPICBG.CoordinateTransformList() # type: ignore
            # For some reason, this doesn't work if parse_transform() is
            # directly invoked as parameter for add(). The returned
            # transformation is simply not added. Very strange, but I suspect
            # this has to do with pyjnius
            parsed_transform_list = parse_transform(ict_transform_list)
            transform_list.add(parsed_transform_list)

            coord_list = MPICBG.CoordinateTransformList() # type: ignore
            coord_list.add(transform_list)

            # Correct for non-linearly transformed mesh bounds. This is
            # necessary, because nodes come from the pre-transformation space
            # and the removal of the translation here is re-added by the patch
            # affine, added after this (in transform_point_entry).
            mesh = MPICBG.TransformMesh(transform_list, self.mesh_resolution, self.o_width, self.o_height)
            box = mesh.getBoundingBox()

            # Affine and non-linear transformation offset (baked into the
            # stored affine).
            aff = Java.AffineTransform(*self.affine_transform)
            aff.translate(-box.x, -box.y)
            affm = MPICBG.AffineModel2D()
            affm.set(aff)
            coord_list.add(affm)

            # With both the non-linear transform and the affine plus the
            # bounding box shift, <coord_list> is now exactly the same as
            # TrakEM2's Patch.getFullCoordinateTransform(). However, we can't
            # apply it as is if we want the transformed vector data to match the
            # transformed image data. The image data is transformed using a
            # triangular mesh that is brought into source patch space using an
            # inverse transform. Image parts within each triangle are then
            # interpolated within it. We need to do the same thing with vector
            # data. Directly applying the transformations can otherwise be "too
            # precise".
            self.transform_list = MPICBG.CoordinateTransformList() # type: ignore
            transform_mesh = MPICBG.TransformMesh(coord_list, self.mesh_resolution, self.o_width, self.o_height)
            self.transform_list.add(transform_mesh)

            # Re-add the non-linear transformation offset.
            transform_mesh_bb = transform_mesh.getBoundingBox()
            aff = Java.AffineTransform()
            aff.translate(transform_mesh_bb.x, transform_mesh_bb.y)
            affm = MPICBG.AffineModel2D()
            affm.set(aff)
            self.transform_list.add(affm)
        else:
            self.transform_list = None

    def __str__(self):
        xform = 'CoordTransformList' or self.affine_transform
        return f"Z: [{self.z_start}, {self.z_end}) Title: {self.title} Transform list: {xform}"

    def transform_point_entry(self, loc_entry, post_transform=None):
        """The passed in location entry is assumed to be an at least 3-element
        tuple or list, where the first three elements are the X, Y and Z
        coordinate to be transformed.
        """
        # In order to apply the TrakEM2 transformation, we need to
        # change coordinate frames from world to px
        new_loc = [
            loc_entry[0] / self.res_x,
            loc_entry[1] / self.res_y
        ]

        # Add optional offset
        new_loc[0] += self.offset_x
        new_loc[1] += self.offset_y

        if self.transform_list:
            new_loc = self.transform_list.apply((new_loc[0], new_loc[1]))

        # The simple affine case if there are no non-linear transformations
        # could look like this:
        #
        # new_loc[0] = new_loc[0] * self.affine_transform[0] + new_loc[1] * self.affine_transform[2] + self.affine_transform[4]
        # new_loc[1] = new_loc[0] * self.affine_transform[1] + new_loc[1] * self.affine_transform[3] + self.affine_transform[5]

        dist = math.sqrt((self.res_x * (new_loc[0] - loc_entry[0])) ** 2 +
                (self.res_y * (new_loc[1] - loc_entry[1])) ** 2)

        if post_transform:
            corrected_coord = post_transform.transform([new_loc[:2]])
            new_loc[0] = corrected_coord[0][0]
            new_loc[1] = corrected_coord[0][1]

        # Transform back to world space
        loc_entry[0] = new_loc[0] * self.res_x
        loc_entry[1] = new_loc[1] * self.res_y

        return dist


class CoordTransformer(object):

    def __init__(self, project_id, target_xml, res_x, res_y, res_z, editor=None,
            review_reset_distance=None, offset_x=0.0, offset_y=0.0,
            skeleton_ids=[], layers=[], post_mapping=[], offset_min_z=None,
            offset_max_z=None):
        log('Initializing coordinate transformer')
        self.project_id = project_id
        self.xml = target_xml
        self.res_x = res_x
        self.res_y = res_y
        self.res_z = res_z
        self.last_editor = editor or get_system_user()
        self.review_reset_distance = review_reset_distance
        self.offset_x = offset_x
        self.offset_y = offset_y
        self.offset_min_z = offset_min_z
        self.offset_max_z = offset_max_z
        self.skeleton_ids = skeleton_ids
        self.layers_to_transform = set(layers or [])
        self.post_mapping_point_matches = post_mapping

        # If we wanted to use TrakEM2 data structures directly (inconvenient for
        # debugging and seems slower overall):
        # self.project = TrakEM2.Project.openFSProject(Java.String(self.xml), False) # type: ignore
        # log(f'Opened project from file ({self.xml}):')
        # log(self.project.getInfo())

        # Parse target XML file to find transformation for each section.
        target_data = xml.etree.ElementTree.parse(self.xml)
        if not target_data:
            raise ValueError("Could not parse target XML")
        target_data_root = target_data.getroot()
        if target_data_root.tag != 'trakem2':
            raise ValueError("This doesn't look like a TrakEM2 XML file, could not find trakem2 root")

        # Get first available layer set
        self.layers = []
        target_data_layerset = target_data_root.find('t2_layer_set')
        if target_data_layerset:
            if self.layers_to_transform:
                log(f'Loading {len(self.layers_to_transform)} layer(s)')
            else:
                log('Loading all layers')
            for n, layer_data in enumerate(progressbar(target_data_layerset.findall('t2_layer'))):
                if self.layers_to_transform and n not in self.layers_to_transform:
                    continue

                layer_z = float(layer_data.attrib['z'])
                offset_disabled = (offset_min_z and (layer_z - offset_min_z) < -0.00001) \
                    or (offset_max_z and (layer_z - offset_max_z) > 0.00001)

                if offset_disabled:
                    offset_x, offset_y = 0.0, 0.0
                else:
                    offset_x, offset_y = self.offset_x, self.offset_y

                layer = TrakEM2Layer(layer_data, res_x, res_y, res_z, offset_x, offset_y)
                self.layers.append(layer)

        # Sort layers by Z
        sorted(self.layers, key=lambda x: x.z_start)

        # If there are post processing point matches, precompute transformer.
        self.post_transformer = None
        if self.post_mapping_point_matches:
            self.post_transformer = Transformer(
                    list(map(lambda x: x[0], self.post_mapping_point_matches)),
                    list(map(lambda x: x[1], self.post_mapping_point_matches)),
            )
            log(f'Setting up post-transformer: {self.post_transformer}, test '
                f'transform of (0,0): {self.post_transformer.transform([[0,0]])[0]}')

    def transform(self):
        """Iterate over all layers, find all location entries in the database
        on this layer, transform with the layer's transformation and write them
        back.
        """
        start_time = time.time()
        cursor = connection.cursor()
        n_total_reviews_reset = 0
        if self.skeleton_ids:
            join = """
                JOIN (
                    SELECT t.id
                    FROM treenode t
                    JOIN UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
                        ON skeleton.id = t.id
                ) sub
                    ON sub.id = location.id
            """
        else:
            join = ''

        # Remove if not needed
        seen = set()
        hit = 0

        def take_if_not_seen(entry):
            nonlocal hit
            if entry[3] in seen:
                hit += 1
                return False
            else:
                seen.add(entry[3])
            return True

        for n, l in enumerate(self.layers):
            log(f'Transforming layer {n+1}/{len(self.layers)}: [{l.z_start}, {l.z_end})')
            cursor.execute("""
                SELECT location_x, location_y, %(last_editor_id)s, location.id
                FROM location
                {join}
                WHERE project_id = %(project_id)s
                AND location_z >= %(z_start)s
                AND location_z < %(z_end)s
            """.format(join=join), {
                'project_id': self.project_id,
                'z_start': l.z_start,
                'z_end': l.z_end,
                'last_editor_id': self.last_editor.id,
                'skeleton_ids': self.skeleton_ids,
            })

            # Get lists rather than tuples and transform points
            reset_reviews_for = []
            locations = list(filter(take_if_not_seen, map(list, cursor.fetchall())))
            for loc in locations:
                dist = l.transform_point_entry(loc, self.post_transformer)
                if self.review_reset_distance and dist > self.review_reset_distance:
                    reset_reviews_for.append(loc[3])

            log(f'  Found and transformed {len(locations)} locations, considering {len(reset_reviews_for)} locations for review reset, offset: {l.offset_x}, {l.offset_y}')

            # Write points back into database
            execute_batch(cursor, """
                UPDATE location
                SET location_x = %s, location_y = %s, editor_id = %s
                WHERE id = %s
            """, locations, page_size=100)

            n_reset_reviews = 0
            if self.review_reset_distance and reset_reviews_for:
                cursor.execute("""
                    DELETE FROM review
                    WHERE id = ANY(%(reset_reviews_for)s::bigint[])
                    RETURNING id
                """, {
                    'reset_reviews_for': reset_reviews_for,
                })
                n_reset_reviews = len(list(cursor.fetchall()))
                n_total_reviews_reset += n_reset_reviews

            log(f'  Updated locations in database, reset {n_reset_reviews} reviews')

        log(f'Rebuilding edge table of project {self.project_id}')
        rebuild_edge_tables(project_ids=[self.project_id], log=log)

        log(f'Rebuilding skeleton summary for project {self.project_id}')
        cursor.execute("""
            SELECT refresh_skeleton_summary_table_for_project(%(project_id)s::int);
         """, {
            'project_id': self.project_id,
        })

        end_time = time.time()
        log(f'Transformation complete (took {end_time - start_time:.2f} sec), reset {n_total_reviews_reset} reviews, {hit} re-checked nodes')


class Command(BaseCommand):
    help = ("This script will create SQL commands to transform existing tracing data "
            "into a new space. This transformation is built from one or two TrakEM2 "
            "XML files. A typical call could look like this: manage.py "
            "catmaid_update_tracing_data_using_trakem2_xml --imagej \"/path/to/Fiji.app\" "
            "--xml /path/to/trakem2.xml --project-id <project-id> --res-x <nm> --res-z <nm>")

    def add_arguments(self, parser):
        parser.add_argument('--xml', dest='xml', required=True,
                help='target space TrakEM2 XML file')
        parser.add_argument('--project-id', dest='project_id', required=True,
                help='the project to update tracing data in', type=int)
        parser.add_argument('--imagej', dest='imagej', required=False,
            help='An ImageJ specification like a path to Fiji.app or a version'),
        parser.add_argument('--pyjnius', dest='pyjnius', required=False,
            help='Set the PYJNIUS_JAR environment variable.'),
        parser.add_argument('--java-home', dest='java_home', required=False,
            help='Set the JAVA_HOME environment variable.'),
        parser.add_argument('--java-heap', dest='java_heap', required=False,
            help='Set the JVM heap size (-Xmx), e.g. 70G.'),
        parser.add_argument('--res-x', dest='res_x', required=True, type=float,
            help='The X resolution in nm of the TrakEM2 project')
        parser.add_argument('--res-y', dest='res_y', required=True, type=float,
            help='The Y resolution in nm of the TrakEM2 project')
        parser.add_argument('--res-z', dest='res_z', required=True, type=float,
            help='The Z resolution in nm of the TrakEM2 project')
        parser.add_argument('--user', dest='user', required=False,
            help='The username of the user who is used to make the changes. By default first superuser available.')
        parser.add_argument('--review-reset-distance',
                dest='review_reset_distance', required=False, type=float, default=None,
                help='If set, any treenode reviews will be reset if the new location is farther away than X nm.')
        parser.add_argument('--offset-x', dest='offset_x', required=False, type=float,
            default=0, help='An X optional offset applied to all transformed coordinates')
        parser.add_argument('--offset-y', dest='offset_y', required=False, type=float,
            default=0, help='An Y optional offset applied to all transformed coordinates')
        parser.add_argument('--offset-min-z', dest='offset_min_z', required=False, type=float,
            default=None, help='An optional Z range start, for which the offset will be applied exclusively.')
        parser.add_argument('--offset-max-z', dest='offset_max_z', required=False, type=float,
            default=None, help='An optional Z range end, for which the offset will be applied exclusively.')
        parser.add_argument('--skeleton-ids', dest='skeleton_ids', required=False,
            default='', help='A list of skeleton IDs to transform')
        parser.add_argument('--layers', dest='layers', required=False,
            default='', help='A list of layer indices to transform')
        parser.add_argument('--post-mapping', dest='post_mapping', required=False,
            default='', help='A list of point matches to construct a moving '
            'least squares transformation from. This is used to transform points '
            '*after* they have been transformed with the XML. For instance '
            '--post-mapping "(10,10)=(20,40),(100,200)=(130,250)"')

    def handle(self, *args, **options):
        try:
            project = Project.objects.get(id=options['project_id'])
        except Exception as e:
            raise CommandError(e)

        global log
        log = lambda x: self.stdout.write(x)

        self.check_env(options)

        #  set JVM options
        if options.get('java_heap'):
            import jnius_config
            jnius_config.add_options(f'-Xmx{options.get("java_heap")}')
            log(f'Setting JVM heap to {options.get("java_heap")}')

        if options.get('imagej'):
            ij = imagej.init(options['imagej'])
        else:
            ij = imagej.init()
        log(f'ImageJ version: {ij.getInfo(True)}')

        # Needs to happen after imagej.init()
        Java.init()
        MPICBG.init()

        editor_username = options['user']
        if editor_username:
            editor = User.objects.get(username=editor_username)
        else:
            editor = get_system_user()
        log(f'Making edits with user {editor}')

        if options['skeleton_ids']:
            skeleton_ids = list(map(lambda x: int(x.strip()), options['skeleton_ids'].split(',')))
        else:
            skeleton_ids = None

        if options['layers']:
            layers = list(map(lambda x: int(x.strip()), options['layers'].split(',')))
        else:
            layers = None

        post_mapping = []
        if options['post_mapping']:
            for mapping in options['post_mapping'].replace(' ','').split('),('):
                point_tokens = mapping.split(')=(')
                if len(point_tokens) != 2:
                    raise CommandError(f'Need exactly two points to a point match: {point_tokens}')
                point_a = tuple(map(float, point_tokens[0].replace('(', '').replace(')', '').split(',')))
                point_b = tuple(map(float, point_tokens[1].replace('(', '').replace(')', '').split(',')))
                post_mapping.append((point_a, point_b))

            log(f'Found {len(post_mapping)} post mapping point matches')

        transformer = CoordTransformer(options['project_id'], options['xml'],
                res_x=options['res_x'], res_y=options['res_y'], res_z=options['res_z'], editor=editor,
                review_reset_distance=options['review_reset_distance'], offset_x=options['offset_x'],
                offset_y=options['offset_y'], skeleton_ids=skeleton_ids, layers=layers,
                post_mapping=post_mapping, offset_min_z=options['offset_min_z'],
                offset_max_z=options['offset_max_z'])

        self.stdout.write("Found the following layers:")
        for layer in transformer.layers:
            self.stdout.write(str(layer))

        try:
            with transaction.atomic():
                log('Starting transformation')
                transformer.transform()
                # Add log entry
                add_log_entry(editor.id, 'admin.transform_node_location', transformer.project_id)
        except Exception as e:
            traceback.print_exc()

    def check_env(self, options):
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
