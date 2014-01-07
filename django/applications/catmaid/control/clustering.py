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
from catmaid.control.classification import ClassProxy
from catmaid.control.classification import get_root_classes_qs, get_classification_links_qs

from numpy import array as nparray
import scipy.cluster.hierarchy as hier
import scipy.spatial.distance as dist

metrics = (
    ('jaccard', 'Jaccard'),
    ('hamming', 'Hamming'),
    ('chebyshev', 'Chebyshev'),
)

linkages = (
    ('single', 'Single (nearest point algorithm)'),
    ('complete', 'Complete (farthest point algorithm)'),
    ('average', 'Average (UPGMA)'),
    ('weighted', 'Weighted'),
    ('centroid', 'Centroid'),
    ('median', 'Median'),
    ('ward', 'Ward'),
)

class ClassInstanceProxy(ClassInstance):
    """ A proxy class to allow custom labeling of class instances in
    model forms.
    """
    class Meta:
        proxy=True

    def __unicode__(self):
        return "{0} ({1})".format(self.name, str(self.id))

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
            queryset=Class.objects.filter(id__in=class_ids),
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
            root_ci_qs = ClassInstanceProxy.objects.filter( class_column__in=ontologies )
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

class FeatureLink:
    def __init__(self, class_a, class_b, relation, super_class = None):
        self.class_a = class_a
        self.class_b = class_b
        self.relation = relation
        self.super_class = super_class

class Feature:
    """ A small container to keep a list of class-class links.
    """
    def __init__(self, class_class_links):
        self.links = class_class_links
        self.name = ",".join(
            [l.class_a.class_name for l in self.links] )
    def __str__(self):
        return self.name
    def __len__(self):
        return len(self.links)

def get_features( ontology, workspace_pid, graphs, add_nonleafs=False, only_used_features=False ):
    """ Return a list of Feature instances which represent paths
    to leafs of the ontology.
    """
    feature_lists = get_feature_paths( ontology, workspace_pid, add_nonleafs )
    features = [Feature(fl) for fl in feature_lists]
    if only_used_features:
        used_features = get_by_graphs_instantiated_features(graphs, features)
        return used_features
    else:
        return features

def get_feature_paths( ontology, workspace_pid, add_nonleafs=False, depth=0, max_depth=100 ):
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships.
    """
    return get_feature_paths_remote(ontology, workspace_pid, add_nonleafs, depth, max_depth)

def get_feature_paths_remote( ontology, workspace_pid, add_nonleafs=False, depth=0, max_depth=100 ):
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships. It uses an implementation stored remotely in the
    database server. It needs three database queries in total.
    """

    query = "SELECT * FROM get_feature_paths(%s, %s, %s, %s, %s);" % \
        (ontology.id, workspace_pid, add_nonleafs, depth, max_depth)

    # Run query
    cursor = connection.cursor()
    cursor.execute(query)

    # Parse result
    class_ids = set()
    relation_ids = set()
    rows = cursor.fetchall()
    for r in rows:
        # We get back tuples of feature links with each consisting of the
        # IDs of class_a, class_b, relation and a super class. To create
        # FeatureLink objects out of this, we need to get the class objects
        # first. So collect all class IDs we have got.
        # The link data can be found in the first row of the result set
        if not r:
            raise Exception('Could not parse feature path data received from data base.')
        for link_data in r[0]:
            class_ids.add(link_data[0])
            class_ids.add(link_data[1])
            relation_ids.add(link_data[2])
            if link_data[3]:
               class_ids.add(link_data[3])

    # Get all needed class and relation model objects
    classes = Class.objects.in_bulk(class_ids)
    relations = Relation.objects.in_bulk(relation_ids)

    # Create feature links
    features = []
    for r in rows:
        feature = []
        for link_data in r[0]:
            class_a = classes[link_data[0]]
            class_b = classes[link_data[1]]
            relation = relations[link_data[2]]
            super_a = link_data[3] if classes[link_data[3]] else None
            fl = FeatureLink(class_a, class_b, relation, super_a)
            feature.append(fl)
        features.append(feature)

    return features

def get_feature_paths_simple( ontology, add_nonleafs=False, depth=0, max_depth=100 ):
    """ Returns all root-leaf paths of the passed ontology. It respects
    is_a relationships.
    """
    features = []
    # Get all links, but exclude 'is_a' relationships
    links_q = ClassClass.objects.filter(class_b_id=ontology.id).exclude(
        relation__relation_name='is_a')
    # Check if this link is followed by an 'is_a' relatiship. If so
    # use the classes below.
    feature_links = []
    for link in links_q:
        is_a_links_q = ClassClass.objects.filter(class_b_id=link.class_a.id,
            relation__relation_name='is_a')
        # Add all sub-classes instead of the root if there is at least one.
        if is_a_links_q.count() > 0:
            for is_a_link in is_a_links_q:
                fl = FeatureLink(is_a_link.class_a, link.class_b, link.relation, link.class_a)
                feature_links.append(fl)
        else:
            fl = FeatureLink(link.class_a, link.class_b, link.relation)
            feature_links.append(fl)

    # Look at the feature link paths
    for flink in feature_links:
        add_single_link = False

        if depth < max_depth:
            # Get features of the current feature's class a
            child_features = get_feature_paths( flink.class_a, add_nonleafs, depth+1 )
            # If there is a super class, get the children in addition
            # to the children of the current class.
            if flink.super_class:
                child_features = child_features + \
                    get_feature_paths( flink.super_class, add_nonleafs, depth+1 )

            # Remember the path to this node as feature if a leaf is reached
            # or if non-leaf nodes should be added, too.
            is_leaf = (len(child_features) == 0)
            add_single_link = is_leaf or add_nonleafs
            for cf in child_features:
                features.append( [flink] + cf )
        else:
            # Add current node if we reached the maximum depth
            # and don't recurse any further.
            add_single_link = True

        # Add single link if no more children are found/wanted
        if add_single_link:
            features.append( [flink] )

    return features

def setup_clustering(request, workspace_pid=None):
    workspace_pid = int(workspace_pid)
    select_ontology_form = create_ontology_selection_form(workspace_pid)
    forms = [('ontologies', select_ontology_form),
             ('classifications', ClusteringSetupGraphs),
             ('features', ClusteringSetupFeatures),
             ('clustering', ClusteringSetupMath)]
    view = ClusteringWizard.as_view(forms, workspace_pid=workspace_pid)
    return view(request)

def graph_instanciates_feature(graph, feature):
    return graph_instanciates_feature_complex(graph, feature)

def graph_instanciates_feature_simple(graph, feature, idx=0):
    """ Traverses a class instance graph, starting from the passed node.
    It recurses into child graphs and tests on every class instance if it
    is linked to an ontology node. If it does, the function returns true.
    """
    # An empty feature is always true
    num_features = len(feature)
    if num_features == idx:
        return True
    f_head = feature.links[idx]

    # Check for a link to the first feature component
    link_q = ClassInstanceClassInstance.objects.filter(
        class_instance_b=graph, class_instance_a__class_column=f_head.class_a,
        relation=f_head.relation)
    # Get number of links wth. of len(), because it is doesn't hurt performance
    # if there are no results, but it improves performance if there is exactly
    # one result (saves one query). More than one link should not happen often.
    num_links = len(link_q)
    # Make sure there is the expected child link
    if num_links == 0:
        return False
    elif num_links > 1:
        # More than one?
        raise Exception('Found more than one ontology node link of one class instance.')

    # Continue with checking children, if any
    return graph_instanciates_feature_simple(link_q[0].class_instance_a, feature, idx+1)

def graph_instanciates_feature_complex(graph, feature):
    """ Creates one complex query that thest if the feature is matched as a
    whole.
    """
    # Build Q objects for to query whole feature instantiation at once. Start
    # with query that makes sure the passed graph is the root.
    Qr = Q(class_instance_b=graph)
    for n,fl in enumerate(feature.links):
        # Add constraints for each link
        cia = "class_instance_a__cici_via_b__" * n
        q_cls = Q(**{cia + "class_instance_a__class_column": fl.class_a})
        q_rel = Q(**{cia + "relation": fl.relation})
        # Combine all sub-queries with logical AND
        Qr = Qr & q_cls & q_rel

    link_q = ClassInstanceClassInstance.objects.filter(Qr).distinct()
    num_links = link_q.count()
    # Make sure there is the expected child link
    if num_links == 0:
        return False
    elif num_links == 1:
        return True
    else:
        # More than one?
        raise Exception('Found more than one ontology node link of one class instance.')

def graphs_instanciate_feature(graphlist, feature):
    """ A delegate method to be able to use different implementations in a
    simple manner. Benchmarks show that the complex query is faster.
    """
    return graphs_instanciate_feature_complex(graphlist, feature)

def graphs_instanciate_feature_simple(graphs, feature):
    """ Creates a simple query for each graph to test wheter it instantiates
    a given featuren.
    """
    for g in graphs:
        # Improvement: graphs could be sorted according to how many
        # class instances they have.
        if graph_instanciates_feature(g, feature):
            return True
    return False

def graphs_instanciate_feature_complex(graphlist, feature):
    """ Creates one complex query that thest if the feature is matched as a
    whole.
    """
    # Build Q objects for to query whole feature instantiation at once. Start
    # with query that makes sure the passed graph is the root.
    Qr = Q(class_instance_b__in=graphlist)
    for n,fl in enumerate(feature.links):
        # Add constraints for each link
        cia = "class_instance_a__cici_via_b__" * n
        q_cls = Q(**{cia + "class_instance_a__class_column": fl.class_a})
        q_rel = Q(**{cia + "relation": fl.relation})
        # Combine all sub-queries with logical AND
        Qr = Qr & q_cls & q_rel

    link_q = ClassInstanceClassInstance.objects.filter(Qr).distinct()
    return link_q.count() != 0

def get_by_graphs_instantiated_features(graphs, features):
    """ Creates one complex query that thest which feature are instanciated in one of
    the graphs.
    """

    # Find maximum feature length
    max_links = 0
    for f in features:
        if len(f.links) > max_links:
            max_links = len(f.links)

    # Create feature array
    normalized_features = []
    for f in features:
        links = []
        for i in range(max_links):
            if i < len(f.links):
                fl = f.links[i]
                links.append( '[%s,%s]' % (fl.class_a.id, fl.relation.id))
            else:
                links.append( '[-1,-1]' )
        normalized_features.append(links)

    # Build query with custom ID arrays: An array of graph ids and an array
    # of features. Those features are arrays of links and those links are
    # each an array of the class a ID and the relation ID of that link. All
    # features need to have the same number of links in the array. So if they
    # have actually less, pad with [-1, -1] elements.
    query = "SELECT * FROM filter_used_features(ARRAY[%s], ARRAY[%s] );" % \
        (",".join([str(g.id) for g in graphs]),
         ",".join(['[%s]' % ','.join(f) for f in normalized_features]))

    # Run query
    cursor = connection.cursor()
    cursor.execute(query)

    # Parse result
    used_features = []
    rows = cursor.fetchall()
    for r in rows:
        # PostgreSQL uses one based indexing, subtract 1 to get 0 based indices
        idx = r[0] - 1
        used_features.append( features[idx] )

    return used_features

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

