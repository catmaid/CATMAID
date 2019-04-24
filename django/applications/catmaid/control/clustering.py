# -*- coding: utf-8 -*-

import logging

logger = logging.getLogger(__name__)

try:
    import scipy.cluster.hierarchy as hier
    import scipy.spatial.distance as dist
except ImportError:
    logger.warning("CATMAID was unable to load the scipy module. "
        "Ontology clustering will not be available")

import numpy as np
from typing import List

from django import forms
from django.forms.formsets import formset_factory
from django.forms.widgets import CheckboxSelectMultiple
from django.http import JsonResponse

from formtools.wizard.views import SessionWizardView

from catmaid.models import Class
from catmaid.control.classification import (ClassInstanceProxy,
    get_root_classes_qs, graphs_instantiate_features)
from catmaid.control.ontology import get_features


metrics = (
    ('jaccard', 'Jaccard'),
    ('hamming', 'Hamming'),
    ('chebyshev', 'Chebyshev'),
)

linkages = (
    ('average', 'Average (UPGMA)'),
    ('single', 'Single (nearest point algorithm)'),
    ('complete', 'Complete (farthest point algorithm)'),
    ('weighted', 'Weighted'),
    ('centroid', 'Centroid'),
    ('median', 'Median'),
    ('ward', 'Ward'),
)

def create_ontology_selection_form(workspace_pid, class_ids=None):
    """ Creates a new SelectOntologyForm class with an up-to-date
    class queryset.
    """
    if not class_ids:
        class_ids = get_root_classes_qs(workspace_pid)

    class SelectOntologyForm(forms.Form):
        """ A simple form to select classification ontologies. A choice
        field allows to select a single class that 'is_a' 'classification_root'.
        """
        ontologies = forms.ModelMultipleChoiceField(
            queryset=Class.objects.filter(id__in=class_ids).order_by('class_name'),
            widget=CheckboxSelectMultiple(attrs={'class': 'autoselectable'}))

    return SelectOntologyForm

class FeatureForm(forms.Form):
    feature = forms.BooleanField()

class ClusteringSetupFeatures(forms.Form):
    #add_nonleafs = forms.BooleanField(initial=False,
    #    required=False, label="Use sub-paths as features")
    features = forms.MultipleChoiceField(choices=[],
            widget=CheckboxSelectMultiple(attrs={'class': 'autoselectable'}))

class ClusteringSetupGraphs(forms.Form):
    classification_graphs = forms.ModelMultipleChoiceField(
        queryset=ClassInstanceProxy.objects.all(),
        widget=CheckboxSelectMultiple(attrs={'class': 'autoselectable'}))
    only_used_features = forms.BooleanField(initial=True,
        required=False, label="Allow only features used by selected graphs")

class ClusteringSetupMath(forms.Form):
    metric = forms.ChoiceField(choices=metrics)
    linkage = forms.ChoiceField(choices=linkages)

class ClusteringWizard(SessionWizardView):
    template_name = "catmaid/clustering/setup.html"
    workspace_pid = None

    def get_form(self, step=None, data=None, files=None):
        form = super(ClusteringWizard, self).get_form(step, data, files)
        current_step = step or self.steps.current
        if current_step == 'classifications':
            # Select root nodes of graphs that are instances of the
            # selected ontologies
            ontologies = self.get_cleaned_data_for_step('ontologies')['ontologies']
            root_ci_qs = ClassInstanceProxy.objects.filter( class_column__in=ontologies ).order_by('name')
            form.fields['classification_graphs'].queryset = root_ci_qs
        elif current_step == 'features':
            # Display a list of all available features
            gcd = self.get_cleaned_data_for_step
            ontologies = gcd('ontologies')['ontologies']
            only_used_features = gcd('classifications')['only_used_features']
            graphs = gcd('classifications')['classification_graphs']
            add_nonleafs = True
            # Featurs are abstract concepts (classes) and graphs will be
            # checked which classes they have instantiated.
            raw_features = [] # type: List
            for o in ontologies:
                raw_features = raw_features + get_features( o, self.workspace_pid,
                    graphs, add_nonleafs, only_used_features )
            self.features = raw_features
            # Build form array
            features = []
            for i, f in enumerate(raw_features):
                features.append((i, f.name))
            # Add form array to form field
            form.fields['features'].choices = features

        return form

    def get_context_data(self, form, **kwargs):
        context = super(ClusteringWizard, self).get_context_data(form=form, **kwargs)
        extra_context = {'workspace_pid': self.workspace_pid}

        if self.steps.current == 'ontologies':
            extra_context['description'] = \
                'Please select all the ontologies that you want to see ' \
                'considered for feature selection. Additionally, you can ' \
                'define whether all sub-paths starting from root to a ' \
                'leaf should be used as features, too.'
        elif self.steps.current == 'classifications':
            extra_context['description'] = \
               'Below are all classification graphs shown, that are based ' \
               'on the previeously selected ontologies. Please select those ' \
               'you want to be considered in the clustering.'
        elif self.steps.current == 'features':
            extra_context['description'] = \
               'In this page you can select all the features you would ' \
               'to be taken into account by the clustering. A selected term ' \
               'means the path from the ontologie\'s root to this term will ' \
               'be used as feature. By default all possible features of all ' \
               'selected ontologies are selected.'
            # Create formsets for before selected ontologies and add them to
            # context. Each formset ID will have the prefix "ontology-<ID>".
            ontologies = self.get_cleaned_data_for_step(
                'ontologies')['ontologies']
            FeatureFormset = formset_factory(FeatureForm)
            formsets = []
            for o in ontologies:
                formsets.append({
                   'ontology': o,
                   'formset': FeatureFormset(prefix='ontology-' + str(o.id))})
            extra_context['formsets'] = formsets
        else:
            extra_context['description'] = \
                   "Please adjust the clustering settings to your liking."

        context.update(extra_context)

        return context

    def done(self, form_list, **kwargs) -> JsonResponse:
        cleaned_data = [form.cleaned_data for form in form_list]
        ontologies = cleaned_data[0].get('ontologies')
        graphs = cleaned_data[1].get('classification_graphs')
        selected_feature_ids = cleaned_data[2].get('features')
        metric = str(cleaned_data[3].get('metric'))
        linkage = str(cleaned_data[3].get('linkage'))

        # Get selected features
        features = []
        for f_id in selected_feature_ids:
            features.append(self.features[int(f_id)])

        # Create binary matrix
        logger.debug("Clustering: Creating binary matrix")
        bin_matrix = create_binary_matrix(graphs, features) # type: np.ndarray
                                                            # maintenance concern: this wrapper for graphs_instantiate_features
                                                            # is required for the later bin_matrix.tolist() to be valid
        # Calculate the distance matrix
        logger.debug("Clustering: creating distsance matrix")
        dst_matrix = dist.pdist(bin_matrix, metric)
        # The distance matrix now has no redundancies, but we need the square form
        dst_matrix = dist.squareform(dst_matrix)
        # Calculate linkage matrix
        logger.debug("Clustering: creating linkage matrix")
        linkage_matrix = hier.linkage(bin_matrix, linkage, metric)
        # Obtain the clustering dendrogram data
        graph_names = [ g.name for g in graphs ]
        logger.debug("Clustering: creating dendrogram")
        dendrogram = hier.dendrogram(linkage_matrix, no_plot=True,
            count_sort=True, labels=graph_names)

        logger.debug("Clustering: creating response")
        response = JsonResponse({
            'step': 'result',
            'ontologies': [(o.id, o.class_name) for o in ontologies],
            'graphs': [[g.id, g.name] for g in graphs],
            'features': [str(f) for f in features],
            'bin_matrix': bin_matrix.tolist(),
            'metric': metric,
            'dst_matrix': dst_matrix.tolist(),
            'dendrogram': dendrogram,
        })
        logger.debug("Clustering: returning response of {} characters".format(len(response.content)))
        return response

def setup_clustering(request, workspace_pid=None):
    workspace_pid = int(workspace_pid)
    select_ontology_form = create_ontology_selection_form(workspace_pid)
    forms = [('ontologies', select_ontology_form),
             ('classifications', ClusteringSetupGraphs),
             ('features', ClusteringSetupFeatures),
             ('clustering', ClusteringSetupMath)]
    view = ClusteringWizard.as_view(forms, workspace_pid=workspace_pid)
    return view(request)

def create_binary_matrix(graphs, features) -> np.ndarray:
    """ Creates a binary matrix for the graphs passed."""
    matrix = np.zeros((len(graphs),len(features)), dtype=np.int) # type: np.ndarray
    return graphs_instantiate_features(graphs, features, matrix)

