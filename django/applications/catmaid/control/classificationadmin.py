# -*- coding: utf-8 -*-

from collections import defaultdict
from itertools import combinations

from django import forms
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render_to_response

from formtools.wizard.views import SessionWizardView

from typing import Any, DefaultDict, Dict, FrozenSet, List, Optional, Set, Tuple, Union

from catmaid.control.classification import get_classification_links_qs, \
        link_existing_classification
from catmaid.models import ClassInstance, Project

from taggit.models import TaggedItem

TEMPLATES = {"settings": "catmaid/classification/admin_settings.html",
             "taggroups": "catmaid/classification/admin_setup_tag_groups.html",
             "confirmation": "catmaid/classification/admin_confirmation.html"}

class SettingsForm(forms.Form):
    add_supersets = forms.BooleanField(required=False, initial=True,
        help_text="This field indicates if a tag set should include only " \
            "strictly projects of an actually available tag set. Or if " \
            "projects of super sets should get added. Super sets are tag " \
            "sets that include the tag set under consideration.")
    respect_superset_graphs = forms.BooleanField(required=False,
        help_text="If projects of super sets are added, this setting indicates " \
            "if classification graphs linked to those projects should actually " \
            "be considered missing if they are not linked in non-super set " \
            "projects. When not checked, only classification graphs linked to " \
            "from non-super set projects can be considered missing (also by " \
            "super set projects).")

class TagGroupSelectionForm(forms.Form):
    tag_groups = forms.MultipleChoiceField(required=False,
        widget=forms.CheckboxSelectMultiple())

class ConfirmationForm(forms.Form):
    pass

def get_tag_sets(add_supersets:bool=False, prefetch:bool=True) -> Tuple[List, Any, DefaultDict[Any, Set]]:
    tag_sets = defaultdict(set) # type: DefaultDict[Any, Set]
    tag_supersets = defaultdict(set) # type: DefaultDict[Any, Set]
    project_ids = list(Project.objects.all().values_list('id', flat=True))

    # Build tag index
    ct = ContentType.objects.get_for_model(Project)
    tag_links = TaggedItem.objects.filter(content_type=ct) \
        .values_list('object_id', 'tag__name')
    tag_index = defaultdict(set) # type: DefaultDict[Any, Set]
    for pid, t in tag_links:
        tag_index[pid].add(t)

    # Build up data structure that maps tag sets to
    # projects. These projects include projects with
    # tag supersets.
    for p, ts in tag_index.items():
        tag_sets[frozenset(ts)].add(p)

    if add_supersets:
        for a, b in combinations(tag_sets, 2):
            if a < b:
                tag_sets[a].update(tag_sets[b])
                tag_supersets[a].update(tag_sets[b])
            elif b < a:
                tag_sets[b].update(tag_sets[a])
                tag_supersets[b].update(tag_sets[a])

    return project_ids, tag_sets, tag_supersets

def generate_tag_groups(add_supersets:bool=True, respect_superset_graphs:bool=False) -> Dict:
    """ This creates a tag sets dictionary. It ignores projects without any
    tags.
    """
    project_ids, tag_sets, tag_supersets = get_tag_sets(add_supersets)

    # Get a query set that retrieves all CiCi links for all project ids at once
    workspace = settings.ONTOLOGY_DUMMY_PROJECT_ID

    # We are retrieving the classification links of *all* projects. The query
    # will therefore be much faster, if we get the inverse set of the empty
    # set instead of explicitely requesting the project_ids to be in
    # project_ids..
    links_qs = get_classification_links_qs(workspace, [], inverse=True)

    # Make sure the the project ids and the classification root ids are
    # prefetched
    links_qs = links_qs.select_related('class_instance_a__project__id',
        'class_instance_b__id')
    # Execute the query set to build a look up table
    projects_to_cls_links = {} # type: Dict
    for cici in links_qs:
        cls_links = projects_to_cls_links.get(cici.class_instance_a.project.id)
        if not cls_links:
            cls_links = set()
            projects_to_cls_links[cici.class_instance_a.project.id] = cls_links
        cls_links.add(cici.class_instance_b.id)

    # Test which groups of projects belonging to a particular tag group,
    # have non-uniform classification graph links
    # TODO: Test for independent *and* dependent workspace
    available_tag_groups = {}
    for tags, projects in tag_sets.items():
        differs = False
        cg_roots = set() # type: Set
        projects_cgroots = {}
        # Collect all classification roots in this tag group
        for pid in projects:
            try:
                # Get set of CiCi links for current project ID
                croots = projects_to_cls_links[pid]
            except KeyError:
                # Use an empty set if there are no CiCi links for the
                # current project.
                croots = set()

            # Remember roots for this projects
            projects_cgroots[pid] = {
                'linked': croots,
                'missing': [],
                'workspace': workspace,
            }
            # Add classification graphs introduced by supersets to the expected
            # graphs in this tag set.
            if pid not in tag_supersets[tags] or respect_superset_graphs:
                    cg_roots.update(croots)
        # Check if there are updates needed for some projects
        num_differing = 0
        meta = []
        for pid in projects_cgroots:
            croots = projects_cgroots[pid]['linked']
            diff = cg_roots - croots
            if len(diff) > 0:
                differs = True
                projects_cgroots[pid]['missing'] = diff
                num_differing = num_differing + 1
                strdiff = ", ".join([str(cg) for cg in diff])
                meta.append("[PID: %s Missing: %s]" % (pid, strdiff))
        # If there is a difference, offer this tag group
        # for selection.
        if differs:
            # Generate a string representation of the tags and use
            # it as index for a project classification.
            taglist = list(tags)
            taglist.sort()
            name = ", ".join([t for t in taglist])
            # Fill data structure for later use
            available_tag_groups[name] = {
                'project_cgroots': projects_cgroots,
                'all_cgroots': cg_roots,
                'num_differing': num_differing,
                'meta': meta,
            }
    return available_tag_groups

class ClassificationAdminWizard(SessionWizardView):

    def get_template_names(self):
        return [TEMPLATES[self.steps.current]]

    def get_context_data(self, **kwargs):
        context = super(ClassificationAdminWizard, self).get_context_data(**kwargs)
        context['catmaid_url'] = settings.CATMAID_URL

        # The project links selection needs some extra context
        extra_context = {}
        if self.steps.current == "taggroups":
            tag_groups = generate_tag_groups(True, False)
            extra_context['num_tag_groups'] = len(self.get_tag_group_list(tag_groups))
        if self.steps.current == "confirmation":
            # Get all selected tag groups
            extra_context['tag_groups'] = self.get_selected_tag_groups()
        context.update(extra_context)

        return context

    def get_tag_group_list(self, available_tag_groups):
        """ Returns a list of tuples that represent the currently
        available tag groups.
        """
        # Create the tag group tuple list
        tag_group_list = []
        for eg, group in available_tag_groups.items():
            name = eg + " (" + str(group['num_differing']) + "/" + \
                str(len(group['project_cgroots'])) + " differ: " + \
                ", ".join(group['meta']) + ")"
            tag_group_list.append( (eg, name) )

        return tag_group_list

    def get_form(self, step:Optional[str]=None, data=None, files=None):
        form = super(ClassificationAdminWizard, self).get_form(step, data, files)
        # Determine step if not given
        if step is None:
            step = self.steps.current
        if step == "taggroups":
            # Update the tag groups list and select all by default
            add_supersets = self.get_cleaned_data_for_step('settings')['add_supersets']
            respect_superset_graphs = self.get_cleaned_data_for_step('settings')['respect_superset_graphs']
            # Store all available tag groups to be usable in the result page
            self.available_tag_groups = generate_tag_groups(add_supersets,
                respect_superset_graphs)
            tag_groups_tuples = self.get_tag_group_list(self.available_tag_groups)
            form.fields["tag_groups"].choices = tag_groups_tuples
            form.fields['tag_groups'].initial = [tg[0] for tg in tag_groups_tuples]
        return form

    def get_selected_tag_groups(self) -> Dict:
        tag_group_ids = self.get_cleaned_data_for_step('taggroups')['tag_groups']
        selected_tag_groups = {}
        for tid in tag_group_ids:
            selected_tag_groups[tid] = self.available_tag_groups[tid]
        return selected_tag_groups

    def done(self, form_list, **kwargs) -> HttpResponse:
        """ Will add all missing links, stored in the tag groups field.
        """
        tag_groups = self.get_selected_tag_groups()
        unified_tag_groups = {}
        num_added_links = 0
        failed_links = {}
        for eg, group in tag_groups.items():
            for pid, pdata in group['project_cgroots'].items():
                # Iterate missing links
                for ml in pdata['missing']:
                    try:
                        # Add missing link
                        wid = pdata['workspace']
                        oroot = ClassInstance.objects.get(pk=ml)
                        p = Project.objects.get(pk=pid)
                        link_existing_classification(wid, self.request.user, p, oroot.id)
                        unified_tag_groups[eg] = group
                        num_added_links = num_added_links + 1
                    except Exception as e:
                        failed_links[ml] = e

        # Show final page
        return render_to_response('catmaid/classification/admin_done.html', {
            'tag_groups': unified_tag_groups,
            'num_added_links': num_added_links,
            'failed_links': failed_links,
        })

def classification_admin_view(request, *args, **kwargs):
    """ Wraps the class based ClassificationAdminWizard view in
    a function based view.
    """
    forms = [("settings", SettingsForm),
             ("taggroups", TagGroupSelectionForm),
             ("confirmation", ConfirmationForm)]
    view = ClassificationAdminWizard.as_view(forms)
    return view(request)
