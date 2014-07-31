import sys
import json
import string

from django import forms
from django.db import connection
from django.db.models import Q
from django.forms.formsets import formset_factory
from django.forms.widgets import CheckboxSelectMultiple
from django.shortcuts import render_to_response
from django.contrib.formtools.wizard.views import SessionWizardView
from django.http import HttpResponse
from django.template import RequestContext

from catmaid.models import Class, ClassInstance, ClassClass, ClassInstanceClassInstance
from catmaid.models import Relation
from catmaid.control.classification import ClassProxy, ClassInstanceProxy
from catmaid.control.classification import get_root_classes_qs, get_classification_links_qs
from catmaid.control.classification import graph_instanciates_feature
from catmaid.control.ontology import get_features

from numpy import array as nparray
import scipy.cluster.hierarchy as hier
import scipy.spatial.distance as dist

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

def create_ontology_selection_form( workspace_pid, class_ids=None ):
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
            # checked which classes they have instanciated.
            raw_features = []
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

    def done(self, form_list, **kwargs):
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
        bin_matrix = nparray(create_binary_matrix(graphs, features))
        # Calculate the distance matrix
        dst_matrix = dist.pdist(bin_matrix, metric)
        # The distance matrix now has no redundancies, but we need the square form
        dst_matrix = dist.squareform(dst_matrix)
        # Calculate linkage matrix
        linkage_matrix = hier.linkage(bin_matrix, linkage, metric)
        # Obtain the clustering dendrogram data
        graph_names = [ g.name for g in graphs ]
        dendrogram = hier.dendrogram(linkage_matrix, no_plot=True,
            count_sort=True, labels=graph_names)

        # Create a binary_matrix with graphs attached for display
        num_graphs = len(graphs)
        display_bin_matrix = []
        for i in range( num_graphs ):
            display_bin_matrix.append(
                {'graph': graphs[i], 'feature': bin_matrix[i]})

        # Create dst_matrix with graphs attached
        display_dst_matrix = []
        for i in range(num_graphs):
            display_dst_matrix.append(
                {'graph': graphs[i], 'distances': dst_matrix[i]})

        # Create a JSON version of the dendrogram to make it
        # available to the client.
        dendrogram_json = json.dumps(dendrogram)

        # Get the default request context and add custom data
        context = RequestContext(self.request)
        context.update({
            'ontologies': ontologies,
            'graphs': graphs,
            'features': features,
            'bin_matrix': display_bin_matrix,
            'metric': metric,
            'dst_matrix': display_dst_matrix,
            'dendrogram_json': dendrogram_json})

        return render_to_response('catmaid/clustering/display.html', context)

def setup_clustering(request, workspace_pid=None):
    workspace_pid = int(workspace_pid)
    select_ontology_form = create_ontology_selection_form(workspace_pid)
    forms = [('ontologies', select_ontology_form),
             ('classifications', ClusteringSetupGraphs),
             ('features', ClusteringSetupFeatures),
             ('clustering', ClusteringSetupMath)]
    view = ClusteringWizard.as_view(forms, workspace_pid=workspace_pid)
    return view(request)

def create_binary_matrix(graphs, features):
    """ Creates a binary matrix for the graphs passed."""
    num_features = len(features)
    num_graphs = len(graphs)
    # Fill matrix with zeros
    matrix = [ [ 0 for j in range(num_features)] for i in range(num_graphs) ]
    # Put a one at each position where the tree has
    # a feature defined
    for i in range(num_graphs):
        graph = graphs[i]
        for j in range(num_features):
            feature = features[j]
            # Check if a feature (root-leaf path in graph) is part of the
            # current graph
            if graph_instanciates_feature(graph, feature):
                matrix[i][j] = 1

    return matrix

