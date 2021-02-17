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

try:
    import scyjava_config
    scyjava_config.add_options('-Xmx14g')
except ValueError as e:
    print(e)

import imagej

User = get_user_model()

class Java():

    String = None
    Array = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        Java.String = autoclass('java.lang.String')

class MPICBG():

    CoordinateTransformList = None

    @classmethod
    def init(cls):
        from jnius import autoclass
        MPICBG.CoordinateTransformList = autoclass('mpicbg.models.CoordinateTransformList')


def _log(msg):
    print(msg)
log = _log


class TrakEM2Layer(object):

    def __init__(self, xml_data, res_x, res_z):
        self.z_start = float(xml_data.attrib['z']) * res_z
        self.z_end = self.z_start + res_z

        patches = xml_data.findall('t2_patch')
        if not patches:
            raise ValueError("No patch found for layer with z={}".format(self.z_start))
        if len(patches) > 1:
            raise ValueError("Currently only one patch per layer is supported")
        self.patch = patches[0]
        self.title = self.patch.attrib['title']
        self.file_path = self.patch.attrib['file_path']


        # The text representation of a matrix is expected to look like this:
        # matrix(a, b, c, d, e, f), which represents the matrix columns [a,b],
        # [c,d] and [e,f]
        transform_text = self.patch.attrib['transform']
        self.affine_transform = [float(n) for n in
                          transform_text.lstrip('matrix(').rstrip(')').split(',')]

        # Read ICT transformations
        ict_transform_lists = self.patch.findall('ict_transform_list')
        if ict_transform_lists and len(ict_transform_lists) > 1:
            raise ValueError('Can handle only one <ict_transform_list> entry')
        ict_transform_list = ict_transform_lists[0] if ict_transform_lists else None

        if ict_transform_list:
            from jnius import autoclass
            self.transform_list = MPICBG.CoordinateTransformList()
            for xform in ict_transform_list:
                if xform.tag not in ('iict_transform', 'ict_transform'):
                    raise ValueError(f'Unsupported transformation type: {xform.tag}')
                Transform = autoclass(xform.attrib['class'])
                t = Transform()
                t.init(xform.attrib['data'])
                self.transform_list.add(t)
        else:
            self.transform_list = None

    def __str__(self):
        xform = 'CoordTransformList' or self.affine_transform
        return f"Z: [{self.z_start}, {self.z_end}) Title: {self.title} Transform list: {xform}"

    def transform_point_entry(self, loc_entry):
        """The passed in location entry is assumed to be an at least 3-element
        tuple or list, where the first three elements are the X, Y and Z
        coordinate to be transformed.
        """
        if self.transform_list:
            new_loc = self.transform_list.apply((loc_entry[0], loc_entry[1]))
        else:
            new_loc = [
                loc_entry[0] * self.affine_transform[0] + loc_entry[1] * self.affine_transform[2] + self.affine_transform[4],
                loc_entry[0] * self.affine_transform[1] + loc_entry[1] * self.affine_transform[3] + self.affine_transform[5]
            ]

        dist = math.sqrt((new_loc[0] - loc_entry[0]) ** 2 + (new_loc[1] - loc_entry[1]) ** 2)

        loc_entry[0] = new_loc[0]
        loc_entry[1] = new_loc[1]

        return dist


class CoordTransformer(object):

    def __init__(self, project_id, target_xml, res_x, res_z, editor=None,
            review_reset_distance=None):
        self.project_id = project_id
        self.xml = target_xml
        self.res_x = res_x
        self.res_z = res_z
        self.last_editor = editor or get_system_user()
        self.review_reset_distance = review_reset_distance

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
        for layer_data in target_data_layerset.findall('t2_layer'):
            layer = TrakEM2Layer(layer_data, res_x, res_z)
            self.layers.append(layer)

        # Sort layers by Z
        sorted(self.layers, key=lambda x: x.z_start)

    def transform(self):
        """Iterate over all layers, find all location entries in the database
        on this layer, transform with the layer's transformation and write them
        back.
        """
        start_time = time.time()
        cursor = connection.cursor()
        n_total_reviews_reset = 0
        for n, l in enumerate(self.layers):
            log(f'Transforming layer {n+1}/{len(self.layers)}: [{l.z_start}, {l.z_end})')
            cursor.execute("""
                SELECT location_x, location_y, %(last_editor_id)s, id
                FROM location
                WHERE project_id = %(project_id)s
                AND location_z >= %(z_start)s
                AND location_z < %(z_end)s
            """, {
                'project_id': self.project_id,
                'z_start': l.z_start,
                'z_end': l.z_end,
                'last_editor_id': self.last_editor.id,
            })

            # Get lists rather than tuples and transform points
            reset_reviews_for = []
            locations = list(map(list, cursor.fetchall()))
            for loc in locations:
                dist = l.transform_point_entry(loc)
                if self.review_reset_distance and dist > self.review_reset_distance:
                    reset_reviews_for.append(loc[3])

            log(f'  Found and transformed {len(locations)} locations, considering {len(reset_reviews_for)} locations for review reset')

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
            SELECT refresh_skeleton_summary_table_for_project(%(project_id)s);
         """, {
            'project_id': self.project_id,
        })

        end_time = time.time()
        log(f'Transformation complete (took {end_time - start_time:.2f} sec), reset {n_total_reviews_reset} reviews')


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
                help='the project to update tracing data in')
        parser.add_argument('--imagej', dest='imagej', required=False,
            help='An ImageJ specification like a path to Fiji.app or a version'),
        parser.add_argument('--pyjnius', dest='pyjnius', required=False,
            help='Set the PYJNIUS_JAR environment variable.'),
        parser.add_argument('--java-home', dest='java_home', required=False,
            help='Set the JAVA_HOME environment variable.'),
        parser.add_argument('--res-x', dest='res_x', required=True, type=float,
            help='The X resolution in nm of the TrakEM2 project')
        parser.add_argument('--res-z', dest='res_z', required=True, type=float,
            help='The Z resolution in nm of the TrakEM2 project')
        parser.add_argument('--user', dest='user', required=False,
            help='The username of the user who is used to make the changes. By default first superuser available.')
        parser.add_argument('--review-reset-distance',
                dest='review_reset_distance', required=False, type=float, default=None,
                help='If set, any treenode reviews will be reset if the new location is farther away than X nm.')

    def handle(self, *args, **options):
        try:
            project = Project.objects.get(id=options['project_id'])
        except Exception as e:
            raise CommandError(e)

        global log
        log = lambda x: self.stdout.write(x)
        if options.get('imagej'):
            ij = imagej.init(options['imagej'])
        else:
            ij = imagej.init()
        log(f'ImageJ version: {ij.getInfo(True)}')

        # Needs to happen after imagej.init()
        Java.init()
        MPICBG.init()

        self.check_env(options)

        editor_username = options['user']
        if editor_username:
            editor = User.objects.get(username=editor_username)
        else:
            editor = get_system_user()
        log(f'Making edits with user {editor}')

        transformer = CoordTransformer(options['project_id'], options['xml'],
                res_x=options['res_x'], res_z=options['res_z'], editor=editor,
                review_reset_distance=options['review_reset_distance'])

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
