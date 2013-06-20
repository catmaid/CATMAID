from django.conf.urls.defaults import patterns, include, url
from django.conf import settings
from django.views.generic import TemplateView

from catmaid.views import *

# Uncomment the next two lines to enable the admin:
from django.contrib import admin
from adminplus import AdminSitePlus
admin.site = AdminSitePlus()
admin.autodiscover()

# A regular expression matching floating point and integer numbers
num = r'[-+]?[0-9]*\.?[0-9]+'
integer = r'[-+]?[0-9]+'
# A regular expression matching lists of integers with comma as delimiter
intlist = r'[0-9]+(,[0-9]+)*'

# Add the main index.html page at the root:
urlpatterns = patterns('',
    (r'^$', HomepageView.as_view()))

# Neuron Catalog
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/multiple-presynaptic-terminals$', 'vncbrowser.views.multiple_presynaptic_terminals'),
    (r'^(?P<project_id>\d+)/go-to/connector/(?P<connector_id>\d+)/stack/(?P<stack_id>\d+)$', 'vncbrowser.views.goto_connector'),

    (r'^(?P<project_id>\d+)$', 'vncbrowser.views.index'),
    (r'^(?P<project_id>\d+)/sorted/(?P<order_by>[^/]+)$', 'vncbrowser.views.index'),
    (r'^(?P<project_id>\d+)/view/(?P<neuron_id>\d+)$', 'vncbrowser.views.view'),
    (r'^(?P<project_id>\d+)/view/(?P<neuron_name>.*)$', 'vncbrowser.views.view'),
    (r'^neuron/set_cell_body$', 'vncbrowser.views.set_cell_body'),
    (r'^(?P<project_id>\d+)/lines/add$', 'vncbrowser.views.lines_add'),
    (r'^(?P<project_id>\d+)/line/(?P<line_id>\d+)$', 'vncbrowser.views.line'),
    (r'^(?P<project_id>\d+)/lines/delete$', 'vncbrowser.views.lines_delete'),
    (r'^(?P<project_id>\d+)/visual_index$', 'vncbrowser.views.visual_index'),
    (r'^(?P<project_id>\d+)/visual_index(/find/(?P<search>[^/]*))?(/sorted/(?P<order_by>[^/]*))?(/cell_body_location/(?P<cell_body_location>[^/]*))?(/page/(?P<page>[0-9]*))?$', 'vncbrowser.views.visual_index'),
)

# Django CATMAID API
urlpatterns += patterns(
    '',
    
    (r'^login$', 'catmaid.control.login_vnc'),
    (r'^accounts/login$', 'catmaid.control.login_user'),
    (r'^accounts/logout$', 'catmaid.control.logout_user'),
    (r'^accounts/(?P<project_id>\d+)/all-usernames$', 'catmaid.control.all_usernames'),

    (r'^projects$', 'catmaid.control.projects'),
    (r'^user-list$', 'catmaid.control.user_list'),
    (r'^permissions$', 'catmaid.control.user_project_permissions'),
    (r'^messages/list$', 'catmaid.control.list_messages'),
    (r'^messages/mark_read$', 'catmaid.control.read_message'),
    (r'^(?P<project_id>\d+)/stacks$', 'catmaid.control.stacks'),

    (r'^(?P<project_id>\d+)/skeletonlist/save$', 'catmaid.control.save_skeletonlist'),
    (r'^(?P<project_id>\d+)/skeletonlist/load$', 'catmaid.control.load_skeletonlist'),

    # Views
    (r'^useranalytics$', 'catmaid.control.plot_useranalytics'),
    (r'^(?P<project_id>\d+)/exportwidget$', ExportWidgetView.as_view() ),
    (r'^(?P<project_id>\d+)/statisticswidget$', ProjectStatisticsWidgetView.as_view() ),

    (r'^(?P<project_id>\d+)/graphexport/summary-statistics/csv$', 'catmaid.control.graphexport.summary_statistics' ),
    (r'^(?P<project_id>\d+)/graphexport/nx_json$', 'catmaid.control.graphexport.export_nxjsgraph' ),
    (r'^(?P<project_id>\d+)/graphexport/graphml$', 'catmaid.control.graphexport.export_graphml' ),
        

    (r'^(?P<project_id>\d+)/skeletongroup/adjacency_matrix$', 'catmaid.control.adjacency_matrix'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_subgraph', 'catmaid.control.skeletonlist_subgraph'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_confidence_compartment_subgraph', 'catmaid.control.skeleton_graph'),
    (r'^(?P<project_id>\d+)/skeletongroup/all_shared_connectors', 'catmaid.control.all_shared_connectors'),


    # Segmentation tool
    (r'^(?P<project_id>\d+)/assembly/create-assembly-and-neuron$', 'catmaid.control.create_assembly_and_neuron'),
    (r'^(?P<project_id>\d+)/assembly/(?P<assembly_id>\d+)/neuronname$', 'catmaid.control.update_assembly_neuronname'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/assembly/save$', 'catmaid.control.save_assembly'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slice-info$', 'catmaid.control.slice_info'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slices-cog$', 'catmaid.control.slices_cog'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slices-tiles$', 'catmaid.control.get_slices_tiles'),
    
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slices-at-location$', 'catmaid.control.slices_at_location'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slice$', 'catmaid.control.get_slice'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slice/delete-slice-from-assembly$', 'catmaid.control.delete_slice_from_assembly'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slice/contour$', 'catmaid.control.slice_contour'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slice/contour-highres$', 'catmaid.control.slice_contour_highres'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/segments-for-slice-right$', 'catmaid.control.segments_for_slice_right'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/segments-for-slice-left$', 'catmaid.control.segments_for_slice_left'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/constraint/constraintset-for-segment$', 'catmaid.control.constraintset_for_segment'),
    


    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put-components$', 'catmaid.control.put_components'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slices-of-assembly-for-section$', 'catmaid.control.slices_of_assembly_for_section'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/slices-of-assembly$', 'catmaid.control.slices_of_assembly'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/segments-of-assembly$', 'catmaid.control.segments_of_assembly'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/generate-segmentation-file$', 'catmaid.control.create_segmentation_file'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put-drawing$', 'catmaid.control.put_drawing'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/delete-drawing$', 'catmaid.control.delete_drawing'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/get-saved-drawings-by-component-id$', 'catmaid.control.get_saved_drawings_by_component_id'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/get-saved-drawings-by-view$', 'catmaid.control.get_saved_drawings_by_view'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/get-drawing-enum$', 'catmaid.control.get_drawing_enum'),


    # ------

    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/node_count$', 'catmaid.control.node_count'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuronname$', 'catmaid.control.neuronname'),
    (r'^(?P<project_id>\d+)/skeleton/node/(?P<treenode_id>\d+)/node_count$', 'catmaid.control.node_count'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', 'catmaid.control.skeleton_swc'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuroml$', 'catmaid.control.skeleton_neuroml'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', 'catmaid.control.skeleton_json'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/compact-json$', 'catmaid.control.skeleton_for_3d_viewer'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neurohdf$', 'catmaid.control.skeleton_neurohdf'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review$', 'catmaid.control.export_review_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-all$', 'catmaid.control.reset_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-own$', 'catmaid.control.reset_own_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-others$', 'catmaid.control.reset_other_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/connectivity$', 'catmaid.control.skeleton_info_raw'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/statistics$', 'catmaid.control.skeleton_statistics'),
    (r'^(?P<project_id>\d+)/skeletons/measure$', 'catmaid.control.measure_skeletons'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/openleaf$', 'catmaid.control.last_openleaf'),
    (r'^(?P<project_id>\d+)/skeleton/split$', 'catmaid.control.split_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/get-root$', 'catmaid.control.root_for_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/ancestry$', 'catmaid.control.skeleton_ancestry'),
    (r'^(?P<project_id>\d+)/skeleton/join$', 'catmaid.control.join_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/join_interpolated$', 'catmaid.control.join_skeletons_interpolated'),
    (r'^(?P<project_id>\d+)/skeleton/reroot$', 'catmaid.control.reroot_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/analytics$', 'catmaid.control.analyze_skeletons'),

    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/get-all-skeletons$', 'catmaid.control.get_all_skeletons_of_neuron'),
    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/give-to-user$', 'catmaid.control.give_neuron_to_other_user'),

    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/confidence/update$', 'catmaid.control.update_confidence'),
    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/reviewed$', 'catmaid.control.update_location_reviewer'),
    (r'^(?P<project_id>\d+)/node/most_recent$', 'catmaid.control.most_recent_treenode'),
    (r'^(?P<project_id>\d+)/node/nearest$', 'catmaid.control.node_nearest'),
    (r'^(?P<project_id>\d+)/node/update$', 'catmaid.control.node_update'),
    (r'^(?P<project_id>\d+)/node/list$', 'catmaid.control.node_list_tuples'),
    (r'^(?P<project_id>\d+)/node/previous_branch_or_root$', 'catmaid.control.find_previous_branchnode_or_root'),
    (r'^(?P<project_id>\d+)/node/next_branch_or_end$', 'catmaid.control.find_next_branchnode_or_end'),
    (r'^(?P<project_id>\d+)/node/get_location$', 'catmaid.control.get_location'),
    (r'^(?P<project_id>\d+)/node/user-info$', 'catmaid.control.user_info'),

    (r'^(?P<project_id>\d+)/labels-all$', 'catmaid.control.labels_all'),
    (r'^(?P<project_id>\d+)/labels-for-nodes$', 'catmaid.control.labels_for_nodes'),
    (r'^(?P<project_id>\d+)/labels-for-node/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'catmaid.control.labels_for_node'),
    (r'^(?P<project_id>\d+)/label/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)/update$', 'catmaid.control.label_update'),
    (r'^(?P<project_id>\d+)/label/remove$', 'catmaid.control.label_remove'),

    (r'^(?P<project_id>\d+)/object-tree/expand$', 'catmaid.control.tree_object_expand'),
    (r'^(?P<project_id>\d+)/object-tree/list', 'catmaid.control.tree_object_list'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/get-all-skeletons', 'catmaid.control.objecttree_get_all_skeletons'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/(?P<node_type>\w+)/(?P<threshold>\d+)/get-skeletons', 'catmaid.control.collect_skeleton_ids'),
    (r'^(?P<project_id>\d+)/object-tree/instance-operation$', 'catmaid.control.instance_operation'),
    (r'^(?P<project_id>\d+)/object-tree/group/(?P<group_id>\d+)/remove-empty-neurons$', 'catmaid.control.remove_empty_neurons'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/(?P<node_type>\w+)/send-to-fragments-group', 'catmaid.control.send_to_fragments_group'),

    (r'^(?P<project_id>\d+)/link/create$', 'catmaid.control.create_link'),
    (r'^(?P<project_id>\d+)/link/delete$', 'catmaid.control.delete_link'),

    (r'^(?P<project_id>\d+)/textlabel/create$', 'catmaid.control.create_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/delete$', 'catmaid.control.delete_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/update$', 'catmaid.control.update_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/all', 'catmaid.control.textlabels'),

    (r'^(?P<project_id>\d+)/logs/list$', 'catmaid.control.list_logs'),
    (r'^(?P<project_id>\d+)/search$', 'catmaid.control.search'),
    (r'^(?P<project_id>\d+)/stats$', 'catmaid.control.stats'),
    (r'^(?P<project_id>\d+)/stats-editor$', 'catmaid.control.stats_editor'),
    (r'^(?P<project_id>\d+)/stats-reviewer$', 'catmaid.control.stats_reviewer'),
    (r'^(?P<project_id>\d+)/stats-summary$', 'catmaid.control.stats_summary'),
    (r'^(?P<project_id>\d+)/stats-history$', 'catmaid.control.stats_history'),
    (r'^(?P<project_id>\d+)/stats-user-history$', 'catmaid.control.stats_user_history'),
    
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/info$', 'catmaid.control.stack_info'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/models$', 'catmaid.control.stack_models'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tile$', 'catmaid.control.get_tile'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put_tile$', 'catmaid.control.put_tile'),

    (r'^(?P<project_id>\d+)/wiringdiagram/json$', 'catmaid.control.export_wiring_diagram'),
    (r'^(?P<project_id>\d+)/wiringdiagram/nx_json$', 'catmaid.control.export_wiring_diagram_nx'),
    (r'^(?P<project_id>\d+)/annotationdiagram/nx_json$', 'catmaid.control.convert_annotations_to_networkx'),
    (r'^(?P<project_id>\d+)/microcircuit/neurohdf$', 'catmaid.control.microcircuit_neurohdf'),

    (r'^(?P<project_id>\d+)/treenode/create$', 'catmaid.control.create_treenode'),
    (r'^(?P<project_id>\d+)/treenode/create/interpolated$', 'catmaid.control.create_interpolated_treenode'),
    (r'^(?P<project_id>\d+)/treenode/delete$', 'catmaid.control.delete_treenode'),
    (r'^(?P<project_id>\d+)/treenode/info$', 'catmaid.control.treenode_info'),
    (r'^(?P<project_id>\d+)/treenode/table/list$', 'catmaid.control.list_treenode_table'),
    (r'^(?P<project_id>\d+)/treenode/table/update$', 'catmaid.control.update_treenode_table'),

    (r'^(?P<project_id>\d+)/connector/create$', 'catmaid.control.create_connector'),
    (r'^(?P<project_id>\d+)/connector/delete$', 'catmaid.control.delete_connector'),
    (r'^(?P<project_id>\d+)/connector/table/list$', 'catmaid.control.list_connector'),

    (r'^(?P<project_id>\d+)/connector/list/graphedge$', 'catmaid.control.graphedge_list'),
    (r'^(?P<project_id>\d+)/connector/list/one_to_many$', 'catmaid.control.one_to_many_synapses'),

    )

# Cropping
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/crop/(?P<x_min>%s),(?P<x_max>%s)/(?P<y_min>%s),(?P<y_max>%s)/(?P<z_min>%s),(?P<z_max>%s)/(?P<zoom_level>\d+)/(?P<single_channel>[0|1])/$' % (intlist, num, num, num, num, num, num), 'catmaid.control.crop'),
    (r'^crop/download/(?P<file_path>.*)/$', 'catmaid.control.download_crop')
    )

urlpatterns += patterns('',
    # Uncomment the next line to enable the admin:
    url(r'^admin/', include(admin.site.urls))
    )

# Tagging
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/tags/list$', 'catmaid.control.list_project_tags'),
    (r'^(?P<project_id>\d+)/tags/clear$', 'catmaid.control.update_project_tags'),
    (r'^(?P<project_id>\d+)/tags/(?P<tags>.*)/update$', 'catmaid.control.update_project_tags'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/list$', 'catmaid.control.list_stack_tags'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/clear$', 'catmaid.control.update_stack_tags'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/(?P<tags>.*)/update$', 'catmaid.control.update_stack_tags'),
    )

# Data views
urlpatterns += patterns('',
    (r'^dataviews/list$', 'catmaid.control.get_available_data_views'),
    (r'^dataviews/default$', 'catmaid.control.get_default_properties'),
    (r'^dataviews/show/(?P<data_view_id>\d+)$', 'catmaid.control.get_data_view'),
    (r'^dataviews/show/default$', 'catmaid.control.get_default_data_view'),
    (r'^dataviews/type/comment$', 'catmaid.control.get_data_view_type_comment'),
    )

# Ontologies
urlpatterns += patterns('',
    (r'^ontology/knownroots$', 'catmaid.control.get_known_ontology_roots'),
    (r'^(?P<project_id>%s)/ontology/list$' % (integer),
        'catmaid.control.list_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations$' % (integer),
        'catmaid.control.get_available_relations'),
    (r'^(?P<project_id>%s)/ontology/relations/add$' % (integer),
        'catmaid.control.add_relation_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/remove$' % (integer),
        'catmaid.control.remove_relation_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/removeall$' % (integer),
        'catmaid.control.remove_all_relations_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/relations/list$' % (integer),
        'catmaid.control.list_available_relations'),
    (r'^(?P<project_id>%s)/ontology/classes$' % (integer),
        'catmaid.control.get_available_classes'),
    (r'^(?P<project_id>%s)/ontology/classes/add$' % (integer),
        'catmaid.control.add_class_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/remove$' % (integer),
        'catmaid.control.remove_class_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/removeall$' % (integer),
        'catmaid.control.remove_all_classes_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/classes/list$' % (integer),
        'catmaid.control.list_available_classes'),
    (r'^(?P<project_id>%s)/ontology/links/add$' % (integer),
        'catmaid.control.add_link_to_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/remove$' % (integer),
        'catmaid.control.remove_link_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/removeselected$' % (integer),
        'catmaid.control.remove_selected_links_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/links/removeall$' % (integer),
        'catmaid.control.remove_all_links_from_ontology'),
    (r'^(?P<project_id>%s)/ontology/restrictions/add$' % (integer),
        'catmaid.control.add_restriction'),
    (r'^(?P<project_id>%s)/ontology/restrictions/remove$' % (integer),
        'catmaid.control.remove_restriction'),
    (r'^(?P<project_id>%s)/ontology/restrictions/(?P<restriction>[^/]*)/types$' % (integer),
        'catmaid.control.get_restriction_types'),
    )

# Classification
urlpatterns += patterns('',
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/number$'.format(integer),
        'catmaid.control.get_classification_number'),
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/show$'.format(integer),
        'catmaid.control.show_classification_editor'),
    (r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/show/(?P<link_id>\d+)$'.format(integer),
        'catmaid.control.show_classification_editor'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/select$'.format(integer),
        'catmaid.control.select_classification_graph', name='select_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/setup/test$'.format(integer),
        'catmaid.control.check_classification_setup_view', name='test_classification_setup'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/setup/rebuild$'.format(integer),
        'catmaid.control.rebuild_classification_setup_view', name='rebuild_classification_setup'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/new$'.format(integer),
        'catmaid.control.add_classification_graph', name='add_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/list$'.format(integer),
        'catmaid.control.list_classification_graph', name='list_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/list/(?P<link_id>\d+)$'.format(integer),
        'catmaid.control.list_classification_graph', name='list_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/(?P<link_id>\d+)/remove$'.format(integer),
        'catmaid.control.remove_classification_graph', name='remove_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/instance-operation$'.format(integer),
        'catmaid.control.classification_instance_operation',
        name='classification_instance_operation'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/(?P<link_id>\d+)/autofill$'.format(integer),
        'catmaid.control.autofill_classification_graph', name='autofill_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/link$'.format(integer),
        'catmaid.control.link_classification_graph', name='link_classification_graph'),
    url(r'^(?P<project_id>{0})/classification/(?P<workspace_pid>{0})/stack/(?P<stack_id>{0})/linkroi/(?P<ci_id>{0})/$'.format(integer),
        'catmaid.control.link_roi_to_classification', name='link_roi_to_classification'),
    )

# Notifications
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/notifications/list$', 'catmaid.control.list_notifications'),
    (r'^(?P<project_id>\d+)/changerequest/approve$', 'catmaid.control.approve_change_request'),
    (r'^(?P<project_id>\d+)/changerequest/reject$', 'catmaid.control.reject_change_request'),
    )

# Regions of interest
urlpatterns += patterns('',
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/info$'.format(integer),
        'catmaid.control.get_roi_info', name='get_roi_info'),
    url(r'^(?P<project_id>{0})/roi/link/(?P<relation_id>{0})/stack/(?P<stack_id>{0})/ci/(?P<ci_id>{0})/$'.format(integer),
        'catmaid.control.link_roi_to_class_instance', name='link_roi_to_class_instance'),
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/remove$'.format(integer),
        'catmaid.control.remove_roi_link', name='remove_roi_link'),
    url(r'^(?P<project_id>{0})/roi/(?P<roi_id>{0})/image$'.format(integer),
        'catmaid.control.get_roi_image', name='get_roi_image'),
    )

if settings.DEBUG:
    urlpatterns += patterns('',
        (r'^static/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.STATIC_ROOT}),
        (r'^%s(?P<path>.*)$' % settings.MEDIA_URL.replace(settings.CATMAID_URL, ''),
            'django.views.static.serve', {'document_root': settings.MEDIA_ROOT}),
    )
