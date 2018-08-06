#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# Import ontology and classification from Pavel's database. The resulting
# CATMAID onrology will be similar to what is expressed as a database scheme
# there:
#
# Experiments
#

import copy
import json
import pprint
import pymysql.cursors
import pymysql
import requests
import re, os, sys

from collections import defaultdict
from catmaid.models import (Class, ClassClass, ClassInstance,
        ClassInstanceClassInstance, Relation, Stack, ProjectStack,
        StackClassInstance, CardinalityRestriction)

requests.packages.urllib3.disable_warnings()

stage_ids = {
    "Germarium & stage 1 egg chamber": 1,
    "Stage 2-7 egg chamber": 2,
    "Stage 8 egg chamber": 3,
    "Stage 9 egg chamber": 4,
    "Stage 10 egg chamber": 5,
    "Misc": 6
}

cell_types = {
    'female germline stem cell and cytoplast': set(['germline stem cells', 'cytoplast']),
    'presumptive nurse cell and oocyte': set(['presumptive oocyte', 'presumptive nurse cells']),
    'follicle stem cell': set(['follicle stem cells']),
    'follicle cell': set(['follicle cells']),
    'posterior polar follicle cell': set(['posterior follicle cells']),
    'anterior polar follicle cell': set(['anterior follicle cells']),
    'cap cell': set(['cap cells']),
    'escort cell': set(['escort cells']),
    'interfollicular stalk cell': set(['interfollicular stalk cells']),
    'terminal filament': set(['terminal filament']),
    'border follicle cell': set(['border cells']),
    'oocyte': set(['oocyte']),
    'nurse cell': set(['nurse cells']),
    'centripetally migrating follicle cell': set(['centripetally migrating follicle cells']),
    'follicle cell overlaying oocyte': set(['follicle cells overlaying the oocyte']),
}

cell_type_localizations = {
    'anterior restriction': set(['anterior restriction']),
    'posterior restriction': set(['posterior restriction']),
    'cytoplasmic foci': set(['cytoplasmic foci']),
    'cortical enrichment': set(['cortical enrichment']),
    'nuclear foci': {'oocyte': set(['oocyte nucleus']),
                      'nurse cells': set(['nurse cells nuclear foci']),
                      'follicle cells': set(['nuclear foci'])},
    'perinuclear': {'nurce cells': set(['nurse cells perinuclear']),
                    'follicle cells': set(['perinuclear'])},
    'apical restriction': set(['apical restriction']),
    'basal restriction': set(['basal restriction']),
}


image_properties = ("flag_as_primary", "magnification", "ap", "dv",
    "orientation", "headedness", "image_processing_flags")

class Restriction(object):
    def __init__(self, name, cardinality_type, value):
        self.name = name
        self.cardinality_type = cardinality_type
        self.value = value

target_ontology = {
    'Presence': {
        Restriction('is_a', 0, 1): [
            'not expressed',
            'expressed'
        ],
        'part_of': {
            'Distribution': {
                Restriction('is_a', 4, 1): [
                    'uniform localization',
                    'subcellular localization pattern'
                ],
                'part_of': {
                    'Stage': {
                        Restriction('is_a', 4, 1): [
                            "Germarium & stage 1 egg chamber",
                            "Stage 2-7 egg chamber",
                            "Stage 8 egg chamber",
                            "Stage 9 egg chamber",
                            "Stage 10 egg chamber",
                            "Misc"
                        ],
                        'part_of': {
                            'Cell type': {
                                Restriction('is_a', 4, 1): cell_types.keys(),
                                'part_of': {
                                    'Localization': {
                                        Restriction('is_a', 4, 1): cell_type_localizations.keys()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}


def log(msg, indent=0):
    print("  " * indent + msg)

class ExperimentStack(object):
    def __init__(self, title, image_base, res, dim):
        pass

class Experiment(object):
    def __init__(self, stacks=[]):
        self.stacks = stacks

stack_types = {
    'Channel 1': 'channel0',
    'Channel 2': 'channel1',
    'Composite': 'composite'
}

class CatmaidExperimentProvider(object):

    def __init__(self):
        self.project_stack_info = self.get_project_mapping_file()

    def get_project_mapping_rest():
        dot_projects = requests.get('http://bds.mpi-cbg.de/catmaid/projects',
            verify=False).json()
        project_stack_info = {}
        for n, p in enumerate(dot_projects):
            p_title = p['title']
            properties = {}
            project_stack_info[p_title] = properties
            # This has changed in recent version (luckily):
            stacks = dot_projects[0]['action'][0]['action']
            stack_ids = stacks.keys()
            if not stack_ids:
                log('Did not find any stack ids for project %s (%s)' % (p, p_title))
                continue
            for sid in stack_ids:
                stack = stacks[sid]
                stack_type = stack_types.get(stack['title'], None)
                if not stack_type:
                    log('Couldn\'t find stack type for stack % in project %s (%)' %
                        (sid, p, p_title))
                    continue
                url = 'https://bds.mpi-cbg.de/catmaid/{0}/stack/{1}/info'.format(
                        p['pid'], sid)
                log("Requesting {0}/{1}: {2}".format(n+1, len(dot_projects), url))
                stack_info = requests.get(url, verify=False).json()
                image_base = stack_info.get('image_base', None)
                if not (image_base):
                    continue
                properties[stack_type] = stack_info
                log("{}: {}".format(stack_type, image_base), 1)

        return project_stack_info

class JsonExperimentProvider(object):

    def __init__(self, path):
        # Request project mapping from
        # https://bds.mpi-cbg.de/catmaid/projects
        log("Requesting montage information")
        self.dot_projects = self.get_project_mapping_file(path)
        log("Done preparing montage information")

    def get_project_mapping_file(self, path):
        """Reads JSON file that is generated with:

        echo "copy (select row_to_json(t) from (
                select p.id as pid, p.title as ptitle, s.*
                from project p
                join taggit_taggeditem t on p.id=t.object_id
                join taggit_tag tt on t.tag_id=tt.id
                join project_stack ps on p.id=ps.project_id
                join stack s on s.id=ps.stack_id
                where t.content_type_id=44
        ) t) to stdout;" | sudo -u postgres psql -d bds_catmaid > dot_project_stacks.json
        """
        with open(path) as f:
            json_data = json.load(f)

        project_stack_info = defaultdict(list)
        for row in json_data:
            project_stack_info[row['ptitle']].append(row)

        return project_stack_info

class ArrangementExperimentProvider(object):

    def __init__(self, base_path):
        self.base_path = base_path

    def get_dimensions(self, plate, pos):
        arrangement_file = None
        try:
            arrangement_path = os.path.join(self.base_path,
                                           "{}_{}".format(plate, pos),
                                           "arrangement.txt")
            arrangement_file = open(arrangement_path, 'r')
            arrangement = arrangement_file.read()
        except IOError as e:
            return None
        finally:
            if arrangement_file:
                arrangement_file.close()

        # Find last tile
        tiles = re.findall("^(\d+),(\d+),(\d+),(\d+),(\d+),(\d+[.][\d+]),"
            "(\d+[.][\d+]),([^,]+)(.*)]", arrangement, re.M)
        if not tiles:
            raise ValueError("Couldn't find tiles to read dimension "
            " information for plate {} pos {}".format(plate, pos))
        last_tile =tiles[-1]

        # Add the last tile's width and height to its position to get he
        # dimensions of this image stack
        width = float(last_tile[2])
        height = float(last_tile[3])
        depth = float(last_tile[4])
        x = float(last_tile[5])
        y = float(last_tile[6])

        return {'x': x + width, 'y': y + height, 'z': depth}

    def get_resolution(self, plate, pos):
        # All but the following plates were acquired with a DSD with 1px = 0.323um.
        # Plates AU11, AU12, AU13, AU14, AU17 were recorded with an Apotome
        # resulting in 1px = 0.258um. CATMAID expects resoluton to be in px/nm,
        # therefore we have to multiply by 1000. The section thickness was 3um.
        # TODO: Add micrscope type to meta data:
        # Zeiss Axioplan Imaging ApoTome
        # Zeiss Axioplan Imaging ApoTome with DSD1 unit (Andor Technology)
        section_thickness = 3000
        if plate in ('AU.11', 'AU.12', 'AU.13', 'AU.14', 'AU.17'):
            return {'x': 258.0, 'y': 258.0, 'z': section_thickness}
        else:
            return {'x': 323.0, 'y': 323.0, 'z': section_thickness}

    def get_stacks_for_experiment(self, plate, pos):
        # Dimensions are read from an arrangement.txt file
        try:
            dimension = self.get_dimensions(plate, pos)
        except ValueError as e:
            log("Error: " + e.message)
            return []
        resolution = self.get_resolution(plate, pos)

        # If no dimensions were found, no stack can be generated
        if not dimension:
            return []

        stacks = []
        for title, suffix in stack_types.iteritems():
            stacks.append({
                'title': "{}_{} ({})".format(plate, pos, title),
                'image_base':'http://bds.mpi-cbg.de/catmaid/tiles/{0}_{1}/{2}/'.format(
                    plate, pos, suffix),
                'dimension': dimension,
                'resolution': resolution,
                'num_zoom_levels': 3,
                'file_extension': 'jpg',
                'metadata': '',
                'tile_width': 512,
                'tile_height': 512,
                'tile_source_type': 9
            })
        return stacks

def mkclass(name, project, user, rel=None, obj_b=None):
    cls, _ = Class.objects.get_or_create(project=project,
            class_name=name, defaults={'user': user})
    if obj_b and rel:
        mkcc(cls, rel, obj_b, project, user)
    return cls

def mkrel(name, project, user):
    rel, _ = Relation.objects.get_or_create(project=project,
            relation_name=name, defaults={'user': user})
    return rel

def mkrestr(link, cardinality_type, value, project, user):
    restr, _ = CardinalityRestriction.objects.get_or_create(project=project,
            restricted_link=link, cardinality_type=cardinality_type,
            value=value, defaults={'user': user})
    return restr

def mkcc(c1, rel, c2, project, user):
    link, _ = ClassClass.objects.get_or_create(project=project,
            class_a=c1, relation=rel, class_b=c2,
            defaults={'user': user})
    return link

def mkci(name, cls, project, user, rel=None, class_instance_b=None, save=True):
    ci = ClassInstance(user=user, project=project, class_column=cls, name=name)
    if save:
        ci.save()
    if rel and class_instance_b:
        mkcici(ci, rel, class_instance_b, project, user, save)
    return ci


def mkcici(ci1, rel, ci2, project, user, save=True):
    cici = ClassInstanceClassInstance(user=user,
            project=project, class_instance_a=ci1,
            relation=rel, class_instance_b=ci2)
    if save:
        cici.save()
    return cici


class Context(object):
    def __init__(self, proejct, user):
        self.p = project
        self.u = user

def import_from_mysql(cursor, project, user, experiment_provider):
    # Read all experiments and create a class for each column. Create also a
    # class named "experiment" and "experiment property". Each of the column
    # based classes will be linked to "experiment property" with an "is_a"
    # relation. The "experiment_property" class in turn is linked to the
    # experiment class with a "property_of" relation.
    p, u = project, user

    property_of_rel = mkrel("property_of", p, u)
    is_a_rel = mkrel("is_a", p, u)
    linked_to = mkrel("linked_to", p, u)
    has_channel_rel = mkrel("has_channel", p, u)
    part_of_rel = mkrel("part_of", p, u)
    classified_by = mkrel("classified_by", p, u)

    classification_project_class = mkclass("classification_project", p, u)
    classification_root_class = mkclass("classification_root", p, u)
    dot_classification_class = mkclass("DOT classification", p, u)
    gene_class = mkclass("Gene", p, u)
    experiment_class = mkclass("In situ experiment", p, u)
    stage_property_class = mkclass("Stage property", p, u)
    classification_class = mkclass("Ovary classification", p, u)
    exp_properties_class = mkclass("Experiment properties", p, u)
    exp_property_class = mkclass("Experiment property", p, u)
    image_data_class = mkclass("Image data", p, u)
    stack_group_class = mkclass("stackgroup", p, u)

    # For now, the only root remains DOT classification
    mkcc(dot_classification_class, is_a_rel, classification_root_class, p, u)

    mkcc(gene_class, part_of_rel, dot_classification_class, p, u)
    mkcc(experiment_class, part_of_rel, gene_class, p, u)

    mkcc(exp_properties_class, part_of_rel, experiment_class, p, u)
    mkcc(exp_property_class, part_of_rel, exp_properties_class, p, u)
    mkcc(classification_class, part_of_rel, experiment_class, p, u)
    mkcc(image_data_class, part_of_rel, experiment_class, p, u)
    mkcc(stack_group_class, part_of_rel, image_data_class, p, u)

    # Get or create property class for each property along with property class
    # 'is_a'-link to the property class.
    prop_class_map = {}
    exp_properties = ("cgname", "flybase_name", "plate", "pos",
            "qc_with_images_minus", "final_word", "est_id", "date", "tf_small",
            "flybase_id", "final_call", "qc_with_images_plus",
            "qc_without_images_plus", "qc_without_images_minus", "amy_review",
            "affy_id", "pavel_review", "primary_annotation",
            "searchable_backup", "display", "searchable", "nr_of_images",
            "cluster_id", "gene_id", "access", "species", "fly_strain", "probe",
            "probe_source", "transgene", "transgenic_line_id", "assay",
            "sequence_type", "tissue", "category", "384_plate")
    for ep in exp_properties:
        prop_class = mkclass(ep, project, user)
        identity_link = mkcc(prop_class, is_a_rel, exp_property_class, p, u)
        prop_class_map[ep] = prop_class

    # These properties can be set on stages
    stage_prop_class_map = {}
    stage_properties = ("intensity", "comment")
    for ep in stage_properties:
        prop_class = mkclass(ep, p, u)
        identity_link = mkcc(prop_class, is_a_rel, stage_property_class, p, u)
        stage_prop_class_map[ep] = prop_class

    # Get or create classes for stages

    # Build DOT ontology
    ontology = Ontology(target_ontology, cursor, p, u,
            classification_class, part_of_rel)
    pprint.pprint(ontology.ontology, width=1)

    # Classification roots are created for experiments, experiment
    # classifications and stages. First model this on the ontology level:
    # TODO: Use another class to identify entry points
    mkcc(classification_class, is_a_rel, classification_root_class, p, u)
    #for stage_class, _ in stage_classes:
    #    mkcc(stage_class, is_a_rel, classification_root_class, p, u)

    # Our classification root
    dot_classification = mkci("DOT classification", dot_classification_class, p, u)
    classification_project = mkci("classification_project",
            classification_project_class, p, u)
    mkcici(classification_project, classified_by, dot_classification, p, u)

    # Read projects from DB
    effective_exp_fields = exp_properties + ("id",)
    sql = "SELECT {0} FROM main".format(", ".join(effective_exp_fields))
    cursor.execute(sql)
    # For each original result, create one new experiment instance with linked
    # exp_properties.
    experiments_with_images = []
    existing_experiments = cursor.fetchall()
    log("Found {} experiments (unfiltered)".format(len(existing_experiments)))
    skipped = []
    genes = {}
    for nexp, row in enumerate(existing_experiments):

        main_id = row['id']

        # Name should be like:
        # AU.10 2 - FBgn0025582 - Int6 (CG9677)
        gene_name = row['cgname']
        group_title = "{0} {1} - {2} - {3} ({4})".format(row['plate'],
                row['pos'], row['flybase_id'], row['flybase_name'],
                gene_name)

        # Stack information could also be just generated, all properties are
        # known in advance and the URL can be generated.
        #stacks = dot_projects.get(group_title, None)
        stacks = experiment_provider.get_stacks_for_experiment(row['plate'], row['pos'])
        if not stacks:
            skipped.append(group_title)
            #log("Skipping group '{}', no stack information found".format(group_title))
            continue

        enable_filter = False
        max_projects = 10
        whitelist = ("CG1416", "CG2674", "CG11147")
        if enable_filter and len(experiments_with_images) > max_projects \
                and gene_name not in whitelist:
            skipped.append(group_title)
            #log("Skipping group '{}', no stack information found".format(group_title))
            continue

        log("Experiment '{}' (main id: {}) - {}/{} - {}".format(group_title,
            main_id, nexp + 1, len(existing_experiments),
            len(experiments_with_images)))

        gene_label = gene_name if gene_name else ("Unknown gene: " + group_title)
        if gene_label in genes:
            gene = genes[gene_label]
        else:
            gene = mkci(gene_label, gene_class, p, u)
            mkcici(gene, part_of_rel, dot_classification, p, u)
            genes[gene_label] = gene

        experiment = mkci(group_title, experiment_class, p, u)
        mkcici(experiment, part_of_rel, gene, p, u)
        image_data = mkci("Image data", image_data_class, p, u)
        mkcici(image_data, part_of_rel, experiment, p, u)
        experiment_properties = mkci("Experiment properties", exp_properties_class, p, u)
        mkcici(experiment_properties, part_of_rel, experiment, p, u)
        ovary_classification = mkci("Ovary classification for " + str(gene_name),
                classification_class, p, u)
        mkcici(ovary_classification, part_of_rel, experiment, p, u)

        experiments_with_images.append(experiment)
        # Create property instances
        prop_instance_map = {}
        prop_link_map = {}
        for ep in exp_properties:
            name = row[ep]
            prop_class = prop_class_map[ep]
            # If this property is NULL, don't create a new instance
            if name:
                prop_instance = mkci(name, prop_class, p, u)
                prop_link = mkcici(prop_instance, part_of_rel, experiment_properties, p, u)
                prop_instance_map[ep] = prop_instance
                prop_link_map[ep] = prop_link
        log("Properties: " + ", ".join(
            ["%s: %s" % (k,v.name) for k,v in prop_instance_map.items()]), 1)

        # Next create stage instances and link them to experiments. Then link
        # classification trees to them.
        link_stage_properties = False
        if link_stage_properties:
            stage_instaces = []
            stage_images = {}
            for stage, key in stage_classes:
                si = ClassInstance.objects.create(project=project,
                        user=user, class_column=stage,
                        name="%s: %s" % (name, stage.class_name))
                stage_instaces.append(si)
                # Assign properties, if set
                stage_original_id = stage_names[stage.class_name]
                sql = "SELECT " + (",".join(stage_properties)) + ",id FROM annot " + \
                    "WHERE main_id=%s AND stage=%s"
                cursor.execute(sql, (main_id, stage_original_id))
                stage_db_props = cursor.fetchone()
                added_stage_properties = {}
                # The stage ID is the first after all fields in stage_properties
                stage_id = stage_db_props['id']
                for n, sp in enumerate(stage_properties):
                    stage_prop = stage_db_props[sp]
                    if stage_prop:
                        pc = stage_prop_class_map[sp]
                        spc = mkci(stage_prop, pc, p, u)
                        sl = mkcici(spc, property_of_rel, si, p, u)
                        added_stage_properties[sp] = spc
                log("Stage properties (" + stage.class_name + "): " + ",".join(
                    ["%s: %s" % (k,v.name) for k,v in added_stage_properties.items()]), 1)

                # Add ROIs from image table. There exists a mapping from Felix'
                # montage creation to original images and to original images
                # relative all image table entries are a cut out of the original.
                # This cut-out is rotated and magnified and cut according to the
                # crop_area table.
                # TODO: Implement
                #sql = "SELECT image_path FROM image WHERE annot_id=%s"
                #cursor.execute(sql, stage_id)
                #rois = []
                sql = """
                SELECT m.id, m.plate, m.pos, a.stage, ca.ant_x, ca.ant_y,
                       ca.post_y, ca.post_y, ca.lat_x, ca.lat_y, ca.slice_index
                FROM image i
                JOIN crop_area ca ON i.id=ca.image_id
                JOIN annot a ON i.annot_id=a.id
                JOIN main m ON a.main_id = m.id
                WHERE annot_id = s
                """

        # Create three image stack per experiment: Ch1, Ch2 and Composite. These
        # are stack references the montage of Felix. Available here:
        # http://bds.mpi-cbg.de/catmaid/data/dot/AU.10_2/AU.10_2-ch1/
        # Properties are requested from the CATMAID instance running there
        new_stacks = []

        if stacks:
            for stack in stacks:
                image_base = stack['image_base']
                res=(stack['resolution']['x'], stack['resolution']['y'], stack['resolution']['z'])
                dim=(stack['dimension']['x'], stack['dimension']['y'], stack['dimension']['z'])
                tile_width=stack['tile_width']
                tile_height=stack['tile_height']
                image_base=stack['image_base']
                stack = Stack.objects.create(title=stack['title'], resolution=res,
                        image_base=image_base, dimension=dim,
                        num_zoom_levels=stack['num_zoom_levels'],
                        file_extension=stack['file_extension'], tile_width=tile_width,
                        tile_height=tile_height, tile_source_type=stack['tile_source_type'])
                new_stacks.append(stack)
                # Link stack into project space
                project_stack = ProjectStack.objects.create(project=project, stack=stack)

            log("Stack image bases: " + ", ".join([s.image_base for s in new_stacks]), 1)

            # stack group should have a name like this:
            # AU.10 2 - FBgn0025582 - Int6 (CG9677)
            stack_group = mkci("Image data for " + group_title, stack_group_class, p, u)

            # Link stack group into experiment
            experiment_stack = mkcici(stack_group, part_of_rel, image_data, project, user)

            for stack in new_stacks:
                link = StackClassInstance.objects.create(user=user, project=project,
                        relation=has_channel_rel, stack=stack, class_instance=stack_group)
        else:
            log("No stack info found", 1)

        if link_stage_properties:
            log("Stages: " + ",".join(s.name for s in stage_instaces), 1)

        # Create classification --- create and link new elements into
        # the "ovary classification" class instance. Iterate through each stage
        # for this experiment (stage table and main table linked through annot
        # table). For each stage get all annotations used from annot_term table
        # and find them in ontology.
        annotations = AnnotationTree(ontology, main_id, p, u,
                ovary_classification, part_of_rel, cursor)

    log("Found {} experiments with stack info".format(len(experiments_with_images)))
    #raise ValueError("Not finished")

class Ontology(object):

    def __init__(self, schema, cursor, project, user, root, root_rel):
        self.ontology = self.load(schema, project, user, root, root_rel)

    def get_class(self, path, instance):
        node = None
        w = self.ontology
        for p in path:
            new_node = w.get(p)
            if new_node:
                node = new_node
                children = node.get('children')
                if children:
                    w = children
            else:
                raise ValueError("Class path component not found: " + str(path))

        cls = node.get('values').get(instance).get('class') if node else None
        print("Ontology", cls, cls.id)
        return cls

    def load(self, schema, project, user, parent=None, parent_rel=None):
        result = {}

        # Iterate class names to relations
        for k, v in schema.iteritems():
            c = mkclass(k, project, user)
            cc = None
            if parent and parent_rel:
                cc = mkcc(c, parent_rel, parent, project, user)

            node = {
                'class': c,
                'parent': parent,
                'parent_rel': parent_rel
            }
            result[k] = node

            # Iterate relations
            if not v:
                continue
            for r, p in v.iteritems():
                if type(r) == Restriction:
                    rel = mkrel(r.name, project, user)
                    if cc:
                        res = mkrestr(cc, r.cardinality_type, r.value, project, user)
                else:
                    rel = mkrel(r, project, user)
                p_type = type(p)
                if p_type == list:
                    children = {}
                    for child in p:
                        children[child] = None
                    p = children
                    node['values'] = self.load(p, project, user, c, rel)
                elif p_type != dict:
                    raise ValueError("Unsupported child type: " + p_type)
                else:
                    node['children'] = self.load(p, project, user, c, rel)

        return result

class AnnotationTree(object):
    def __init__(self, ontology, main_id, project, user, root, part_of, cursor):
        self.ontology = ontology
        self.main_id = main_id

        # Presence:
        #   values: not expressed, expressed
        #   children:
        #     Distribution:
        #       values: unoform loc..., subcellular ...
        #       children:
        #         Stage:
        #           values: Germarium ..., Stage 2-7, ...
        #           children:
        #             Cell type:
        #               values: ...
        #               children:
        #                 Localization:
        #                   values: ...
        #                   children: []

        class Node:
            def __init__(self, path, instance):
                self.path = path
                self.instance = instance
                self.cls = ontology.get_class(path, instance)
                self.class_instance = mkci(instance, self.cls, project, user)
                self.children = []
                print("Node", self.class_instance)

        classification = {}

        def linkNewNode(dd):
            pass

        def addNode(path, instance):
            #node = Node(path)
            target = classification
            for supercls, cls in path:
                entry = target.get(supecls)
                if not entry:
                    entry = {
                        'value': cls,
                        'children': {}
                    }
                    target[p] = entry
                target = entry

        # Get all annotations for this experiment
        sql = """
            SELECT main.id, term.id, term.go_term, stage.name
              FROM main, annot, annot_term, term, stage
             WHERE main.id = annot.main_id
               AND annot.id = annot_term.annot_id
               AND annot_term.term_id = term.id
               AND annot.stage = stage.id
               AND main.id = %s
        """
        cursor.execute(sql, (main_id,))
        annotations = cursor.fetchall()

        stage_names = {
           'stage1': "Germarium & stage 1 egg chamber",
           'stage2-7': "Stage 2-7 egg chamber",
           'stage8': "Stage 8 egg chamber",
           'stage9': "Stage 9 egg chamber",
           'stage10': "Stage 10 egg chamber",
        }

        # Learn about presence
        # If: stage1 > "no signal at all stages"
        # Then: DOT > [Presence > Not expressed]
        # Else: DOT > [Presence > Expressed]
        cursor.execute(sql + " AND stage.name=%s AND term.go_term=%s",
                (main_id, "stage1", "no signal at all stages"))
        presence = 'not expressed' if (1 == len(cursor.fetchall())) else 'expressed'
        ci_presence = mkci(presence, ontology.get_class(["Presence"], presence),
                project, user, part_of, root)

        # Learn about distribution
        # If: stage1 > "ubiquitous signal at all stages"
        # Then: DOT > [Distribution > uniform localization]
        # Else: DOT > [Distribution > subcellular localization pattern]
        cursor.execute(sql + " AND stage.name=%s AND term.go_term=%s",
                (main_id, "stage1", "ubiquitous signal at all stages"))
        distribution = 'uniform localization' if (1 == len(cursor.fetchall())) \
            else 'subcellular localization pattern'
        ci_distribution = mkci(distribution,
                ontology.get_class(["Presence", "Distribution"], distribution),
                project, user, part_of, ci_presence)

        stage_term_sql = """
            SELECT s.name as stage, t1.go_term as term1, t1.id as term1_id,
                   a.id as annot_id, tt.rel_type as rel, t2.go_term as term2,
                   t2.id as term2_id
              FROM main m, term t1, annot_term at, annot a, stage s,
                   term_2_term tt LEFT JOIN term t2 ON tt.term1_id=t2.id
             WHERE a.id=at.annot_id
               AND at.term_id=t1.id
               AND a.main_id=m.id
               AND tt.term2_id=t1.id
               AND s.id=a.stage
               AND m.id=%s
               AND s.name=%s
        """

        #stage_term_sql = """
        #    SELECT DISTINCT est_id, plate, go_term, stage.name, t1.id
        #      FROM main, stage, annot a1, annot_term at1, term t1
        #     WHERE at1.annot_id = a1.id
        #       AND at1.term_id=t1.id
        #       AND stage.id = a1.stage
        #       AND main.id = %s
        #       AND stage.name = %s
        #"""

        # Look at all possible stages
        for stage, stage_name in stage_names.iteritems():
            log("Checking classification stage: {} ({})".format(stage, stage_name), 2)
            cursor.execute(stage_term_sql, (main_id, stage))
            stage_term_records = cursor.fetchall()
            pprint.pprint(stage_term_records, width=1)

            # Ignore stage, if there are no annotations for it
            if 0 == len(stage_term_records):
                log("Fund no linked terms for stage: " + stage, 3)
                continue


            # Get all right hand terms for this tage
            stage_term_map = defaultdict(set)
            for t in stage_term_records:
                stage_term_map[t['term1']].add(t['term2'])
            inv_stage_term_map = defaultdict(set)
            for t in stage_term_records:
                stage_term_map[t['term2']].add(t['term1'])
            stage_lh_terms = set(stage_term_map.keys())
            stage_rh_terms = set(inv_stage_term_map.keys())
            stage_terms = stage_lh_terms.union(stage_rh_terms)
            log("Left hand terms (used): " + ', '.join(stage_lh_terms), 2)
            log("Right hand terms (ignored): " + ', '.join(stage_rh_terms), 2)
            test_set = stage_lh_terms

            #stage_cell_type_terms = {}
            #for t in stage_term_records:
            #    stage = stage_cell_type_terms[t['stage']]
            #    stage[t[''
            ci_stage = None
            created_cell_types = []
            for ct, ct_constraints in cell_types.iteritems():
                # Find cell types that match our current stage term set, one is
                # enough to match.
                matched_terms = test_set.intersection(ct_constraints)
                if len(matched_terms) > 0:
                    if not ci_stage:
                        ci_stage = mkci(stage_name,
                            ontology.get_class(["Presence", "Distribution", "Stage"],
                                stage_name), project, user, part_of, ci_distribution)

                    log("Create cell type: " + ct, 3)
                    cls = ontology.get_class(["Presence", "Distribution", "Stage", "Cell type"], ct)
                    ci_celltype = mkci(ct, cls, project, user, part_of, ci_stage )
                    created_cell_types.append(ci_celltype)

                    # TODO: Test only stage terms of current cell type. This is done
                    # by checking all matched terms for their relations in the DV.
                    #
                    # This is maybe not possible with relations only. This would
                    # break if a partner isn't actually linked.
                    for ctl, constraints in cell_type_localizations.iteritems():
                        if type(constraints) == dict:
                            working_set = set()
                            for m in matched_terms:
                                if m in constraints:
                                    working_set = working_set.union(constraints.get(m))
                            if not working_set:
                                continue
                            constraints = working_set
                        if not constraints:
                            log('Ignoring Cell Type Localization, due to missing constraints for CTL "{}" and term "{}"'.format(ctl, term), 4)
                            continue

                        # Constraints ar OR combined
                        valid_localization = False
                        for constraint in constraints:
                            partners = stage_term_map.get(constraint)
                            # Test if constraint is connected to matched classes
                            if partners and matched_terms.intersection(partners):
                                valid_localization = True
                                break

                        if valid_localization:
                            ctl_cls = ontology.get_class(["Presence", "Distribution", "Stage",
                                "Cell type", "Localization"], ctl)
                            ci_loc =  mkci(ctl, ctl_cls, project, user,
                                    part_of, ci_celltype)
                            log("Created location: " + ctl, 4)

            log("Created cell types: " + ", ".join(
                [c.name for c in created_cell_types]), 2)

#        for annotation in annotations:
#            stage = annotation['name']
#            term_id = annotation['term.id']
#            term = annotation['go_term']
#            print(stage, term_id, term)
#
#            # If: stage1 > "ubiquitous signal at all stages"
#            # Then: DOT > [Distribution > uniform localization]
#            # Else: DOT > [Distribution > subcellular localization pattern]
#            if stage == "stage1" and term == "ubiquitous signal at all stages":
#                addNode([['Distribution', 'uniform localization']])
#                log("Distribution > uniform localization", 1)
#                continue
#
#            # Make sure a stage instance is created for each stage
#            if stage in stage_ids:
#                stage_name = stage_names[stage]
#                addNode([['Distribution', stage_name]])
#
#                if False:
#                    addNode([['Distribution', stage_name], []])
#                    children = classification['Distribution']['children']
#                    cell_type = distr_children['Cell Type']
#
#        self.classification = classification

    def instantiate(self, parent, parent_rel, project, user):

        def traverse(elements, path, ci_parent, ci_parent_rel):
            # Each element maps a name to a dictionary, e.g.
            # Distribution: { 'class': <class>, 'children': [<dict>, <dict>] }
            for ci_name, props in elements.iteritems():
                # Traverse to children to see if they were created
                path.append(ci_name)

                path.append(props['class'])
                # Path will be something like ["Presence", "
                cls = self.ontology.get_class(path)
                print(path, ci_parent_rel, ci_parent, ci_name, props, cls)
                if not cls:
                    raise ValueError("Couldn't find path in ontology: " + str(path))
                # Concrete class isn't needed anymore on stack
                path.pop()

                # Create top level class es (e.g. Concrete distribution)
                ci = mkci(props['class'], cls, project, user)
                mkcici(ci, ci_parent_rel, ci_parent, project, user)

                # Traverse children, if any
                children = props.get('children')
                if children:
                    log("Found children: " + str(children), 1)
                    traverse(children, path, ci, ci_parent_rel)

                path.pop()

        traverse(self.classification, [], parent, parent_rel)

    def set(self, stage, term):
        pass

def main(options, project, user):
    # Connect to the database
    connection = pymysql.connect(options['host'],
                                 options['user'],
                                 options['password'],
                                 options['db'],
                                 charset='utf8mb4',
                                 cursorclass=pymysql.cursors.DictCursor)
    experiment_provider = ArrangementExperimentProvider(options['arrangements'])

    try:
        import_from_mysql(connection.cursor(), project, user,
                experiment_provider)
    finally:
        connection.close()

def run(project=None, user=None):
    options = {
        'host': 'localhost',
        'user': 'test',
        'password': 'test',
        'db': 'pavel',
        'arrangements': '/home/tom/dev/catmaid-onto/arrangement',
    }
    main(options, project, user)

if __name__ == "__main__":
    run()
