# -*- coding: utf-8 -*-

from collections import OrderedDict, defaultdict
import glob
import json
import os.path
import requests
from typing import Any, List, DefaultDict, Dict, Tuple
import urllib
import yaml


from django import forms
from django.db import connection
from django.db.models import Count
from django.conf import settings
from django.contrib.auth.models import User, Group, Permission
from django.contrib.admin.widgets import FilteredSelectMultiple
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render_to_response
from django.utils.translation import ugettext as _

from formtools.wizard.views import SessionWizardView

from guardian.models import Permission
from guardian.shortcuts import get_perms_for_model, assign_perm

from catmaid.models import (BrokenSlice, Class, Relation, ClassClass,
        ClassInstance, Project, ClassInstanceClassInstance, Stack, StackGroup,
        StackStackGroup, ProjectStack, StackClassInstance, StackGroupClassInstance, StackGroupRelation,
        StackMirror, TILE_SOURCE_TYPES)
from catmaid.fields import Double3D
from catmaid.control.common import urljoin, is_valid_host
from catmaid.control.classification import get_classification_links_qs, \
        link_existing_classification, ClassInstanceClassInstanceProxy

TEMPLATES = {"pathsettings": "catmaid/import/setup_path.html",
             "projectselection": "catmaid/import/setup_projects.html",
             "classification": "catmaid/import/setup_classification.html",
             "confirmation": "catmaid/import/confirmation.html"}

info_file_name = "project.yaml"
datafolder_setting = "CATMAID_IMPORT_PATH"
base_url_setting = "IMPORTER_DEFAULT_IMAGE_BASE"

class UserProxy(User):
    """ A proxy class for the user model as we want to be able to call
    get_name() on a user object and let it return the user name.
    """
    class Meta:
        proxy = True

    def get_name(self):
        return self.username

class GroupProxy(Group):
    """ A proxy class for the group model as we want to be able to call
    get_name() on a group object and let it return the group name.
    """
    class Meta:
        proxy = True

    def get_name(self):
        return self.name


class PreStackGroup():
    def __init__(self, info_object):
        self.title = info_object.get('title')
        if not self.title:
            raise ValueError("Could not find needed title for stack group")
        self.classification = info_object.get('classification', None)
        self.relation = info_object.get('relation', None)
        valid_relations = ("view", "channel")
        if self.relation and self.relation not in valid_relations:
            raise ValueError("Unsupported stack group relation: {}. Plese use "
                    "one of: {}.".format(self.relation, ", ".join(valid_relations)))


class PreMirror(object):
    def __init__(self, data, project_url=None):
        # Use tile size information if available
        if 'tile_width' in data:
            self.tile_width = data['tile_width']
        if 'tile_height' in data:
            self.tile_height = data['tile_height']
        if 'tile_source_type' in data:
            self.tile_source_type = data['tile_source_type']

        self.file_extension = data.get('fileextension', 'jpg')
        self.position = data.get('position', 0)

        self.title = data.get('title')
        if not self.title:
            raise ValueError("Could not find stack mirror title")

        if 'url' in data:
            # Read out data
            self.image_base = data['url']
        elif project_url:
            # The image base of a stack is the combination of the
            # project URL and the stack's folder name.
            path = data.get('path', '')
            folder = data.get('folder', '')
            if folder:
                path = urljoin(path, folder)
            self.image_base = urljoin(project_url, path)

        # Require some form of image base
        if not self.image_base:
            raise ValueError("Could not find valid image base for stack mirror")

        # Make sure the image base has a trailing slash, because this is expected
        if self.image_base[-1] != '/':
            self.image_base = self.image_base + '/'

        # Test if the data is accessible through HTTP
        self.accessible = check_http_accessibility(self.image_base,
                self.file_extension, auth=None)

class PreStack(object):
    def __init__(self, info_object, project_url, data_folder, already_known=False):
        # Make sure everything is there
        required_fields = ['title', 'dimension', 'resolution']
        for f in required_fields:
            if f not in info_object:
                raise RuntimeError("Missing required stack field '%s'" % f)
        # Read out data
        self.title = info_object['title']
        # The 'dimension', 'resolution' and 'metadata' fields should
        # have every stack.
        self.dimension = info_object['dimension']
        self.resolution = info_object['resolution']
        self.metadata = info_object['metadata'] if 'metadata' in info_object else ""

        self.downsample_factors = info_object.get('downsample_factors')

        self.comment = info_object.get('comment')
        self.attribution = info_object.get('attribution')
        self.description = info_object.get('description', '')
        self.canary_location = info_object.get('canary_location')
        self.placeholder_color = info_object.get('placeholder_color')
        self.broken_slices = info_object.get('broken_sections')

        # Mirrors are kept in a separate data structure
        self.mirrors = [PreMirror(md, project_url) for md in info_object.get('mirrors', [])]

        # Stacks can optionally contain a "translation" field, which can be used
        # to add an offset when the stack is linked to a project
        self.project_translation = info_object.get('translation', "(0,0,0)")
        self.orientation = info_object.get('orientation', 0)
        # Make sure this dimension can be matched
        if not Double3D.tuple_pattern.match(self.project_translation):
            raise ValueError("Couldn't read translation value")
        # Collect stack group information
        self.stackgroups = [] # type: List
        if 'stackgroups' in info_object:
            for stackgroup in info_object['stackgroups']:
                self.stackgroups.append(PreStackGroup(stackgroup))
        # Collect classification information, if available
        if 'classification' in info_object:
          self.classification = info_object['classification']
        else:
          self.classification = None

        # Don't be considered known by default
        self.already_known = already_known

    def equals(self, stack) -> bool:
        """Two PreStack objects are equal if their title matches and they have
        equal sets of image bases of their PreMirror instances.
        """
        other_mirrors = stack.stackmirror_set.all()
        if len(self.mirrors) == len(other_mirrors):
            sm = set([m.image_base for m in self.mirrors])
            om = set([m.image_base for m in other_mirrors])
            if sm.difference(om):
                return False
        return self.title == stack.title

class PreProject:
    def __init__(self, properties, project_url, data_folder, already_known_pid=None):
        info = properties

        # Make sure everything is there
        if 'project' not in info:
            raise RuntimeError("Missing required container field 'project'")
        # Read out data
        p = info['project']

        # Make sure everything is there
        if 'title' not in p:
            raise RuntimeError("Missing required project field 'title'")
        # Read out data
        self.title = p['title']

        self.stacks = [] # type: List
        self.has_been_imported = False
        for s in p.get('stacks', []):
            self.stacks.append(PreStack(s, project_url, data_folder))

        # Don't be considered known by default
        self.already_known = already_known_pid != None
        self.already_known_pid = already_known_pid
        self.action = None

        # Collect classification information, if available
        self.ontology = p.get('ontology', [])
        self.classification = p.get('classification', [])

        # Collect stack group information, if available
        self.stackgroups = [] # type: List
        for sg in p.get('stackgroups', []):
            self.stackgroups.append(PreStackGroup(sg))

    def set_known_pid(self, pid) -> None:
        self.already_known = pid != None
        self.already_known_pid = pid

    def imports_stack(self, stack) -> bool:
        for s in self.stacks:
            if s.equals(stack):
                return True
        return False

    def merge_with(self, other) -> None:
        """Copy properties from other project
        """
        if self.has_been_imported:
            raise ValueError("Can only merge into not yet imported pre projects")
        if self.already_known:
            raise ValueError("Can only merge into unknown pre projects")

        if self.title != other.title:
            self.title = "{}, {}".format(self.title, other.title)

        self.stacks.extend(other.stacks)
        self.ontology.extend(other.ontology)
        self.classification.extend(other.classification)
        self.stackgroups.extend(other.stackgroups)

def check_http_accessibility(image_base:str, file_extension:str, auth=None) -> bool:
    """ Returns true if data below this image base can be accessed through HTTP.
    """
    slice_zero_url = urljoin(image_base, "0")
    first_file_url = urljoin(slice_zero_url, "0_0_0." + file_extension)
    try:
        response = requests.get(first_file_url, auth=auth, timeout=1)
    except IOError:
        return False
    return response.status_code == 200

def find_project_folders(image_base:str, path:str, filter_term) -> Tuple[List, Dict[str, Any], List]:
    """ Finds projects in a folder structure by testing for the presence of an
    info/project YAML file.
    """
    index = []
    projects = {} # type: Dict
    not_readable = []
    for current_file in glob.glob( os.path.join(path, filter_term) ):
        if os.path.isdir(current_file):
            # Check if the folder has a info file
            info_file = os.path.join(current_file, info_file_name)
            if os.path.exists(info_file):
                short_name = current_file.replace(settings.CATMAID_IMPORT_PATH, "")
                # Check if this folder is already known by testing if
                # there is a stack with the same image base as a subfolder
                # would have.
                try:
                    # Make sure we have slashes in our directery URL part
                    url_dir = short_name
                    if os.sep != '/':
                        url_dir = url_dir.replace("\\", "/")
                    project_url = urljoin(image_base, url_dir)
                    # Expect a YAML file
                    yaml_data = yaml.load_all(open(info_file), Loader=yaml.FullLoader)
                    for project_yaml_data in yaml_data:
                        project = PreProject(project_yaml_data, project_url,
                                short_name)
                        key = current_file
                        new_key_index = 1
                        while key in projects:
                            new_key_index += 1
                            key = "{} #{}".format(current_file, new_key_index)
                        # Remember this project if it isn't available yet
                        projects[key] = project
                        index.append((key, short_name))
                except Exception as e:
                    not_readable.append( (info_file, e) )
    return (index, projects, not_readable)


def get_projects_from_raw_data(data, filter_term, base_url=None) -> Tuple[List, Dict, List]: # FIXME: filter_term is unused
    index = []
    projects = {}
    not_readable = [] # type: List

    for p in data:
        project = PreProject(p, base_url, None)
        short_name = project.title
        key = "{}-{}".format('File', short_name)
        projects[key] = project
        index.append((key, short_name))

    return (index, projects, not_readable)


def get_projects_from_url(url, filter_term, headers=None, auth=None,
        base_url=None, merge_same=True) -> Tuple[List, Dict, List]: # FIXME: filter_term is unused.
    if not url:
        raise ValueError("No URL provided")
    if auth and len(auth) != 2:
        raise ValueError("HTTP Authentication needs to be a 2-tuple")
    # Sanitize and add protocol, if not there
    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "http://" + url

    index = []
    projects = {}
    not_readable = [] # type: List

    # Ask remote server for data
    r = requests.get(url, headers=headers, auth=auth)
    content_type = r.headers['content-type']
    # Both YAML and JSON should end up in the same directories of directories
    # structure.
    if 'json' in content_type:
        content = r.json()
        for p in content:
            project = PreProject(p, base_url, None)
            short_name = project.title
            key = "{}-{}".format(url, short_name)
            projects[key] = project
            index.append((key, short_name))
    elif 'yaml' in content_type:
        content = yaml.load_all(r.content.decode('utf-8'), Loader=yaml.FullLoader)
        for p in content:
            project = PreProject(p, base_url, None)
            short_name = project.title
            key = "{}-{}".format(url, short_name)
            if merge_same and key in projects:
                # Merge newly found and existing projects
                existing_project = projects[key]
                existing_project.merge_with(project)
            else:
                projects[key] = project
                index.append((key, short_name))
    else:
        raise ValueError("Unrecognized content type in response of remote "
                "'{}\': {}, Content: {}".format( url, content_type, r.content))

    return (index, projects, not_readable)

class ProjectSelector(object):
    """Mark projects as either ignored, merged or replaced"""

    def __init__(self, projects, project_index, known_project_filter,
            known_project_strategy, cursor=None):
        self.ignored_projects = [] # type: List
        self.merged_projects = [] # type: List
        self.replacing_projects = [] # type: List
        self.new_projects = [] # type: List

        self.known_project_filter = known_project_filter
        self.known_project_strategy = known_project_strategy

        # Mark projects as known
        if projects and known_project_filter:
            # Mark known stacks, i.e. the ones having the same image base
            for key, p in projects.items():
                for s in p.stacks:
                    # Mark a project as known if an existing project shares the
                    # same title and the same mirrors.
                    known = False
                    for same_title_stack in Stack.objects.filter(title=s.title):
                        known = s.equals(same_title_stack)
                        if known:
                            break

                    s.already_known = known

            cursor = cursor or connection.cursor()
            # Mark all projects as known that have the same name as an already
            # existing project
            if 'name' in known_project_filter:
                ip_template = ",".join(("(%s,%s)",) * len(projects))
                ip_data = []
                for pi in project_index:
                    ip_data.append(pi[0])
                    ip_data.append(projects[pi[0]].title)
                cursor.execute("""
                    SELECT p.id, ip.key, ip.name
                    FROM project p
                    JOIN (VALUES {}) ip(key, name)
                        ON p.title = ip.name
                """.format(ip_template), ip_data)
                for row in cursor.fetchall():
                    known_project = row[1]
                    p = projects[known_project]
                    p.set_known_pid(row[0])

            # Mark all projects as known that have the same stacks assigned as
            # an already existing project.
            if 'stacks' in known_project_filter:
                # Get a mapping of stack ID sets to project IDs
                cursor.execute("""
                  SELECT project_id, array_agg(sm.image_base ORDER BY sm.image_base)
                  FROM project_stack ps
                  JOIN stack s ON ps.stack_id = s.id
                  JOIN stack_mirror sm ON s.id = sm.stack_id
                  GROUP BY project_id
                  ORDER BY project_id
                """)
                stack_map = defaultdict(list) # type: DefaultDict[Any, List]
                for row in cursor.fetchall():
                  stack_map[tuple(sorted(row[1]))].append(row[0])

                for key, p in projects.items():
                    if p.already_known:
                        # Name matches have precedence
                        continue
                    # Mark project known if all of its stacks are known and the
                    # title matches
                    all_stacks_known = all(s.already_known for s in p.stacks)
                    if all_stacks_known:
                        known_stack_image_bases = [] # type: List
                        for s in p.stacks:
                            known_stack_image_bases.extend(sm.image_base for sm in s.mirrors)
                        known_stack_image_bases_tuple = tuple(sorted(known_stack_image_bases))
                        known_projects = stack_map[known_stack_image_bases_tuple]
                        if known_projects:
                          # First one wins
                          p.set_known_pid(known_projects[0])

        # Check for each project if it is already known
        for key,name in project_index:
            p = projects[key]
            self.add_project(key, p)

    def add_project(self, key, project) -> None:
        project.action = self.known_project_strategy
        if not project.already_known:
            self.new_projects.append((key, project))
        elif 'add-anyway' == self.known_project_strategy:
            self.new_projects.append((key, project))
        elif 'ignore' == self.known_project_strategy:
            self.ignored_projects.append((key, project))
        elif 'merge' == self.known_project_strategy:
            self.merged_projects.append((key, project))
        elif 'merge-override' == self.known_project_strategy:
            self.merged_projects.append((key, project))
        elif 'replace' == self.known_project_strategy:
            self.replacing_projects.append((key, project))

class ImportingWizard(SessionWizardView):
    def get_template_names(self) -> List:
        return [TEMPLATES[self.steps.current]]

    def get_form(self, step=None, data=None, files=None):
        form = super(ImportingWizard, self).get_form(step, data, files)
        current_step = step or self.steps.current
        if current_step == 'pathsettings':
            # Pre-populate base URL field with settings variable, if available
            if hasattr(settings, base_url_setting):
                form.fields['base_url'].initial = getattr(settings, base_url_setting)
        elif current_step == 'projectselection':
            # Make sure there is data available. This is needed to test whether
            # the classification step should be shown with the help of the
            # show_classification_suggestions() function.
            cleaned_path_data = self.get_cleaned_data_for_step('pathsettings')
            if not cleaned_path_data:
                return form
            # Get the cleaned data from first step
            source = cleaned_path_data['import_from']
            path = cleaned_path_data['relative_path']
            remote_host = cleaned_path_data['remote_host']
            catmaid_host = cleaned_path_data['catmaid_host']
            api_key = cleaned_path_data['api_key'].strip()
            filter_term = cleaned_path_data['filter_term']
            http_auth_user = cleaned_path_data['http_auth_user'].strip()
            http_auth_pass = cleaned_path_data['http_auth_pass']
            json_spec = cleaned_path_data['json_spec']
            known_project_filter = cleaned_path_data['known_project_filter']
            known_project_strategy = cleaned_path_data['known_project_strategy']
            base_url = cleaned_path_data['base_url']

            if len(filter_term.strip()) == 0:
                filter_term = "*"

            auth = None
            if http_auth_user and http_auth_pass:
                auth = (http_auth_user, http_auth_pass)

            if source == 'remote':
                project_index, projects, not_readable = get_projects_from_url(
                        remote_host, filter_term, base_url=base_url, auth=auth)
            elif source == 'remote-catmaid':
                complete_catmaid_host = "{}{}{}".format(catmaid_host,
                    "" if catmaid_host[-1] == "/" else "/", "projects/export")
                headers = None
                if len(api_key) > 0:
                    headers = {
                        'X-Authorization': 'Token {}'.format(api_key)
                    }
                project_index, projects, not_readable = get_projects_from_url(
                        complete_catmaid_host, filter_term, headers, auth)
            elif source == 'json-spec':
                project_index, projects, not_readable = get_projects_from_raw_data(
                        json.loads(json_spec), filter_term, base_url=base_url)
            else:
                # Get all folders that match the selected criteria
                data_dir = os.path.join(settings.CATMAID_IMPORT_PATH, path)
                if data_dir[-1] != os.sep:
                    data_dir = data_dir + os.sep
                project_index, projects, not_readable = find_project_folders(
                    base_url, data_dir, filter_term)

            # Handle known projects
            project_selector = ProjectSelector(projects, project_index, known_project_filter,
                    known_project_strategy)

            # Sort the index (wrt. short name) to be better readable
            # Save these settings in the form
            form.not_readable = not_readable
            form.new_projects       = np = project_selector.new_projects
            form.ignored_projects   = ip = project_selector.ignored_projects
            form.merged_projects    = mp = project_selector.merged_projects
            form.replacing_projects = rp = project_selector.replacing_projects
            self.projects = projects
            # Update the folder list and select all by default
            displayed_projects = [(t[0], t[1].title) for t in np + mp + rp]
            displayed_projects = sorted(displayed_projects, key=lambda key: key[1])
            form.displayed_projects = displayed_projects
            form.fields['projects'].choices = displayed_projects
            form.fields['projects'].initial = [i[0] for i in displayed_projects]
            # Get the available user permissions and update the list
            user_perm_tuples = get_element_permission_tuples(UserProxy, Project)
            form.fields['user_permissions'].choices = user_perm_tuples
            # Get the available group permissions and update the list
            group_perm_tuples = get_element_permission_tuples(GroupProxy, Project)
            form.fields['group_permissions'].choices = group_perm_tuples
        elif current_step == 'classification':
            # Get tag set and all projects within it
            tags = self.get_cleaned_data_for_step('projectselection')['tags']
            tags = frozenset([t.strip() for t in tags.split(',')])
            # Get all projects that have all those tags
            projects = Project.objects.filter( tags__name__in=tags ).annotate(
                repeat_count=Count("id") ).filter( repeat_count=len(tags) )
            # Get all classification graphs linked to those projects and add
            # them to a form for being selected.
            workspace = settings.ONTOLOGY_DUMMY_PROJECT_ID
            croots = {} # type: Dict
            for p in projects:
                links_qs = get_classification_links_qs(workspace, p.id)
                linked_croots = set([cici.class_instance_b for cici in links_qs])
                # Build up dictionary with all classifications mapping to their
                # linked projects.
                for cr in linked_croots:
                    try:
                        croots[cr].append(p)
                    except KeyError:
                        croots[cr] = []
                        croots[cr].append(p)
            # Remember graphs and projects
            form.cls_tags = tags
            form.cls_graph_map = croots
            self.id_to_cls_graph = {} # type: Dict
            # Create data structure for form field and id mapping
            cgraphs = []
            for cr in croots:
                # Create form field tuples
                name = "%s (%s)" % (cr.name, cr.id)
                cgraphs.append( (cr.id, name) )
                # Create ID to classification graph mapping
                self.id_to_cls_graph[cr.id] = cr
            form.fields['classification_graph_suggestions'].choices = cgraphs
            #form.fields['classification_graph_suggestions'].initial = [cg[0] for cg in cgraphs]

        return form

    def get_context_data(self, form, **kwargs):
        context = super(ImportingWizard, self).get_context_data(form=form, **kwargs)

        if self.steps:
            if self.steps.current == 'pathsettings':
                datafolder_missing = not hasattr(settings, datafolder_setting)
                base_url_missing = not hasattr(settings, base_url_setting)
                context.update({
                    'datafolder_setting': datafolder_setting,
                    'datafolder_missing': datafolder_missing,
                    'base_url_setting': base_url_setting,
                    'base_url_missing': base_url_missing,
                })
            elif self.steps.current == 'projectselection':
                context.update({
                    'displayed_projects': getattr(form, "displayed_projects", []),
                    'new_projects': getattr(form, "new_projects", []),
                    'not_readable': getattr(form, "not_readable", []),
                    'ignored_projects': getattr(form, "ignored_projects", []),
                    'merged_projects': getattr(form, "merged_projects", []),
                    'replacing_projects': getattr(form, "replacing_projects", [])
                })
            elif self.steps.current == 'classification':
                context.update({
                    'cls_graphs': form.cls_graph_map,
                    'cls_tags': form.cls_tags,
                })
            elif self.steps.current == 'confirmation':
                # Selected projects
                selected_paths = self.get_cleaned_data_for_step('projectselection')['projects']
                selected_projects = [ self.projects[p] for p in selected_paths ]
                # Tags
                tags = self.get_cleaned_data_for_step('projectselection')['tags']
                if len(tags.strip()) == 0:
                    tags = []
                else:
                    tags = [t.strip() for t in tags.split(',')]
                # Permissions
                user_permissions = self.get_cleaned_data_for_step(
                    'projectselection')['user_permissions']
                user_permissions = get_permissions_from_selection( User, user_permissions )
                group_permissions = self.get_cleaned_data_for_step(
                    'projectselection')['group_permissions']
                group_permissions = get_permissions_from_selection( Group, group_permissions )
                # Classification graph links
                link_cls_graphs = self.get_cleaned_data_for_step(
                    'projectselection')['link_classifications']
                if link_cls_graphs:
                    # Suggested graphs
                    sugg_cls_graph_ids = self.get_cleaned_data_for_step(
                        'classification')['classification_graph_suggestions']
                    cls_graphs_to_link = set( self.id_to_cls_graph[int(cgid)] \
                        for cgid in sugg_cls_graph_ids )
                    # Manually selected graphs
                    sel_cicis = self.get_cleaned_data_for_step(
                        'classification')['additional_links']
                    sel_cls_graphs = set(cici.class_instance_b for cici in sel_cicis)
                    cls_graphs_to_link.update(sel_cls_graphs)
                    # Store combined result in context
                    context.update({
                        'cls_graphs_to_link': cls_graphs_to_link,
                    })
                # Other settings
                max_num_stacks = 0
                default_tile_width = self.get_cleaned_data_for_step('projectselection')['default_tile_width']
                default_tile_height = self.get_cleaned_data_for_step('projectselection')['default_tile_height']
                for p in selected_projects:
                    if len(p.stacks) > max_num_stacks:
                        max_num_stacks = len(p.stacks)
                context.update({
                    'link_cls_graphs': link_cls_graphs,
                    'projects': selected_projects,
                    'max_num_stacks': max_num_stacks,
                    'tags': tags,
                    'user_permissions': user_permissions,
                    'group_permissions': group_permissions,
                    'tile_width': default_tile_width,
                    'tile_height': default_tile_height,
                })

        context.update({
            'title': "Importer",
            'settings': settings
        })

        return context

    def done(self, form_list, **kwargs) -> HttpResponse:
        """ Will add the selected projects.
        """
        # Find selected projects
        selected_paths = self.get_cleaned_data_for_step('projectselection')['projects']
        selected_projects = [ self.projects[p] for p in selected_paths ]
        # Get permissions
        user_permissions = self.get_cleaned_data_for_step(
            'projectselection')['user_permissions']
        user_permissions = get_permissions_from_selection( User, user_permissions )
        group_permissions = self.get_cleaned_data_for_step(
            'projectselection')['group_permissions']
        group_permissions = get_permissions_from_selection( Group, group_permissions )
        permissions = user_permissions + group_permissions
        # Tags
        tags = self.get_cleaned_data_for_step('projectselection')['tags']
        tags = [t.strip() for t in tags.split(',')]
        # Classifications
        link_cls_graphs = self.get_cleaned_data_for_step(
            'projectselection')['link_classifications']
        cls_graph_ids = [] # type: List
        if link_cls_graphs:
            cls_graph_ids = self.get_cleaned_data_for_step(
                'classification')['classification_graph_suggestions']
        # Get remaining properties
        project_selection_data = self.get_cleaned_data_for_step('projectselection')
        remove_unref_stack_data = project_selection_data['remove_unref_stack_data']
        default_tile_width = project_selection_data['default_tile_width']
        default_tile_height = project_selection_data['default_tile_height']
        default_tile_source_type = project_selection_data['default_tile_source_type']
        imported_projects, not_imported_projects = import_projects(
            self.request.user, selected_projects, tags,
            permissions, default_tile_width, default_tile_height,
            default_tile_source_type, cls_graph_ids, remove_unref_stack_data)
        # Show final page
        return render_to_response('catmaid/import/done.html', {
            'projects': selected_projects,
            'imported_projects': imported_projects,
            'not_imported_projects': not_imported_projects,
        })

def importer_admin_view(request, *args, **kwargs):
    """ Wraps the class based ImportingWizard view in a
    function based view.
    """
    forms = [("pathsettings", DataFileForm),
             ("projectselection", ProjectSelectionForm),
             ("classification", create_classification_linking_form()),
             ("confirmation", ConfirmationForm)]
    # Create view with condition for classification step. It should only
    # be displayed if selected in the step before.
    view = ImportingWizard.as_view(forms,
        condition_dict={'classification': show_classification_suggestions})
    return view(request)

def show_classification_suggestions(wizard):
    """ This method tests whether the classification linking step should
    be shown or not.
    """
    cleaned_data = wizard.get_cleaned_data_for_step('projectselection') \
        or {'link_classifications': False}
    return cleaned_data['link_classifications']

def importer_finish(request:HttpRequest) -> HttpResponse:
    return render_to_response('catmaid/import/done.html', {})

def get_element_permission_tuples(element, cls) -> List[Tuple[str,str]]:
    """Get all available users mapped to all available project permissions.
    """
    ctype = ContentType.objects.get_for_model(cls)
    permissions = Permission.objects.filter(content_type=ctype)
    elements = sorted(element.objects.all(), key=lambda x: x.get_name())

    tuples = []
    for e in elements:
        for p in permissions:
            pg_id = str(e.id) + "_" + str(p.id)
            pg_title = e.get_name() + " | " + p.name
            tuples.append( (pg_id, pg_title) )

    return tuples

def get_permissions_from_selection(cls, selection) -> List[Tuple]:
    permission_list = [] # type: List[Tuple]
    for perm in selection:
        elem_id = perm[:perm.index('_')]
        elem = cls.objects.filter(id=elem_id)[0]
        perm_id = perm[perm.index('_')+1:]
        perm = Permission.objects.filter(id=perm_id)[0]
        permission_list.append( (elem, perm) )
    return permission_list

KNOWN_PROJECT_FILTERS = (
    ('name',    'Name matches'),
    ('stacks', 'Same stacks linked and all new stacks are known'),
)

KNOWN_PROJECT_STRATEGIES = (
    ('add-anyway',     'Add imported project anyway'),
    ('ignore',         'Ignore imported project'),
    ('merge',          'Merge with existing project, add new stacks'),
    ('merge-override', 'Merge with existing project, override stacks'),
    ('replace',        'Replace existing projects with new version')
)

class DataFileForm(forms.Form):
    """ A form to select basic properties on the data to be
    imported. Path and filter constraints can be set here.
    """
    import_from = forms.ChoiceField(
            initial=settings.IMPORTER_DEFAULT_DATA_SOURCE,
            choices=(('filesystem', 'Data directory on server'),
                     ('remote-catmaid', 'Remote CATMAID instance'),
                     ('remote', 'General remote host'),
                     ('json-spec', 'JSON representation')),
            help_text="Where new pojects and stacks will be looked for")
    relative_path = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'40', 'class': 'import-source-setting filesystem-import'}),
        help_text="Optionally, use a sub-folder of the data folder to narrow " \
                  "down the folders to look at. This path is <em>relative</em> " \
                  "to the data folder in use.")
    remote_host = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'40', 'class': 'import-source-setting remote-import'}),
        help_text="The URL to a remote host from which projects and stacks " \
                  "can be imported. To connect to another CATMAID server, add " \
                  "/projects/export to its URL.")
    catmaid_host = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'40', 'class': 'import-source-setting catmaid-host'}),
        help_text="The main URL of the remote CATMAID instance.")
    api_key = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'40', 'class': 'import-source-setting api-key'}),
        help_text="(Optional) API-Key of your user on the remote CATMAID instance.")
    http_auth_user = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'20', 'class': 'import-source-setting http-auth-user'}),
        help_text="(Optional) HTTP-Auth username for the remote server.")
    http_auth_pass = forms.CharField(required=False, widget=forms.PasswordInput(
        attrs={'size':'20', 'class': 'import-source-setting http-auth-user'}),
        help_text="(Optional) HTTP-Auth password for the remote server.")
    json_spec = forms.CharField(required=False, widget=forms.Textarea(
        attrs={'class': 'import-source-setting json-spec'}))
    filter_term = forms.CharField(initial="*", required=False,
        widget=forms.TextInput(attrs={'size':'40'}),
        help_text="Optionally, you can apply a <em>glob filter</em> to the " \
                  "projects found in your data folder.")
    known_project_filter = forms.MultipleChoiceField(choices=KNOWN_PROJECT_FILTERS,
            label='Projects are known if', initial=('name', 'stacks'),
            widget=forms.CheckboxSelectMultiple(), required=False,
            help_text='Select what makes makes a project known. An OR operation ' \
                    'will be used to combine multiple selections.')
    known_project_strategy = forms.ChoiceField(
            initial=getattr(settings, 'IMPORTER_DEFAULT_EXISTING_DATA_STRATEGY', 'merge'),
            choices=KNOWN_PROJECT_STRATEGIES,
            help_text="Decide if imported projects that are already known " \
                    "(see above) should be ignored, merged or replaced.")
    base_url = forms.CharField(required=False,
        widget=forms.TextInput(attrs={'size':'40'}),
        help_text="The <em>base URL</em> should give read access to the data \
                   folder in use.")

    def clean(self):
        form_data = self.cleaned_data

        http_auth_user = form_data['http_auth_user'].strip()
        http_auth_pass = form_data['http_auth_pass']
        auth = None
        if http_auth_user and http_auth_pass:
            auth = (http_auth_user, http_auth_pass)

        # Make sure URLs are provided for a remote import
        import_from = form_data['import_from']
        if 'remote-catmaid' == import_from:
            ok, msg = is_valid_host(form_data['catmaid_host'], auth)
            if not ok:
                raise ValidationError({'catmaid_host': [msg]})
        elif 'remote' == import_from:
            ok, msg = is_valid_host(form_data['remote_host'], auth)
            if not ok:
                raise ValidationError({'remote_host': [msg]})

        return form_data


class ProjectSelectionForm(forms.Form):
    """ A form to select projects to import out of the
    available projects.
    """
    # A checkbox for each project, checked by default
    projects = forms.MultipleChoiceField(required=False,
        widget=forms.CheckboxSelectMultiple(
            attrs={'class': 'autoselectable'}),
        help_text="Only selected projects will be imported.")
    remove_unref_stack_data = forms.BooleanField(initial=False,
        required=False, label="Remove unreferenced stacks and stack groups",
         help_text="If checked, all stacks and stack groups that are not "
         "referenced after the import will be removed.")
    tags = forms.CharField(initial="", required=False,
        widget=forms.TextInput(attrs={'size':'50'}),
        help_text="A comma separated list of unquoted tags.")
    default_tile_width = forms.IntegerField(
        initial=settings.IMPORTER_DEFAULT_TILE_WIDTH,
        help_text="The default width of one tile in <em>pixel</em>, " \
            "used if not specified for a stack.")
    default_tile_height = forms.IntegerField(
        initial=settings.IMPORTER_DEFAULT_TILE_HEIGHT,
        help_text="The default height of one tile in <em>pixel</em>, " \
            "used if not specified for a stack.")
    default_tile_source_type = forms.ChoiceField(
            initial=settings.IMPORTER_DEFAULT_TILE_SOURCE_TYPE,
            choices=TILE_SOURCE_TYPES,
            help_text="The default tile source type is used if there " \
                    "none defined for an imported stack. It represents " \
                    "how the tile data is organized. See " \
                    "<a href=\"http://catmaid.org/page/tile_sources.html\">"\
                    "tile source conventions documentation</a>.")
    link_classifications = forms.BooleanField(initial=False,
        required=False, help_text="If checked, this option will " \
            "let the importer suggest classification graphs to " \
            "link the new projects against and will allow manual " \
            "links as well.")
    user_permissions = forms.MultipleChoiceField(required=False,
        widget=FilteredSelectMultiple('user permissions', is_stacked=False),
        help_text="The selected <em>user/permission combination</em> \
                   will be assigned to every project.")
    group_permissions = forms.MultipleChoiceField(required=False,
        widget=FilteredSelectMultiple('group permissions', is_stacked=False),
        help_text="The selected <em>group/permission combination</em> \
                   will be assigned to every project.")

def create_classification_linking_form():
    """ Create a new ClassificationLinkingForm instance.
    """
    workspace_pid = settings.ONTOLOGY_DUMMY_PROJECT_ID
    root_links = get_classification_links_qs( workspace_pid, [], True )
    # Make sure we use no classification graph more than once
    known_roots = [] # type: List
    root_ids = []
    for link in root_links:
        if link.class_instance_b.id not in known_roots:
            known_roots.append(link.class_instance_b.id)
            root_ids.append(link.id)

    class ClassificationLinkingForm(forms.Form):
        # A check-box for each project, checked by default
        classification_graph_suggestions = forms.MultipleChoiceField(required=False,
            widget=forms.CheckboxSelectMultiple(),
            help_text="Only selected classification graphs will be linked to the new projects.")
        additional_links = forms.ModelMultipleChoiceField(required=False,
            widget=FilteredSelectMultiple('Classification roots',
                is_stacked=False),
            queryset = ClassInstanceClassInstanceProxy.objects.filter(id__in=root_ids))

    return ClassificationLinkingForm

class ConfirmationForm(forms.Form):
    """ A form to confirm the selection and settings of the
    projects that are about to be imported.
    """
    something = forms.CharField(initial="", required=False)

def ensure_classes(project, classes, user):
    """ Make sure the given project has all referenced classes and relations.
    The classes argument is expected to be a list of root class names, each one
    forming a tree of {relation, class, children} objects. The relation
    properties refers to the parent element.
    """

    def create(node, parent=None):
        name = node['class']
        cls, _ = Class.objects.get_or_create(project=project, class_name=name,
              defaults={
                  'user': user
              })

        if parent:
            parent_relation_name = node.get('relation', None)
            if not parent_relation_name:
                raise ValueError("Need parent relation for class \"" + name + "\"")
            rel, _ = Relation.objects.get_or_create(project=project,
                    relation_name=parent_relation_name, defaults={
                      'user': user
                    })
            cls_cls, _ = ClassClass.objects.get_or_create(project=project,
                    class_a=cls, class_b=parent, relation=rel, defaults={
                      'user': user
                    })

        for child in node.get('children', []):
            create(child, cls)

        return cls

    classification_root_class, _ = Class.objects.get_or_create(project=project,
            class_name="classification_root", defaults={
                'user': user
            })
    is_a, _ = Relation.objects.get_or_create(project=project,
            relation_name="is_a", defaults={
                'user': user
            })
    for root_node in classes:
        root_class = create(root_node)
        # Make sure roots are classification roots
        classification_root_link, _ = ClassClass.objects.get_or_create(
                project=project, class_a=root_class,
                class_b=classification_root_class, relation=is_a, defaults={
                  'user': user
                })


def ensure_class_instances(project, classification_paths, user, stack=None, stackgroup=None) -> None:
    """ Make sure the given project has all referenced class instances (by name)
    available. The names list is expected to be a classification root reference.
    Note: This currently expects each class to be instantiated only once in each
    graph.
    """

    def create(node, parent=None, path=[]):
        # Find existing class with passed in node name, expect unique names
        cls = Class.objects.get(project=project, class_name=node)

        if parent:
            # Make sure link to parent is available. Use relation in ontology,
            # expect only one.
            parent_class = parent.class_column
            parent_cc = ClassClass.objects.get(project=project, class_a=cls, class_b=parent_class)
            rel = parent_cc.relation
            ci = ClassInstance.objects.filter(project=project, class_column=cls,
                    cici_via_a__class_instance_b=parent,
                    cici_via_a__relation=rel)
            if 0 == len(ci):
                ci, _ = ClassInstance.objects.get_or_create(project=project,
                    class_column=cls, defaults={
                        'user': user,
                        'name': node
                    })
                cici, _ = ClassInstanceClassInstance.objects.get_or_create(project=project,
                    class_instance_a=ci, class_instance_b=parent, relation=rel, defaults={
                        'user': user
                    })
            elif 1 < len(ci):
                raise ValueError("Found more than one existing matching " +
                        "classification entry for \"" + node + "\"")
            else:
                ci = ci[0]
        else:
          # Find existing class instance, also with passed in node name, expect
          # a single root instance.
          ci, _ = ClassInstance.objects.get_or_create(project=project, class_column=cls,
              defaults={
                  'user': user,
                  'name': node
              })

        return ci
    classification_project_class, _ = Class.objects.get_or_create(project=project,
            class_name="classification_project", defaults={
                'user': user
            })
    classified_by, _ = Relation.objects.get_or_create(project=project,
            relation_name="classified_by", defaults={
                'user': user
            })
    linked_to, _ = Relation.objects.get_or_create(project=project,
            relation_name="linked_to", defaults={
                'user': user
            })

    t = type(classification_paths)
    if t is list or t is tuple:
        for path in classification_paths:
            parent_node = None
            ci_path = []
            for class_name in path:
                parent_node = create(class_name, parent_node)
                ci_path.append(parent_node)

            root_node = ci_path[0]
            last_node = ci_path[-1]

            # Link root to project
            classification_project, _ = ClassInstance.objects.get_or_create(
                    project=project, class_column=classification_project_class,
                    defaults={
                        'user': user
                    })
            classification_project_link, _ = ClassInstanceClassInstance.objects.get_or_create(
                    project=project, class_instance_a=classification_project,
                    class_instance_b=root_node, relation=classified_by, defaults={
                        'user': user
                    })

            if stack:
                # Link stack to class instance at end of path
                StackClassInstance.objects.get_or_create(project=project,
                        relation=linked_to, stack=stack,
                        class_instance=last_node, defaults={
                            'user': user
                        })
            if stackgroup:
                # Link stackgroup to class instance at end of path
                StackGroupClassInstance.objects.get_or_create(
                        project=project, class_instance=last_node,
                        stack_group=stackgroup, relation=linked_to, defaults={
                            'user': user
                        })
    else:
        raise ValueError("Unknown classification syntax, expected list: " + t)

def import_projects(user, pre_projects, tags, permissions,
        default_tile_width, default_tile_height, default_tile_source_type,
        cls_graph_ids_to_link, remove_unref_stack_data) -> Tuple[List, List]:
    """ Creates real CATMAID ojects out of the PreProject objects
    and imports them into CATMAID. Returns one list of imported objects and another of
    non-imported objects.
    """
    remove_unimported_linked_stacks = False
    known_stack_action = None
    known_stackgroup_action = None
    imported = []
    not_imported = []
    cursor = connection.cursor()
    for pp in pre_projects:
        project = None
        currently_linked_stacks = [] # type: List
        currently_linked_stack_ids = [] # type: List
        links = {} # type: Dict
        all_stacks_known = all(s.already_known for s in pp.stacks)
        try:
            if pp.already_known:
                project = Project.objects.get(pk=pp.already_known_pid)
                currently_linked_stacks = [ps.stack for ps in \
                        ProjectStack.objects.filter(project=project)]
                currently_linked_stack_ids = [s.id for s in \
                        currently_linked_stacks]

                # Check if all imported stacks are already linked to the
                # exisiting project. For now onlt consider a stack linked if the
                # existing project is the only link.
                links = {ss:[l for l in currently_linked_stacks if ss.equals(l)] \
                        for ss in pp.stacks}
                all_stacks_linked = all(len(l) == 1 for l in links.values())

                if 'ignore' == pp.action:
                    # Ignore all projects that are marked to be ignored
                    continue
                elif 'add-anyway' == pp.action:
                    project = None
                    known_stack_action = 'import'
                    known_stackgroup_action = 'import'
                elif 'merge' == pp.action:
                    # If all stacks are known already and linked to the existing
                    # project, there is nothing left to do here. Otherwise, ignore
                    # existing stacks.
                    if all_stacks_linked:
                      continue
                    # Merging projects means adding new stacks to an existing
                    # project, ignoring all existing linked stacks.
                    known_stack_action = 'ignore'
                    known_stackgroup_action = 'merge'
                    remove_unimported_linked_stacks = False
                elif 'merge-override' == pp.action:
                    # Re-use existing project, but override properties of
                    # existing stacks and remove links that are not part of the
                    # new project definition
                    known_stack_action = 'override'
                    known_stackgroup_action = 'override'
                    remove_unimported_linked_stacks = True
                elif 'replace' == pp.action:
                    # Delete existg projects and import all stacks
                    project.delete()
                    project = None
                    known_stack_action = 'import'
                    known_stackgroup_action = 'import'
                    remove_unimported_linked_stacks = False
                else:
                    raise ValueError('Invalid known project action: ' + pp.action)

                if remove_unimported_linked_stacks:
                    # Remove all existing links that don't link to existing
                    # projects.
                    for stack in currently_linked_stacks:
                        if not pp.imports_stack(stack):
                            # Delete project stack entry and stack group membership.
                            stack.delete()

            # Create stacks and add them to project
            stacks = []
            updated_stacks = []
            stack_groups = {} # type: Dict
            translations = {}
            orientations = {}
            stack_classification = {}
            stackgroup_classification = {} # type: Dict
            for s in pp.stacks:

                # Test if stack is alrady known. This can change with every
                # iteration. At least if we want to re-use stacks defined
                # multiple times in import. Maybe make this an option?
                known_before = s.already_known
                linked_objects = links.get(s) or []
                valid_link = len(linked_objects) == 1
                existing_stack = linked_objects[0] if valid_link else None

                stack_properties = {
                    'title': s.title,
                    'dimension': s.dimension,
                    'resolution': s.resolution,
                    'downsample_factors': s.downsample_factors,
                    'metadata': s.metadata,
                    'comment': s.comment,
                    'attribution': s.attribution,
                    'description': s.description,
                    'canary_location': s.canary_location,
                    'placeholder_color': s.placeholder_color
                }

                stack = None

                if valid_link:
                  if 'ignore' ==  known_stack_action:
                      continue
                  elif 'import' == known_stack_action:
                      # Nothing to do, just for completeness
                      pass
                  elif 'override' == known_stack_action:
                      # Copy properties of known imported stacks to matching
                      # existing ones that have a valid link to the existing
                      # project.
                      stack = existing_stack
                      for k,v in stack_properties.items():
                        if hasattr(stack, k):
                            setattr(stack, k, v)
                        else:
                            raise ValueError("Unknown stack field: " + k)
                      stack.save()
                      updated_stacks.append(stack)
                  else:
                      raise ValueError("Invalid action for known stacks: " +
                          str(known_stack_action))

                # TODO This breaks if the same stack is imported multiple times
                # into the same imported project. Maybe we shouldn't only
                # consider a single linked stack as valid.
                if not stack:
                    stack = Stack.objects.create(**stack_properties)
                    stacks.append(stack)

                # First, remove all broken slice information, if any. Then add
                # broken slices if available.
                BrokenSlice.objects.filter(stack=stack).delete()
                if s.broken_slices:
                    for bs in s.broken_slices:
                        BrokenSlice.objects.create(stack=stack, index=bs)

                # Link to ontology, if wanted
                if s.classification:
                    stack_classification[stack] = s.classification

                for m in s.mirrors:
                    mirror_properties = {
                        'stack': stack,
                        'title': m.title,
                        'image_base': m.image_base,
                        'file_extension': m.file_extension,
                        'tile_width': getattr(m, "tile_width", default_tile_width),
                        'tile_height': getattr(m, "tile_height", default_tile_height),
                        'tile_source_type': getattr(m, "tile_source_type",
                            default_tile_source_type),
                        'position': getattr(m, 'position')
                    }

                    known_mirrors = None
                    if existing_stack:
                        known_mirrors = StackMirror.objects.filter(
                            image_base=m.image_base, stack=existing_stack)
                    if known_mirrors and len(known_mirrors) > 0:
                      if 'ignore' == known_stack_action:
                          continue
                      elif 'import' == known_stack_action:
                          pass
                      elif 'override' == known_stack_action:
                          # Find a linked (!) and matching mirror
                          for mirror in known_mirrors:
                              for k,v in mirror_properties.items():
                                if hasattr(mirror, k):
                                    setattr(mirror, k, v)
                                else:
                                    raise ValueError("Unknown mirror field: " + k)
                              mirror.save()
                      else:
                          raise ValueError("Invalid action for known mirror: " +
                             str(known_stack_action))
                    else:
                        # Default to mirror creation
                        if not known_mirrors:
                            mirror = StackMirror.objects.create(**mirror_properties)

                # Collect stack group information
                for sg in s.stackgroups:
                    stack_group = stack_groups.get(sg.title)
                    if not stack_group:
                        stack_group = []
                        stack_groups[sg.title] = stack_group
                    stack_group.append({
                        'stack': stack,
                        'relation': sg.relation
                    })
                # Keep track of project-stack offsets
                translations[stack] = s.project_translation
                orientations[stack] = s.orientation

            # Create new project, if no existing one has been selected before
            p = project or Project.objects.create(title=pp.title)
            # Assign permissions to project
            assigned_permissions = []
            for user_or_group, perm in permissions:
                assigned_perm = assign_perm( perm.codename, user_or_group, p )
                assigned_permissions.append( assigned_perm )
            # Tag the project
            p.tags.add( *tags )
            # Add stacks to import to project
            for s in stacks:
                trln = Double3D.from_str(translations[s])
                orientation = orientations[s]
                ps = ProjectStack.objects.create(
                    project=p, stack=s, translation=trln,
                    orientation=orientation)
            # Update project links of updated projects
            for us in updated_stacks:
                trln = Double3D.from_str(translations[us])
                orientation = orientations[us]
                ps = ProjectStack.objects.create(project=p, stack=us,
                    translation=trln, orientation=orientation)
            # Make project changes persistent
            p.save()

            # Add ontology and classification information, if provided
            if pp.ontology:
                ensure_classes(p, pp.ontology, user)
            if pp.classification:
                ensure_class_instances(p, pp.classification, user)

            # Add classification and link to stacks
            for s, classification in stack_classification.items():
                ensure_class_instances(p, classification,  user, stack=s)

            # Save stack groups
            referenced_stackgroups = {}
            for sg, linked_stacks in stack_groups.items():
                existing_stackgroups = StackGroup.objects.filter(title=sg)

                if len(existing_stackgroups) > 1:
                    raise ValueError("Found more than one existing stack group "
                            "with the same title, expected zero or one.")
                elif len(existing_stackgroups) > 0:
                    if 'ignore' == known_stackgroup_action:
                        continue
                    elif 'import' == known_stackgroup_action:
                        pass
                    elif 'merge' == known_stackgroup_action:
                        pass
                    elif 'override' == known_stackgroup_action:
                        existing_stackgroups.delete()

                stack_group = StackGroup.objects.create(title=sg)
                referenced_stackgroups[sg] = stack_group
                for n,ls in enumerate(linked_stacks):
                    group_relation, _ = StackGroupRelation.objects.get_or_create(
                        name=ls['relation'])
                    StackStackGroup.objects.create(
                        group_relation=group_relation,
                        stack=ls['stack'],
                        stack_group=stack_group,
                        position=n)

            # Link project level defined stack group classification
            for sg in pp.stackgroups:
                ref_sg = referenced_stackgroups.get(sg.title)
                if ref_sg and sg.classification:
                    ensure_class_instances(p, sg.classification, user,
                    stackgroup=ref_sg)

            # Link classification graphs
            for cg in cls_graph_ids_to_link:
                workspace = settings.ONTOLOGY_DUMMY_PROJECT_ID
                cgroot = ClassInstance.objects.get(pk=cg)
                link_existing_classification(workspace, user, p, cgroot.id)
            # Remember created project
            imported.append( pp )

            # If unrefernced stacks and implicitely unreferenced stack groups
            # should be removed, find all of them and and remove them in one go.
            if remove_unref_stack_data:
              cursor.execute("""
                  SELECT s.id
                  FROM stack s
                  LEFT OUTER JOIN project_stack ps
                    ON s.id = ps.stack_id
                  WHERE
                    ps.id IS NULL
              """)
              unused_stack_ids = [r[0] for r in cursor.fetchall()]
              # Delete cascaded with the help of Django
              Stack.objects.filter(id__in=unused_stack_ids).delete()
              # Delete all empty stack groups
              cursor.execute("""
                  DELETE FROM stack_group
                  USING stack_group sg
                  LEFT OUTER JOIN stack_stack_group ssg
                    ON sg.id = ssg.stack_id
                  WHERE ssg.id IS NULL
              """)

        except Exception as e:
            import traceback
            not_imported.append((
                pp,
                Exception("Couldn't import project: {} {}".format(str(e),
                        str(traceback.format_exc())))
            ))

    return (imported, not_imported)
