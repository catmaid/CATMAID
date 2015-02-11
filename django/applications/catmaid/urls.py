from django.conf.urls import patterns, url
from django.contrib.auth.decorators import login_required
from django.views.generic import TemplateView

from catmaid.views import CatmaidView, ExportWidgetView

# A regular expression matching floating point and integer numbers
num = r'[-+]?[0-9]*\.?[0-9]+'
integer = r'[-+]?[0-9]+'
# A regular expression matching lists of integers with comma as delimiter
intlist = r'[0-9]+(,[0-9]+)*'
# A list of words, not containing commas
wordlist= r'\w+(,\w+)*'

# Add the main index.html page at the root:
urlpatterns = patterns('',
    url(r'^$', CatmaidView.as_view(template_name='catmaid/index.html'),
        name="home")
)

# Authentication and permissions
urlpatterns += patterns('catmaid.control.authentication',
    (r'^login$', 'login_vnc'),
    (r'^accounts/login$', 'login_user'),
    (r'^accounts/logout$', 'logout_user'),
    (r'^accounts/(?P<project_id>\d+)/all-usernames$', 'all_usernames'),
    (r'^permissions$', 'user_project_permissions'),
    (r'^classinstance/(?P<ci_id>\d+)/permissions$',
            'get_object_permissions'),
    (r'^register$', 'register'),
)

# Users
urlpatterns += patterns('catmaid.control.user',
    (r'^user-list$', 'user_list'),
    (r'^user-table-list$', 'user_list_datatable'),
    (r'^user-profile/update$', 'update_user_profile'),
)

# Django related user URLs
urlpatterns += patterns('django.contrib.auth.views',
    url(r'^user/password_change/$', 'password_change', {'post_change_redirect': '/'}),
)

# Log
urlpatterns += patterns('catmaid.control.log',
    (r'^(?P<project_id>\d+)/logs/list$', 'list_logs'),
    (r'^log/(?P<level>(info|error|debug))$', 'log_frontent_event'),
)

# Messages
urlpatterns += patterns('catmaid.control.message',
    (r'^messages/list$', 'list_messages'),
    (r'^messages/mark_read$', 'read_message'),
    (r'^messages/latestunreaddate', 'get_latest_unread_date'),
)

# General project model access
urlpatterns += patterns('catmaid.control.project',
    (r'^projects$', 'projects'),
)

# General stack model access
urlpatterns += patterns('catmaid.control.stack',
    (r'^(?P<project_id>\d+)/stacks$', 'stacks'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/info$', 'stack_info'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/models$', 'stack_models'),
)

# Tile access
urlpatterns += patterns('catmaid.control.tile',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tile$', 'get_tile'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put_tile$', 'put_tile'),
)

# Tracing general
urlpatterns += patterns('catmaid.control.tracing',
    (r'^(?P<project_id>\d+)/tracing/setup/rebuild$', 'rebuild_tracing_setup_view'),
    (r'^(?P<project_id>\d+)/tracing/setup/test$', 'check_tracing_setup_view'),
)

# Statistics
urlpatterns += patterns('catmaid.control.stats',
    (r'^(?P<project_id>\d+)/stats$',
        TemplateView.as_view(template_name="catmaid/projectstatistics.html")),
    (r'^(?P<project_id>\d+)/stats/nodecount$', 'stats_nodecount'),
    (r'^(?P<project_id>\d+)/stats/editor$', 'stats_editor'),
    (r'^(?P<project_id>\d+)/stats/summary$', 'stats_summary'),
    (r'^(?P<project_id>\d+)/stats/history$', 'stats_history'),
    (r'^(?P<project_id>\d+)/stats/user-history$', 'stats_user_history'),
    (r'^(?P<project_id>\d+)/stats/user-activity$', 'stats_user_activity'),
)

# Annotations
urlpatterns += patterns('catmaid.control.neuron_annotations',
    (r'^(?P<project_id>\d+)/neuron/query-by-annotations$', 'query_neurons_by_annotations'),
    (r'^(?P<project_id>\d+)/neuron/table/query-by-annotations$',
            'query_neurons_by_annotations_datatable'),
    (r'^(?P<project_id>\d+)/annotations/list$', 'list_annotations'),
    (r'^(?P<project_id>\d+)/annotations/skeletons/list$', 'annotations_for_skeletons'),
    (r'^(?P<project_id>\d+)/annotations/table-list$', 'list_annotations_datatable'),
    (r'^(?P<project_id>\d+)/annotations/add$', 'annotate_entities'),
    (r'^(?P<project_id>\d+)/annotations/(?P<annotation_id>\d+)/remove$',
            'remove_annotation'),
)

# Text labels
urlpatterns += patterns('catmaid.control.textlabel',
    (r'^(?P<project_id>\d+)/textlabel/create$', 'create_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/delete$', 'delete_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/update$', 'update_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/all', 'textlabels'),
)

# Treenode labels
urlpatterns += patterns('catmaid.control.label',
    (r'^(?P<project_id>\d+)/labels-all$', 'labels_all'),
    (r'^(?P<project_id>\d+)/labels-for-nodes$', 'labels_for_nodes'),
    (r'^(?P<project_id>\d+)/labels-for-node/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'labels_for_node'),
    (r'^(?P<project_id>\d+)/label/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)/update$', 'label_update'),
    (r'^(?P<project_id>\d+)/label/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)/remove$', 'remove_label_link'),
    (r'^(?P<project_id>\d+)/label/remove$', 'label_remove'),
)

# Links
urlpatterns += patterns('catmaid.control.link',
    (r'^(?P<project_id>\d+)/link/create$', 'create_link'),
    (r'^(?P<project_id>\d+)/link/delete$', 'delete_link'),
)

# Connector access
urlpatterns += patterns('catmaid.control.connector',
    (r'^(?P<project_id>\d+)/connector/create$', 'create_connector'),
    (r'^(?P<project_id>\d+)/connector/delete$', 'delete_connector'),
    (r'^(?P<project_id>\d+)/connector/table/list$', 'list_connector'),
    (r'^(?P<project_id>\d+)/connector/list/graphedge$', 'graphedge_list'),
    (r'^(?P<project_id>\d+)/connector/list/one_to_many$', 'one_to_many_synapses'),
    (r'^(?P<project_id>\d+)/connector/list/completed$', 'list_completed'),
    (r'^(?P<project_id>\d+)/connector/skeletons$', 'connector_skeletons'),
    (r'^(?P<project_id>\d+)/connector/edgetimes$', 'connector_associated_edgetimes'),
    (r'^(?P<project_id>\d+)/connector/pre-post-info$', 'connectors_info'),
)

# Neuron acess
urlpatterns += patterns('catmaid.control.neuron',
    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/get-all-skeletons$', 'get_all_skeletons_of_neuron'),
    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/give-to-user$', 'give_neuron_to_other_user'),
    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/delete$', 'delete_neuron'),
)

# Node access
urlpatterns += patterns('catmaid.control.node',
    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/reviewed$', 'update_location_reviewer'),
    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/confidence/update$', 'update_confidence'),
    (r'^(?P<project_id>\d+)/node/most_recent$', 'most_recent_treenode'),
    (r'^(?P<project_id>\d+)/node/nearest$', 'node_nearest'),
    (r'^(?P<project_id>\d+)/node/update$', 'node_update'),
    (r'^(?P<project_id>\d+)/node/list$', 'node_list_tuples'),
    (r'^(?P<project_id>\d+)/node/previous_branch_or_root$', 'find_previous_branchnode_or_root'),
    (r'^(?P<project_id>\d+)/node/next_branch_or_end$', 'find_next_branchnode_or_end'),
    (r'^(?P<project_id>\d+)/node/get_location$', 'get_location'),
    (r'^(?P<project_id>\d+)/node/user-info$', 'user_info'),
)

# Treenode access
urlpatterns += patterns('catmaid.control.treenode',
    (r'^(?P<project_id>\d+)/treenode/create$', 'create_treenode'),
    (r'^(?P<project_id>\d+)/treenode/create/interpolated$', 'create_interpolated_treenode'),
    (r'^(?P<project_id>\d+)/treenode/delete$', 'delete_treenode'),
    (r'^(?P<project_id>\d+)/treenode/info$', 'treenode_info'),
    (r'^(?P<project_id>\d+)/treenode/(?P<treenode_id>\d+)/parent$', 'update_parent'),
    (r'^(?P<project_id>\d+)/treenode/(?P<treenode_id>\d+)/radius$', 'update_radius'),
)

# General skeleton access
urlpatterns += patterns('catmaid.control.skeleton',
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/node_count$', 'node_count'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuronname$', 'neuronname'),
    (r'^(?P<project_id>\d+)/skeleton/neuronnames$', 'neuronnames'),
    (r'^(?P<project_id>\d+)/skeleton/node/(?P<treenode_id>\d+)/node_count$', 'node_count'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-own$', 'reset_own_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/connectivity$', 'skeleton_info_raw'),
    (r'^(?P<project_id>\d+)/skeleton/review-status$', 'review_status'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/statistics$', 'skeleton_statistics'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/contributor_statistics$', 'contributor_statistics'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/openleaf$', 'last_openleaf'),
    (r'^(?P<project_id>\d+)/skeleton/split$', 'split_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/get-root$', 'root_for_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/ancestry$', 'skeleton_ancestry'),
    (r'^(?P<project_id>\d+)/skeleton/join$', 'join_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/reroot$', 'reroot_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/permissions$',
            'get_skeleton_permissions'),
    (r'^(?P<project_id>\d+)/skeleton/join_interpolated$', 'join_skeletons_interpolated'),
    (r'^(?P<project_id>\d+)/skeleton/annotationlist$', 'annotation_list'),
    (r'^(?P<project_id>\d+)/skeleton/list$', 'list_skeletons'),
)

# Skeleton export
urlpatterns += patterns('catmaid.control.skeletonexport',
    (r'^(?P<project_id>\d+)/neuroml/neuroml_level3_v181$', 'export_neuroml_level3_v181'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', 'skeleton_swc'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuroml$', 'skeletons_neuroml'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', 'skeleton_with_metadata'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/compact-json$', 'skeleton_for_3d_viewer'),
    (r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-skeleton$', 'compact_skeleton'),
    (r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_nodes>\d)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-arbor$', 'compact_arbor'),
    (r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_nodes>\d)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-arbor-with-minutes$', 'compact_arbor_with_minutes'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review$', 'export_review_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/reviewed-nodes$', 'export_skeleton_reviews'),
    (r'^(?P<project_id>\d+)/skeletons/measure$', 'measure_skeletons'),
    (r'^(?P<project_id>\d+)/skeleton/connectors-by-partner$', 'skeleton_connectors_by_partner'),
    (r'^(?P<project_id>\d+)/skeletons/within-spatial-distance$', 'within_spatial_distance'),
    (r'^(?P<project_id>\d+)/skeletons/partners-by-connector$', 'partners_by_connector'),
)

# Skeleton group access
urlpatterns += patterns('catmaid.control.skeletongroup',
    (r'^(?P<project_id>\d+)/skeletongroup/adjacency_matrix$', 'adjacency_matrix'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_subgraph', 'skeletonlist_subgraph'),
    (r'^(?P<project_id>\d+)/skeletongroup/all_shared_connectors', 'all_shared_connectors'),
)

# Object tree
urlpatterns += patterns('catmaid.control.tree',
    (r'^(?P<project_id>\d+)/object-tree/expand$', 'tree_object_expand'),
    (r'^(?P<project_id>\d+)/object-tree/list', 'tree_object_list'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/get-all-skeletons', 'objecttree_get_all_skeletons'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/(?P<node_type>\w+)/(?P<threshold>\d+)/get-skeletons', 'collect_skeleton_ids'),
    (r'^(?P<project_id>\d+)/object-tree/instance-operation$', 'instance_operation'),
    (r'^(?P<project_id>\d+)/object-tree/group/(?P<group_id>\d+)/remove-empty-neurons$', 'remove_empty_neurons'),
)

# Treenode and Connector image stack archive export
urlpatterns += patterns('catmaid.control.treenodeexport',
    (r'^(?P<project_id>\d+)/connectorarchive/export$', 'export_connectors'),
    (r'^(?P<project_id>\d+)/treenodearchive/export$', 'export_treenodes'),
)

# Cropping
urlpatterns += patterns('catmaid.control.cropping',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/crop/(?P<x_min>%s),(?P<x_max>%s)/(?P<y_min>%s),(?P<y_max>%s)/(?P<z_min>%s),(?P<z_max>%s)/(?P<zoom_level>\d+)/(?P<single_channel>[0|1])/$' % (intlist, num, num, num, num, num, num), 'crop'),
    (r'^crop/download/(?P<file_path>.*)/$', 'download_crop')
)

# Tagging
urlpatterns += patterns('catmaid.control.project',
    (r'^(?P<project_id>\d+)/tags/list$', 'list_project_tags'),
    (r'^(?P<project_id>\d+)/tags/clear$', 'update_project_tags'),
    (r'^(?P<project_id>\d+)/tags/(?P<tags>.*)/update$', 'update_project_tags'),
)
urlpatterns += patterns('catmaid.control.stack',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/list$', 'list_stack_tags'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/clear$', 'update_stack_tags'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/(?P<tags>.*)/update$', 'update_stack_tags'),
)

# Data views
urlpatterns += patterns('catmaid.control.data_view',
    (r'^dataviews/list$', 'get_available_data_views'),
    (r'^dataviews/default$', 'get_default_properties'),
    (r'^dataviews/show/(?P<data_view_id>\d+)$', 'get_data_view'),
    (r'^dataviews/show/default$', 'get_default_data_view'),
    (r'^dataviews/type/comment$', 'get_data_view_type_comment'),
    (r'^dataviews/type/(?P<data_view_id>\d+)$', 'get_data_view_type'),
)

# Ontologies
urlpatterns += patterns('catmaid.control.ontology',
    (r'^ontology/knownroots$', 'get_known_ontology_roots'),
    (r'^(?P<project_id>%s)/ontology/list$' % (integer),
        'list_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations$' % (integer),
        'get_available_relations'),
    (r'^(?P<project_id>%s)/ontology/relations/add$' % (integer),
        'add_relation_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/rename$' % (integer),
        'rename_relation'),
    (r'^(?P<project_id>%s)/ontology/relations/remove$' % (integer),
        'remove_relation_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/removeall$' % (integer),
        'remove_all_relations_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/list$' % (integer),
        'list_available_relations'),
    (r'^(?P<project_id>%s)/ontology/classes$' % (integer),
        'get_available_classes'),
    (r'^(?P<project_id>%s)/ontology/classes/add$' % (integer),
        'add_class_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/rename$' % (integer),
        'rename_class'),
    (r'^(?P<project_id>%s)/ontology/classes/remove$' % (integer),
        'remove_class_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/removeall$' % (integer),
        'remove_all_classes_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/list$' % (integer),
        'list_available_classes'),
    (r'^(?P<project_id>%s)/ontology/links/add$' % (integer),
        'add_link_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/remove$' % (integer),
        'remove_link_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/removeselected$' % (integer),
        'remove_selected_links_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/removeall$' % (integer),
        'remove_all_links_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/restrictions/add$' % (integer),
        'add_restriction'),
    (r'^(?P<project_id>%s)/ontology/restrictions/remove$' % (integer),
        'remove_restriction'),
    (r'^(?P<project_id>%s)/ontology/restrictions/(?P<restriction>[^/]*)/types$' % (integer),
        'get_restriction_types'),
)

# Classification
urlpatterns += patterns('catmaid.control.classification',
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/number$'.format(integer),
        'get_classification_number'),
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/show$'.format(integer),
        'show_classification_editor'),
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/show/(?P<link_id>\d+)$'.format(integer),
        'show_classification_editor'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/select$'.format(integer),
        'select_classification_graph', name='select_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/setup/test$'.format(integer),
        'check_classification_setup_view', name='test_classification_setup'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/setup/rebuild$'.format(integer),
        'rebuild_classification_setup_view', name='rebuild_classification_setup'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/new$'.format(integer),
        'add_classification_graph', name='add_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/list$'.format(integer),
        'list_classification_graph', name='list_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/list/(?P<link_id>\d+)$'.format(integer),
        'list_classification_graph', name='list_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/(?P<link_id>\d+)/remove$'.format(integer),
        'remove_classification_graph', name='remove_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/instance-operation$'.format(integer),
        'classification_instance_operation',
        name='classification_instance_operation'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/(?P<link_id>\d+)/autofill$'.format(integer),
        'autofill_classification_graph', name='autofill_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/link$'.format(integer),
        'link_classification_graph', name='link_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/stack/(?P<stack_id>{0})/linkroi/(?P<ci_id>{0})/$'.format(integer),
        'link_roi_to_classification', name='link_roi_to_classification'),
    url(r'^classification/(?P<workspace_pid>{0})/export$'.format(integer),
        'export', name='export_classification'),
    url(r'^classification/(?P<workspace_pid>{0})/export/excludetags/(?P<exclusion_tags>{1})/$'.format(integer, wordlist),
        'export', name='export_classification'),
    url(r'^classification/(?P<workspace_pid>{0})/search$'.format(integer),
        'search', name='search_classifications'),
    url(r'^classification/(?P<workspace_pid>{0})/export_ontology$'.format(integer),
        'export_ontology', name='export_ontology'),
)

# Notifications
urlpatterns += patterns('catmaid.control.notifications',
    (r'^(?P<project_id>\d+)/notifications/list$', 'list_notifications'),
    (r'^(?P<project_id>\d+)/changerequest/approve$', 'approve_change_request'),
    (r'^(?P<project_id>\d+)/changerequest/reject$', 'reject_change_request'),
)

# Regions of interest
urlpatterns += patterns('catmaid.control.roi',
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/info$'.format(integer),
        'get_roi_info', name='get_roi_info'),
    url(r'^(?P<project_id>{0})/roi/link/(?P<relation_id>{0})/stack/(?P<stack_id>{0})/ci/(?P<ci_id>{0})/$'.format(integer),
        'link_roi_to_class_instance', name='link_roi_to_class_instance'),
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/remove$'.format(integer),
        'remove_roi_link', name='remove_roi_link'),
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/image$'.format(integer),
        'get_roi_image', name='get_roi_image'),
    url(r'^(?P<project_id>{0})/roi/add$'.format(integer),
        'add_roi', name='add_roi'),
)

# Clustering
urlpatterns += patterns('catmaid.control.clustering',
    url(r'^clustering/(?P<workspace_pid>{0})/setup$'.format(integer),
        'setup_clustering', name="clustering_setup"),
    url(r'^clustering/(?P<workspace_pid>{0})/show$'.format(integer),
        TemplateView.as_view(template_name="catmaid/clustering/display.html"),
        name="clustering_display"),
)

# Front-end tests
urlpatterns += patterns('',
    url(r'^tests$', login_required(CatmaidView.as_view(template_name="catmaid/tests.html")), name="frontend_tests"),
)

# Collection of various parts of the CATMAID API. These methods are usually
# one- or two-liners and having them in a separate statement would not improve
# readability. Therefore, they are all declared in this general statement.
urlpatterns += patterns('catmaid.control',
    # User analytics and proficiency
    (r'^useranalytics$', 'useranalytics.plot_useranalytics'),
    (r'^(?P<project_id>\d+)/userproficiency$', 'user_evaluation.evaluate_user'),

    (r'^(?P<project_id>\d+)/exportwidget$', ExportWidgetView.as_view() ),

    (r'^(?P<project_id>\d+)/graphexport/json$', 'graphexport.export_jsongraph' ),

    # Graphs
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_confidence_compartment_subgraph', 'graph2.skeleton_graph'),

    # Circles
    (r'^(?P<project_id>\d+)/graph/circlesofhell', 'circles.circles_of_hell'),
    (r'^(?P<project_id>\d+)/graph/directedpaths', 'circles.find_directed_paths'),

    # Analytics
    (r'^(?P<project_id>\d+)/skeleton/analytics$', 'analytics.analyze_skeletons'),

    # Review
    (r'^(?P<project_id>\d+)/user/reviewer-whitelist$', 'review.reviewer_whitelist'),

    # Search
    (r'^(?P<project_id>\d+)/search$', 'search.search'),

    # Wiring diagram export
    (r'^(?P<project_id>\d+)/wiringdiagram/json$', 'wiringdiagram.export_wiring_diagram'),
    (r'^(?P<project_id>\d+)/wiringdiagram/nx_json$', 'wiringdiagram.export_wiring_diagram_nx'),

    # Annotation graph export
    (r'^(?P<project_id>\d+)/annotationdiagram/nx_json$', 'object.convert_annotations_to_networkx'),

    # Treenode table
    (r'^(?P<project_id>\d+)/treenode/table/list$', 'treenodetable.list_treenode_table'),
    (r'^(?P<project_id>\d+)/treenode/table/update$', 'treenodetable.update_treenode_table'),
)

# Patterns for FlyTEM access
urlpatterns += patterns('catmaid.control.flytem',
    (r'^flytem/projects$', 'project.projects'),
    (r'^flytem/(?P<project_id>.+)/stack/(?P<stack_id>.+)/info$', 'stack.stack_info'),
    (r'^flytem/(?P<project_id>.+)/stacks$', 'stack.stacks'),
)
