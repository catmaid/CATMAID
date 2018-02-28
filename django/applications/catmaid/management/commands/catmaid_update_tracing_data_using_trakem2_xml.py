# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import xml.etree.ElementTree

from django.core.management.base import BaseCommand, CommandError
from django.utils.encoding import python_2_unicode_compatible
from django.db import connection
from catmaid.models import Project


@python_2_unicode_compatible
class TrakEM2Layer(object):

    def __init__(self, xml_data):
        self.z = float(xml_data.attrib['z'])
        patches = xml_data.findall('t2_patch')
        if not patches:
            raise ValueError("No patch found for layer with z={}".format(self.z))
        if len(patches) > 1:
            raise ValueError("Currently only one patch per layer is supported")
        self.patch = patches[0]
        self.title = self.patch.attrib['title']
        self.file_path = self.patch.attrib['file_path']

        # The text representation of a matrix is expected to look like this:
        # matrix(a, b, c, d, e, f), which represents the matrix columns [a,b],
        # [c,d] and [e,f]
        transform_text = self.patch.attrib['transform']
        self.transform = [float(n) for n in
                          transform_text.lstrip('matrix(').rstrip(')').split(',')]

    def __str__(self):
        return "Z: {} Title: {} Transform: {}".format(self.z, self.title,
                                                      self.transform)

class Transformer(object):

    def __init__(self, project_id, z_step, target_xml, source_xml=None, z_offset=0):
        self.project_id = project_id
        self.z_step = float(z_step)
        self.source_xml = source_xml
        self.target_xml = target_xml

        # Parse target XML file to find transformation for each section.
        target_data = xml.etree.ElementTree.parse(self.target_xml)
        if not target_data:
            raise ValueError("Could not parse target XML")
        target_data_root = target_data.getroot()
        if target_data_root.tag != 'trakem2':
            raise ValueError("This doesn't look like a TrakEM2 XML file, could not find trakem2 root")

        # Get first available layer set
        self.layers = []
        target_data_layerset = target_data_root.find('t2_layer_set')
        for layer_data in target_data_layerset.findall('t2_layer'):
            layer = TrakEM2Layer(layer_data)
            self.layers.append(layer)

        # Sort layers by Z
        sorted(self.layers, key=lambda x: x.z)

    def build_transformations(self):
        """Create SQL code that will update all location data based on the
        parsed XML layer data. An UPDATE statement is generated for every
        section, transforming all nodes in this section according to the
        transformation.
        """
        update_queries = []

        for l in self.layers:
            update_queries.append("""
                UPDATE location l
                SET l.location_x = l.location_x * %(a)s + l.location_y * %(c)s + %(e)s,
                    l.location_y = l.location_x * %(b)s + l.location_y * %(d)s + %(f)s
                WHERE l.location_z >= %(z)s
                AND l.location_z < %(z2)s
                AND l.project_id = %(project_id)s;
            """.format(**{
                'project_id': self.project_id,
                'z': l.z,
                'z2': l.z + self.z_step,
                'a': l.transform[0],
                'b': l.transform[1],
                'c': l.transform[2],
                'd': l.transform[3],
                'e': l.transform[4],
                'f': l.transform[5],
            })


        update_queries.append("""
            --- Recreate summary table
            SELECT update_skeleton_summaries();
        """)

        return "\n".join(update_queries)

class Command(BaseCommand):
    help = "This script will create SQL commands to transform existing tracing data " \
            "into a new space. This transformation is built from one or two TrakEM2 " \
            "XML files."

    def add_arguments(self, parser):
        parser.add_argument('--target-xml', dest='target_xml', required=True,
                help='target space TrakEM2 XML file')
        parser.add_argument('--output', dest='output', required=True,
                help='target file for SQL output')
        parser.add_argument('--project-id', dest='project_id', required=True,
                help='the project to update tracing data in')
        parser.add_argument('--z-step', dest='z_step', required=True,
                help='resolution in Z, defines sections')
        parser.add_argument('--z-offset', dest='z_offset', required=False,
                help='optional offset for sections in Z', default=0)

    def handle(self, *args, **options):
        transformer = Transformer(options['project_id'], options['z_step'],
                options['target_xml'], options['z_offset'])

        try:
            project = Project.objects.get(id=options['project_id'])
        except Exception as e:
            raise CommandError(e)

        self.stdout.write("Found the following layers:")
        for layer in transformer.layers:
            self.stdout.write(str(layer))

        sql = transformer.build_transformations()
        if sql:
            fh = open(args.output, 'w')
            fh.write(sql)
            fh.close()
        else:
            self.stdout.write("No transformation SQL could be generated")
