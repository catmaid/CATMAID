from django.conf.urls.defaults import patterns
from django.conf import settings

# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()

# A regular expression matiching floating point and integer numbers
num = r'[-+]?[0-9]*\.?[0-9]+'
# A regular expression matching lists of integers with comma as delimiter
intlist = r'[0-9]+(,[0-9]+)*'
# Matches a lists of integers or floating point numbers with comma as delimiter
numlist = r'%s(,%s)*' % (num, num)

urlpatterns = patterns(
    '',
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
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', 'vncbrowser.views.skeleton_swc'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', 'vncbrowser.views.skeleton_json'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neurohdf$', 'vncbrowser.views.skeleton_neurohdf'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review$', 'vncbrowser.views.export_review_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/info$', 'vncbrowser.views.skeleton_info'),

    (r'^(?P<project_id>\d+)/skeleton-for-treenode/(?P<treenode_id>\d+)/swc$', 'vncbrowser.views.skeleton_swc'),
    (r'^(?P<project_id>\d+)/neuron-to-skeletons/(?P<neuron_id>\d+)$', 'vncbrowser.views.neuron_to_skeletons'),
    (r'^login$', 'vncbrowser.views.login'),
    (r'^projects$', 'vncbrowser.views.projects'),
    (r'^(?P<project_id>\d+)/labels-all$', 'vncbrowser.views.labels_all'),
    (r'^(?P<project_id>\d+)/labels-for-nodes$', 'vncbrowser.views.labels_for_nodes'),
    (r'^(?P<project_id>\d+)/labels-for-node/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'vncbrowser.views.labels_for_node'),
    (r'^(?P<project_id>\d+)/label-update/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'vncbrowser.views.label_update'),

    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/reviewed$', 'vncbrowser.views.update_location_reviewer'),

    (r'^(?P<project_id>\d+)/objecttree/(?P<node_id>\d+)/get_all_skeletons', 'vncbrowser.views.objecttree_get_all_skeletons'),

    (r'^user-list$', 'vncbrowser.views.user_list'),
    (r'^(?P<project_id>\d+)/root-for-skeleton/(?P<skeleton_id>\d+)$', 'vncbrowser.views.root_for_skeleton'),
    (r'^(?P<project_id>\d+)/stats$', 'vncbrowser.views.stats'),
    (r'^(?P<project_id>\d+)/stats-summary$', 'vncbrowser.views.stats_summary'),
    (r'^(?P<project_id>\d+)/node-list$', 'vncbrowser.views.node_list'),
    (r'^(?P<project_id>\d+)/multiple-presynaptic-terminals$', 'vncbrowser.views.multiple_presynaptic_terminals'),
    (r'^(?P<project_id>\d+)/go-to/connector/(?P<connector_id>\d+)/stack/(?P<stack_id>\d+)$', 'vncbrowser.views.goto_connector'),
    (r'^(?P<project_id>\d+)/microcircuit/neurohdf$', 'vncbrowser.views.microcircuit_neurohdf'),
    (r'^(?P<project_id>\d+)/wiringdiagram/json$', 'vncbrowser.views.export_wiring_diagram'),
    (r'^(?P<project_id>\d+)/wiringdiagram/nx_json$', 'vncbrowser.views.export_wiring_diagram_nx'),
    (r'^(?P<project_id>\d+)/annotationdiagram/nx_json$', 'vncbrowser.views.convert_annotations_to_networkx'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/info$', 'vncbrowser.views.stack_info'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/models$', 'vncbrowser.views.stack_models'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tile$', 'vncbrowser.views.get_tile'),
    (r'^(?P<project_id>\d+)/skeleton/split', 'vncbrowser.views.split_skeleton'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put_tile$', 'vncbrowser.views.put_tile')
    )

# Cropping
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/crop/(?P<x_min>%s),(?P<x_max>%s)/(?P<y_min>%s),(?P<y_max>%s)/(?P<z_min>%s),(?P<z_max>%s)/(?P<zoom_level>\d+)/$' % (intlist, num, num, num, num, num, num), 'vncbrowser.views.crop'),
    (r'^crop/download/(?P<file_path>.*)/$', 'vncbrowser.views.download_crop')
    )

# Replacements
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/(?P<node>\d+)/confidence/update$', 'vncbrowser.views.catmaid_replacements.update_confidence'),
    (r'^(?P<project_id>\d+)/connector/create$', 'vncbrowser.views.catmaid_replacements.create_connector'),
    (r'^(?P<project_id>\d+)/connector/delete$', 'vncbrowser.views.catmaid_replacements.delete_connector'),
    (r'^(?P<project_id>\d+)/connector/list$', 'vncbrowser.views.catmaid_replacements.list_connector'),
    (r'^(?P<project_id>\d+)/skeleton/ancestry$', 'vncbrowser.views.catmaid_replacements.skeleton_ancestry'),
    (r'^(?P<project_id>\d+)/link/create$', 'vncbrowser.views.catmaid_replacements.create_link'),
    (r'^(?P<project_id>\d+)/link/delete$', 'vncbrowser.views.catmaid_replacements.delete_link'),
    (r'^(?P<project_id>\d+)/node/most_recent$', 'vncbrowser.views.catmaid_replacements.most_recent_treenode'),
    (r'^(?P<project_id>\d+)/node/nearest$', 'vncbrowser.views.catmaid_replacements.node_nearest'),
    (r'^(?P<project_id>\d+)/node/update$', 'vncbrowser.views.catmaid_replacements.node_update'),
    (r'^(?P<project_id>\d+)/textlabels$', 'vncbrowser.views.catmaid_replacements.textlabels'),
    (r'^(?P<project_id>\d+)/textlabel/create$', 'vncbrowser.views.catmaid_replacements.create_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/delete$', 'vncbrowser.views.catmaid_replacements.delete_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/update$', 'vncbrowser.views.catmaid_replacements.update_textlabel'),
    (r'^(?P<project_id>\d+)/tree_object/expand$', 'vncbrowser.views.catmaid_replacements.tree_object_expand'),
    (r'^(?P<project_id>\d+)/tree_object/list$', 'vncbrowser.views.catmaid_replacements.tree_object_list'),
    (r'^(?P<project_id>\d+)/logs/list$', 'vncbrowser.views.catmaid_replacements.list_logs'),
    (r'^(?P<project_id>\d+)/search$', 'vncbrowser.views.catmaid_replacements.search'),
    (r'^messages/unread$', 'vncbrowser.views.catmaid_replacements.unread_messages'),
    (r'^messages/mark_read$', 'vncbrowser.views.catmaid_replacements.read_message'),
    (r'^permissions$', 'vncbrowser.views.authentication.user_project_permissions'),
    (r'^(?P<project_id>\d+)/instance_operation$', 'vncbrowser.views.tree_operations.instance_operation'),
    (r'^(?P<project_id>\d+)/treenode/create$', 'vncbrowser.views.treenode.create_treenode'),
    (r'^(?P<project_id>\d+)/treenode/create/interpolated$', 'vncbrowser.views.treenode.create_interpolated_treenode'),
    (r'^(?P<project_id>\d+)/treenode/delete$', 'vncbrowser.views.treenode.delete_treenode'),
    (r'^(?P<project_id>\d+)/treenode/link$', 'vncbrowser.views.treenode.link_treenode'),
    (r'^(?P<project_id>\d+)/treenode/reroot$', 'vncbrowser.views.treenode.reroot_treenode'),
    (r'^(?P<project_id>\d+)/treenode/table/list$', 'vncbrowser.views.treenode.list_treenode_table'),
    (r'^(?P<project_id>\d+)/treenode/table/update$', 'vncbrowser.views.treenode.update_treenode_table'),
    (r'^(?P<project_id>\d+)/treenode/info$', 'vncbrowser.views.treenode.treenode_info')
    )

# Thumbnailing
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/thumbnail/(?P<x_min>%s),(?P<x_max>%s)/(?P<y_min>%s),(?P<y_max>%s)/(?P<z_min>%s),(?P<z_max>%s)/(?P<zoom_level>\d+)/(?P<tissue>.*)/(?P<metadata>.*)/$' % (intlist, num, num, num, num, num, num), 'vncbrowser.views.make_thumbnail' )
    )

# Tile processing
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/adj/(?P<adjustable_stack>[0|1])/info$', 'vncbrowser.views.stack_info'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/combine_tiles/(?P<section>\d+)/(?P<x>\d+)/(?P<y>\d+)/(?P<zoom_level>\d+)/(?P<intensities>%s)/$' % (intlist, numlist), 'vncbrowser.views.create_tile' )
    )

if settings.DEBUG:
    urlpatterns += patterns('',
                            (r'^static/(?P<path>.*)$',
                             'django.views.static.serve',
                             {'document_root': settings.STATICFILES_LOCAL}))
