from django.conf.urls.defaults import patterns, include, url
from django.conf import settings

# Uncomment the next two lines to enable the admin:
from django.contrib import admin
from adminplus import AdminSitePlus
admin.site = AdminSitePlus()
admin.autodiscover()

# A regular expression matching floating point and integer numbers
num = r'[-+]?[0-9]*\.?[0-9]+'
# A regular expression matching lists of integers with comma as delimiter
intlist = r'[0-9]+(,[0-9]+)*'

# Neuron Catalog
urlpatterns = patterns('',
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

    (r'^(?P<project_id>\d+)/skeletonlist/save$', 'catmaid.control.save_skeletonlist'),
    (r'^(?P<project_id>\d+)/skeletonlist/load$', 'catmaid.control.load_skeletonlist'),

    (r'^(?P<project_id>\d+)/skeletongroup/adjacency_matrix$', 'catmaid.control.adjacency_matrix'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_subgraph', 'catmaid.control.skeletonlist_subgraph'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_confidence_compartment_subgraph', 'catmaid.control.skeletonlist_confidence_compartment_subgraph'),
    (r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_edgecount_compartment_subgraph', 'catmaid.control.skeletonlist_edgecount_compartment_subgraph'),
    (r'^(?P<project_id>\d+)/skeletongroup/all_shared_connectors', 'catmaid.control.all_shared_connectors'),


    # Segmentation tool
    (r'^(?P<project_id>\d+)/assembly/create-assembly-and-neuron$', 'catmaid.control.create_assembly_and_neuron'),
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
    (r'^(?P<project_id>\d+)/skeleton/node/(?P<treenode_id>\d+)/node_count$', 'catmaid.control.node_count'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', 'catmaid.control.skeleton_swc'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', 'catmaid.control.skeleton_json'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neurohdf$', 'catmaid.control.skeleton_neurohdf'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review$', 'catmaid.control.export_review_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-all$', 'catmaid.control.reset_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-own$', 'catmaid.control.reset_own_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-others$', 'catmaid.control.reset_other_reviewer_ids'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/info$', 'catmaid.control.skeleton_info_raw'),
    (r'^(?P<project_id>\d+)/skeleton/split$', 'catmaid.control.split_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/get-root$', 'catmaid.control.root_for_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/ancestry$', 'catmaid.control.skeleton_ancestry'),
    (r'^(?P<project_id>\d+)/skeleton/join$', 'catmaid.control.join_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/join_interpolated$', 'catmaid.control.join_skeletons_interpolated'),
    (r'^(?P<project_id>\d+)/skeleton/reroot$', 'catmaid.control.reroot_skeleton'),

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

if settings.DEBUG:
    urlpatterns += patterns('',
                            (r'^static/(?P<path>.*)$',
                             'django.views.static.serve',
                             {'document_root': settings.STATICFILES_LOCAL}))
