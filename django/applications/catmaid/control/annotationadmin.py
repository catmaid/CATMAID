# -*- coding: utf-8 -*-

from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union

from django import forms
from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render_to_response

from formtools.wizard.views import SessionWizardView

from catmaid.models import Class, ClassInstance, ClassInstanceClassInstance
from catmaid.models import Connector, Project, Relation, Treenode

SOURCE_TYPE_CHOICES = [
    ('file', 'Local file'),
    ('project', 'CATMAID project'),
]

IMPORT_TEMPLATES = {
    "sourcetypeselection": "catmaid/import/annotations/setup_source.html",
    "projectimport": "catmaid/import/annotations/setup.html",
    "fileimport": "catmaid/import/annotations/setup.html",
    "confirmation": "catmaid/import/annotations/confirmation.html",
    "done": "catmaid/import/annotations/done.html",
}


class SourceTypeForm(forms.Form):
    """ A form to select basic properties on the data to be
    imported.
    """
    source_type = forms.ChoiceField(choices=SOURCE_TYPE_CHOICES,
            widget=forms.RadioSelect(), help_text="The source type defines "
            "where the data to import comes from")
    target_project = forms.ModelChoiceField(required=True,
        help_text="The project the data will be imported into.",
        queryset=Project.objects.all().exclude(pk=settings.ONTOLOGY_DUMMY_PROJECT_ID))
    import_treenodes = forms.BooleanField(initial=True, required=False,
            help_text="Should treenodes be imported?")
    import_connectors = forms.BooleanField(initial=True, required=False,
            help_text="Should connectors be imported?")
    import_annotations = forms.BooleanField(initial=True, required=False,
            help_text="Should neuron annotations be imported?")
    import_tags = forms.BooleanField(initial=True, required=False,
            help_text="Should neuron node tags be imported?")


class FileBasedImportForm(forms.Form):
    pass


class ProjectBasedImportForm(forms.Form):
    """ Display a list of available projects."""
    projects = forms.ModelMultipleChoiceField(required=False,
        widget=forms.CheckboxSelectMultiple(attrs={'class': 'autoselectable'}),
        help_text="Only data from selected projects will be imported.",
        queryset=Project.objects.all().exclude(pk=settings.ONTOLOGY_DUMMY_PROJECT_ID))

    # TODO: check administer or super user permissions for validation


class ConfirmationForm(forms.Form):
    """ Displays a summary of the data to be imported.
    """
    pass

def get_source_type(wizard) -> str:
    """ Test whether the project import form should be shown."""
    cleaned_data = wizard.get_cleaned_data_for_step('sourcetypeselection') \
        or {'source_type': SOURCE_TYPE_CHOICES[0]}
    return cleaned_data['source_type']

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
        context = super(ImportingWizard, self).get_context_data(form=form, **kwargs)
        if self.steps.current == 'confirmation':
            stats = []
            # Load all wanted information from the selected projects
            scd = self.get_cleaned_data_for_step('sourcetypeselection')
            if scd["source_type"] == 'project':
                projects = self.get_cleaned_data_for_step('projectimport')['projects']
                for p in projects:
                    ps = {
                        'source': "%s (%s)" % (p.title, p.id),
                        'ntreenodes': 0,
                        'nconnectors': 0,
                        'nannotations': 0,
                        'nannotationlinks': 0,
                        'ntags': 0,
                    }
                    if scd['import_treenodes']:
                        ps['ntreenodes'] = Treenode.objects.filter(project=p).count()
                    if scd['import_connectors']:
                        ps['nconnectors'] = Connector.objects.filter(project=p).count()
                    if scd['import_annotations']:
                        annotation = Class.objects.filter(project=p,
                                class_name="annotation")
                        annotated_with = Relation.objects.filter(project=p,
                                relation_name="annotated_with")
                        ps['nannotations'] = ClassInstance.objects.filter(
                                project=p, class_column=annotation).count()
                        ps['nannotationlinks'] = ClassInstanceClassInstance.objects.filter(
                                project=p, relation=annotated_with).count()
                    if scd['import_tags']:
                        pass

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
        target_project = scd['target_project']

        if scd["source_type"] == 'project':
            projects = self.get_cleaned_data_for_step('projectimport')['projects']
            for p in projects:
                copy_annotations(p.id, target_project.id,
                        scd['import_treenodes'], scd['import_connectors'],
                        scd['import_annotations'], scd['import_tags'])

        return render_to_response(IMPORT_TEMPLATES['done'])


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

    imported_treenodes = [] # type: List

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
            ''' % (target_pid, source_pid)) # FIXME "Not all arguments converted during string formatting"

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
