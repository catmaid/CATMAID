import logging

from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union
from io import StringIO
from celery import shared_task
from celery.utils.log import get_task_logger
import time
import csv
import traceback

from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render

from formtools.wizard.views import SessionWizardView

from catmaid.apps import get_system_user
from catmaid.control.exporter import Exporter, ConnectorMode
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
                            Connector, ImportTask, Project, Relation, Review,
                            Stack, Treenode, Volume)

SOURCE_TYPE_CHOICES = [
    ('file', 'Local file'),
    ('project', 'CATMAID project'),
]

IMPORT_TEMPLATES = {
    "sourcetypeselection": "catmaid/import/annotations/setup_source.html",
    "projectimport": "catmaid/import/annotations/setup.html",
    "fileimport": "catmaid/import/annotations/setup.html",
    "transform": "catmaid/import/annotations/transform.html",
    "confirmation": "catmaid/import/annotations/confirmation.html",
    "done": "catmaid/import/annotations/done.html",
}

TRANSFORM_TYPE_CHOICES = [
    ('csv-z-slices', 'A CSV file with a X and Y transformation column'),
]


class SourceTypeForm(forms.Form):
    """ A form to select basic properties on the data to be
    imported.
    """
    target_project = forms.ModelChoiceField(required=True,
        help_text="The project the data will be imported into.",
        queryset=Project.objects.all().exclude(pk=settings.ONTOLOGY_DUMMY_PROJECT_ID))
    source_type = forms.ChoiceField(choices=SOURCE_TYPE_CHOICES,
            widget=forms.RadioSelect(), help_text="The source type defines "
            "where the data to import comes from")
    import_treenodes = forms.BooleanField(initial=True, required=False,
            help_text="Should treenodes be imported?")
    import_connectors = forms.BooleanField(initial=True, required=False,
            help_text="Should connectors be imported?")
    import_annotations = forms.BooleanField(initial=True, required=False,
            help_text="Should neuron annotations be imported?")
    import_tags = forms.BooleanField(initial=True, required=False,
            help_text="Should neuron node tags be imported?")
    import_volumes = forms.BooleanField(initial=True, required=False,
            help_text="Should volumes/meshes be imported?")
    import_reviews = forms.BooleanField(initial=True, required=False,
            help_text="Should reviews be imported?")


class FileBasedImportForm(forms.Form):
    pass


class TransformImportForm(forms.Form):
    apply_transform = forms.BooleanField(initial=False, required=False,
            help_text="Should the transformation below be applied to call coordinates?")
    reference_stack = forms.ModelChoiceField(required=True,
        help_text="The project the data will be imported into.",
        queryset=Stack.objects.all())
    transform_in_project_space = forms.BooleanField(initial=False, required=False,
            help_text="Are transformation vectors provided in physical space?")
    x_factor = forms.FloatField(initial=1.0, required=False, help_text="A factor that is multiplied to each X shift")
    y_factor = forms.FloatField(initial=1.0, required=False, help_text="A factor that is multiplied to each Y shift")
    z_factor = forms.FloatField(initial=1.0, required=False, help_text="A factor that is multiplied to each Z shift")
    x_offset = forms.FloatField(initial=0.0, required=False, help_text="A offset that is added to each X shift")
    y_offset = forms.FloatField(initial=0.0, required=False, help_text="A offset that is added to each Y shift")
    z_offset = forms.FloatField(initial=0.0, required=False, help_text="A offset that is added to each Z shift")
    z_lookup_offset = forms.IntegerField(initial=0, required=False, help_text="An offset that is added to each Z look-up index. Slices before won't be transformed.")
    delimiter = forms.CharField(initial=',', required=False, help_text="The delimiter used in the transform CSV")
    transform_type = forms.ChoiceField(choices=TRANSFORM_TYPE_CHOICES, required=True, help_text="The type of tranformaton")
    transform_text = forms.CharField(widget=forms.Textarea, label='Transform',
                                     required=False, help_text="The transform is "
                                     "expected to be in a CSV format with two columns, "
                                     "represenging the X/Y shift of each node.")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # TODO: filter only linked stacks
        # source_project_ids self.get_cleaned_data_for_step('projectselection')['projects']
        #         selected_projects = [ self.projects[p] for p in selected_paths ]
        # self.fields['reference_stack'].queryset = self.fields['reference_stack'].queryset.filter(
        #         projectstack__project_id__in=source_project_ids)


class ProjectBasedImportForm(forms.Form):
    """ Display a list of available projects."""
    source_projects = forms.ModelMultipleChoiceField(required=False,
        widget=forms.CheckboxSelectMultiple(attrs={'class': 'autoselectable'}),
        help_text="Only data from selected projects will be imported.",
        queryset=Project.objects.all().exclude(pk=settings.ONTOLOGY_DUMMY_PROJECT_ID))

    # TODO: check administer or super user permissions for validation


class ConfirmationForm(forms.Form):
    """ Displays a summary of the data to be imported.
    """
    transfer_stats = forms.BooleanField(initial=False, required=False,
            help_text="If the length and number of nodes of the cloned skeltons "
            "didn't change, transferring stats can speed aup the cloning process "
            "significantly.")


def get_source_type(wizard) -> str:
    """ Test whether the project import form should be shown."""
    cleaned_data = wizard.get_cleaned_data_for_step('sourcetypeselection') \
        or {'source_type': SOURCE_TYPE_CHOICES[0]}
    return cleaned_data['source_type']


@shared_task()
def async_project_copy_job(import_task_id) -> str:

        from catmaid.control.importer import GenericImporter
        task_logger = get_task_logger(__name__)

        task_logger.info(f'Starting work on import task {import_task_id}')

        # An async task will run the management commands catmaid_export_data
        # catmaid import_data. Transformations happen as part of the import.
        import_task = ImportTask.objects.get(id=import_task_id)
        scd = import_task.metadata
        start_time = time.perf_counter()

        import_task.status = ImportTask.StatusOptions.Started
        import_task.save()

        # Get a copy of the log output to store with the task.
        log_stream = StringIO()
        log_handler = logging.StreamHandler(log_stream)
        task_logger.addHandler(log_handler)

        try:
            if scd["source_type"] == 'project':

                target_project = Project.objects.get(id=scd['target_project_id'])
                projects = Project.objects.filter(id__in=scd['source_project_ids'])
                final_project_materialization_update = len(projects) > 1
                connector_mode = ConnectorMode.IntraConnectorsAndPlaceholders \
                        if scd['import_connectors'] else ConnectorMode.NoConnectors
                for n, p in enumerate(projects):
                    # Update materializations in last iteration
                    update_materializations = n == (len(projects) - 1)
                    #update_materializations = False

                    export_options = {
                        'run_noninteractive': True,
                        'export_treenodes': scd['import_treenodes'],
                        'connector_mode': connector_mode,
                        'export_annotations': scd['import_annotations'],
                        'export_tags': scd['import_tags'],
                        'allowed_tags': None,
                        'export_users': True,
                        'export_volumes': scd['import_volumes'],
                        'export_public_deep_links': False, # FIXME
                        'export_exportable_deep_links': False, # FIXME,
                        'export_reviews': scd['import_reviews'],
                        'required_annotations': [],
                        'excluded_annotations': [],
                        'volume_annotations': None,
                        'annotation_annotations': None,
                        'settings_meta_annotation': None,
                        'exclusion_is_final': False,
                    }

                    # Export project data
                    task_logger.info(f'Exporting data from project {p}')
                    exporter = Exporter(p, export_options,
                                        custom_logger=task_logger)
                    project_data = exporter.export()
                    precomputed_stats = exporter.get_precomputed_stats() \
                            if scd['transfer_stats'] else dict()

                    import_options = {
                        'create_unknown_users': False,
                        'auto_name_unknown_users': True,
                        'preserve_ids': False,
                        'map_users': True,
                        'map_user_ids': True,
                        'analyze_db': True,
                        'update_project_materializations': update_materializations,
                        'stdout': log_stream,
                        'username_mapping': {},
                        'precomputed_stats': precomputed_stats,
                        'update_edition_time': False,
                    }

                    if scd['apply_transform']:
                        import_options['transform'] = scd['transform']
                        import_options['reference_stack_id'] = scd['reference_stack_id']
                        import_options['transform_in_project_space'] = scd['transform_in_project_space']
                        import_options['transform_z_lookup_offset'] = scd['transform_z_lookup_offset']

                    # Import project data into new project
                    task_logger.info(f'Importing into project {target_project}')
                    override_user = None
                    importer = GenericImporter(project_data, target_project,
                                        override_user, import_options,
                                        custom_logger=task_logger)
                    with transaction.atomic():
                        importer.import_data()

                import_task.status = ImportTask.StatusOptions.Success
                task_logger.info(f'Finished import in {import_task.import_time} seconds')
                import_task.import_log = log_stream.getvalue()
            else:
                raise ValueError(f'Unsupported source type: {scd["source_type"]}')
        except Exception as err:
            task_logger.removeHandler(log_handler)
            import_task.import_log = f"{log_stream.getvalue()}\n{err}\n{traceback.format_exc()}"
            import_task.status = ImportTask.StatusOptions.Error

        import_task.import_time = time.perf_counter() - start_time
        import_task.save()


class ImportingWizard(SessionWizardView):
    """ With the help of the importing wizard it is possible to import neurons
    and their annotations as well as the linked skeletons and their treenodes
    and tags into an existing CATMAID project. The source for this data can
    either be a file or another project. Users can only be carried over if the
    source is another project in the target instance. Otherwise, the importing
    user gets ownership on all model objects.
    """
    form_list = [
        ("sourcetypeselection", SourceTypeForm),
        ("projectimport", ProjectBasedImportForm),
        ("fileimport", FileBasedImportForm),
        ("transform", TransformImportForm),
        ("confirmation", ConfirmationForm),
    ]

    # Either file or project import form will be shown
    condition_dict = {
        'fileimport': lambda w: get_source_type(w) == 'file',
        'projectimport': lambda w: get_source_type(w) == 'project',
    }

    def get_context_data(self, form, **kwargs):
        """ On the confirmation step, this will read in the data to import and
        collect some statistics on it.
        """
        context = super().get_context_data(form=form, **kwargs)
        if self.steps.current == 'sourcetypeselection':
            import_tasks = ImportTask.objects.filter(user=self.request.user).order_by('-edition_time')
            context.update({
                'running_import_tasks': import_tasks[:5],
            })
        elif self.steps.current == 'confirmation':
            stats = []
            # Load all wanted information from the selected projects
            scd = self.get_cleaned_data_for_step('sourcetypeselection')
            if scd["source_type"] == 'project':
                source_projects = self.get_cleaned_data_for_step('projectimport')['source_projects']
                for p in source_projects:
                    ps = {
                        'source': "%s (%s)" % (p.title, p.id),
                        'ntreenodes': 0,
                        'nconnectors': 0,
                        'nannotations': 0,
                        'nannotationlinks': 0,
                        'ntags': 0,
                        'ntaglinks': 0,
                        'nvolumes': 0,
                    }
                    if scd['import_treenodes']:
                        ps['ntreenodes'] = Treenode.objects.filter(project=p).count()
                    if scd['import_connectors']:
                        ps['nconnectors'] = Connector.objects.filter(project=p).count()
                    if scd['import_annotations']:
                        try:
                            annotation = Class.objects.get(project=p,
                                    class_name="annotation")
                            ps['nannotations'] = ClassInstance.objects.filter(
                                    project=p, class_column=annotation).count()
                        except Class.DoesNotExist:
                            pass
                        try:
                            annotated_with = Relation.objects.get(project=p,
                                    relation_name="annotated_with")
                            ps['nannotationlinks'] = ClassInstanceClassInstance.objects.filter(
                                    project=p, relation=annotated_with).count()
                        except Relation.DoesNotExist:
                            pass
                    if scd['import_tags']:
                        try:
                            tag = Class.objects.get(project=p, class_name="label")
                            ps['ntags'] = ClassInstance.objects.filter(
                                    project=p, class_column=annotation).count()
                        except Class.DoesNotExist:
                            pass
                        try:
                            labeled_as = Relation.objects.get(project=p, relation_name="labeled_as")
                            ps['ntaglinks'] = ClassInstanceClassInstance.objects.filter(
                                    project=p, relation=labeled_as).count()
                        except Relation.DoesNotExist:
                            pass
                    if scd['import_volumes']:
                        ps['nvolumes'] = Volume.objects.filter(project=p).count()

                    stats.append(ps)

            # Update context
            context.update({
                'source_type': scd["source_type"],
                'stats': stats,
            })

        return context

    def get_template_names(self) -> List[str]:
        return [IMPORT_TEMPLATES[self.steps.current]]

    def done(self, form_list, **kwargs) -> HttpResponse:
        """ All previously configured sources will now be used to import data.
        """
        # Load all wanted information from the selected projects
        scd = self.get_cleaned_data_for_step('sourcetypeselection')

        # Check transformation
        confirmation_data = self.get_cleaned_data_for_step('confirmation')
        transfer_stats = confirmation_data['transfer_stats']
        transform_data = self.get_cleaned_data_for_step('transform')
        apply_transform = transform_data['apply_transform']
        reference_stack = transform_data['reference_stack']
        x_factor = transform_data['x_factor']
        y_factor = transform_data['y_factor']
        z_factor = transform_data['z_factor']
        x_offset = transform_data['x_offset']
        y_offset = transform_data['y_offset']
        z_offset = transform_data['z_offset']
        z_lookup_offset = transform_data['z_lookup_offset']
        delimiter = transform_data['delimiter']
        transform_data_type = transform_data['transform_type']
        transform_text = transform_data['transform_text'].replace('\r\n', '\n').replace('\r', '\n')
        transform = []

        if apply_transform:
            if transform_data_type == 'csv-z-slices':
                with StringIO(transform_text) as transform_stream:
                    reader = csv.reader(transform_stream, delimiter=delimiter)
                    transform = list(map(lambda xy: [x_factor * float(xy[0]) + x_offset,
                                                     y_factor * float(xy[1]) + y_offset,
                                                     z_offset],
                                        reader))
            else:
                raise ValidationError(f"Unknown transform data type: {transform_data_type}")

        target_project = scd['target_project']

        import_task = ImportTask.objects.create(
                project_id=target_project.id,
                user=self.request.user,
                description="Import task",
                metadata={
                    'source_type': 'project',
                    'source_project_ids': list(map(lambda p: p.id,
                        self.get_cleaned_data_for_step('projectimport')['source_projects'])),
                    'target_project_id': target_project.id,
                    'import_treenodes': scd['import_treenodes'],
                    'import_connectors': scd['import_connectors'],
                    'import_annotations': scd['import_annotations'],
                    'import_tags': scd['import_tags'],
                    'import_volumes': scd['import_volumes'],
                    'import_reviews': scd['import_reviews'],
                    'apply_transform': apply_transform,
                    'transform': transform,
                    'reference_stack_id': reference_stack.id,
                    'transfer_stats': transfer_stats,
                    'transform_in_project_space': transform_data['transform_in_project_space'],
                    'transform_z_lookup_offset': transform_data['z_lookup_offset'],
                })

        # Make sure the created import task is available
        transaction.on_commit(lambda: async_project_copy_job.delay(import_task.id))

        return render(self.request, IMPORT_TEMPLATES['done'])


class ExportingWizard(SessionWizardView):
    """ The export wizard makes it possible to export neurons and their
    annotations as well as the linked skeletons and their treenodes into a JSON
    representation.
    """
    pass


def copy_annotations(source_pid, target_pid, import_treenodes=True,
        import_connectors=True, import_connectortreenodes=True,
        import_annotations=True, import_tags=True, import_volumes=True) -> None:
    """ Copy annotation data (treenodes, connectors, annotations, tags) to
    another (existing) project. The newly created entities will have new IDs
    and are independent from the old ones.

    import_treenodes: if true, all treenodes from the source will be imported
    import_connectors: if ture, all connectors from the source will be imported
    import_connectortreenodes: if true, all connectors and treenodes that are
                               linked are imported, along with the links themself
    import_volumes: if true, all volumes in the source will be copied to the
                    target project.
    """
    # Use raw SQL to duplicate the rows, because there is no
    # need to transfer the data to Django and back to Postgres
    # again.
    cursor = connection.cursor()

    imported_treenodes:List = []

    if import_treenodes:
        # Copy treenodes from source to target
        cursor.execute('''
            WITH get_data (
                SELECT 5, location_x, location_y, location_z,
                    editor_id, user_id, creation_time, edition_time,
                    skeleton_id, radius, confidence, parent_id
                FROM treenode tn
                WHERE tn.project_id=3
                RETURNING *),
                copy AS (
                INSERT
                INTO treenode (project_id, location_x,
                    location_y, location_z, editor_id, user_id,
                    creation_time, edition_time, skeleton_id,
                    radius, confidence, parent_id)
                SELECT 5, location_x, location_y, location_z,
                    editor_id, user_id, creation_time, edition_time,
                    skeleton_id, radius, confidence, parent_id
                FROM get_data
                RETURNING *, get_data.id),

            SELECT id FROM copy
            ''', (target_pid, source_pid))

    if import_connectors:
        # Copy connectors from source to target
        cursor.execute('''
            INSERT INTO connector (project_id, location_x,
                location_y, location_z, editor_id, user_id,
                creation_time, edition_time,  confidence)
            SELECT %s, location_x, location_y, location_z,
                editor_id, user_id, creation_time, edition_time,
                confidence
            FROM connector cn
            WHERE cn.project_id=%s
            AND cn.proj
            ''', (target_pid, source_pid))

    if import_connectortreenodes:
        # If not all treenodes have been inserted
        cursor.execute('''
            INSERT INTO treenode (project_id, location_x,
                location_y, location_z, editor_id, user_id,
                creation_time, edition_time, skeleton_id,
                radius, confidence, parent_id)
            SELECT %s, location_x, location_y, location_z,
                editor_id, user_id, creation_time, edition_time,
                skeleton_id, radius, confidence, parent_id
            FROM treenode tn
            WHERE tn.project_id=%s
            ''', (target_pid, source_pid))

        # Link connectors to treenodes
        cursor.execute('''
            INSERT INTO connector_treenode ()
            SELECT
            FROM connector_treenode ct
            WHERE ct.project_id=%s
            ''' % (source_pid)) # FIXME this statement is not functional

    if import_annotations:
        try:
            # Make sure the target has the 'annotation' class and the
            # 'annotated_with' relation.
            annotation_src = Class.objects.get(
                    project_id=source_pid, class_name="annotation")
            annotated_with_src = Relation.objects.get(
                    project_id=source_pid, relation_name="annotated_with")
            annotation_tgt = Class.objects.get_or_create(
                    project_id=target_pid, class_name="annotation", defaults={
                        "user": annotation_src.user,
                        "creation_time": annotation_src.creation_time,
                        "edition_time": annotation_src.edition_time,
                        "description": annotation_src.description,
                    })[0]
            annotated_with_tgt = Relation.objects.get_or_create(
                    project_id=target_pid, relation_name="annotated_with", defaults={
                        "user": annotation_src.user,
                        "creation_time": annotated_with_src.creation_time,
                        "edition_time": annotated_with_src.edition_time,
                        "description": annotated_with_src.description,
                        "isreciprocal": annotated_with_src.isreciprocal,
                        "uri": annotated_with_src.uri,
                    })[0]

            # Get all source annotations and import them into target
            annotations_src = ClassInstance.objects.filter(
                    project_id=source_pid, class_column=annotation_src)
            existing_target_annotations = [a.name for a in ClassInstance.objects.filter(
                    project_id=target_pid, class_column=annotation_tgt)]
            annotations_tgt = []
            for a in annotations_src:
                # Ignore if there is already a target annotation like this
                if a.name in existing_target_annotations:
                    continue
                annotations_tgt.append(ClassInstance(
                        project_id=source_pid,
                        class_column=annotation_src,
                        name=a.name,
                        user=a.user,
                        creation_time=a.creation_time,
                        edition_time=a.edition_time))
            ClassInstance.objects.bulk_create(annotations_tgt)

            # Import annotation links
            cursor.execute('''
                INSERT INTO class_instance_class_instance (user_id,
                    creation_time, edition_time, project_id, relation_id,
                    class_instance_a, class_instance_b)
                SELECT %s
                    editor_id, user_id, creation_time, edition_time,
                FROM class_instance_class_instance cici
                JOIN class_instance ci_s ON ci_s.id=cici.class_instance_b
                WHERE cici.project_id=%s AND relation_id=%s
                ''')
        except (Class.DoesNotExist, Class.RelationDoesNotExist):
            # No annotations need to be imported if no source annotations are
            # found
            pass

    if import_tags:
        # TreenodeClassInstance
        # ConnectorClassInstance
        pass

    if import_volumes:
        # Copy connectors from source to target
        cursor.execute('''
            INSERT INTO catmaid_volume (project_id, user_id, creation_time,
                edition_time, editor_id, name, comment, geometry)
            SELECT %(target_pid)s, user_id, creation_time, now(),
                edition_time, editor_id, name, comment, geometry
            FROM catmaid_volume v
            WHERE v.project_id=%(source_pid)s
        ''', {
            'target_pid': target_pid,
            'source_pid': source_pid,
        })
