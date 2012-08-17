from django.conf.urls.defaults import patterns, include, url
from django.conf import settings

# Uncomment the next two lines to enable the admin:
from django.contrib import admin
admin.autodiscover()

# A regular expression matiching floating point and integer numbers
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

    (r'^login$', 'catmaid2.control.login'),
    (r'^projects$', 'catmaid2.control.projects'),
    (r'^user-list$', 'catmaid2.control.user_list'),
    (r'^permissions$', 'catmaid2.control.user_project_permissions'),
    (r'^messages/unread$', 'catmaid2.control.unread_messages'),
    (r'^messages/mark_read$', 'catmaid2.control.read_message'),

    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', 'catmaid2.control.skeleton_swc'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', 'catmaid2.control.skeleton_json'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neurohdf$', 'catmaid2.control.skeleton_neurohdf'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review$', 'catmaid2.control.export_review_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/info$', 'catmaid2.control.skeleton_info'),
    (r'^(?P<project_id>\d+)/skeleton/split', 'catmaid2.control.split_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/get-root$', 'catmaid2.control.root_for_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/ancestry$', 'catmaid2.control.skeleton_ancestry'),
    (r'^(?P<project_id>\d+)/skeleton/join$', 'catmaid2.control.join_skeleton'),
    (r'^(?P<project_id>\d+)/skeleton/reroot$', 'catmaid2.control.reroot_skeleton'),

    (r'^(?P<project_id>\d+)/skeleton-for-treenode/(?P<treenode_id>\d+)/swc$', 'vncbrowser.views.skeleton_swc'),
    (r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/get-all-skeletons$', 'catmaid2.control.get_all_skeletons_of_neuron'),

    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/confidence/update$', 'catmaid2.control.update_confidence'),
    (r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/reviewed$', 'catmaid2.control.update_location_reviewer'),
    (r'^(?P<project_id>\d+)/node/most_recent$', 'catmaid2.control.most_recent_treenode'),
    (r'^(?P<project_id>\d+)/node/nearest$', 'catmaid2.control.node_nearest'),
    (r'^(?P<project_id>\d+)/node/update$', 'catmaid2.control.node_update'),

    (r'^(?P<project_id>\d+)/labels-all$', 'catmaid2.control.views.labels_all'),
    (r'^(?P<project_id>\d+)/labels-for-nodes$', 'catmaid2.control.views.labels_for_nodes'),
    (r'^(?P<project_id>\d+)/labels-for-node/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'catmaid2.control.views.labels_for_node'),
    (r'^(?P<project_id>\d+)/label-update/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)$', 'catmaid2.control.views.label_update'),

    (r'^(?P<project_id>\d+)/object-tree/expand$', 'catmaid2.control.tree_object_expand'),
    (r'^(?P<project_id>\d+)/object-tree/(?P<node_id>\d+)/get_all_skeletons', 'catmaid2.control.objecttree_get_all_skeletons'),
    (r'^(?P<project_id>\d+)/object-tree/instance-operation$', 'catmaid2.control.instance_operation'),

    (r'^(?P<project_id>\d+)/link/create$', 'catmaid2.control.create_link'),
    (r'^(?P<project_id>\d+)/link/delete$', 'catmaid2.control.delete_link'),

    (r'^(?P<project_id>\d+)/textlabel/create$', 'catmaid2.control.create_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/delete$', 'catmaid2.control.delete_textlabel'),
    (r'^(?P<project_id>\d+)/textlabel/update$', 'catmaid2.control.update_textlabel'),

    (r'^(?P<project_id>\d+)/logs/list$', 'catmaid2.control.list_logs'),
    (r'^(?P<project_id>\d+)/search$', 'catmaid2.control.search'),
    (r'^(?P<project_id>\d+)/stats$', 'catmaid2.control.stats'),
    (r'^(?P<project_id>\d+)/stats-summary$', 'catmaid2.control.stats_summary'),

    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/info$', 'catmaid2.control.stack_info'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/models$', 'catmaid2.control.stack_models'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tile$', 'catmaid2.control.get_tile'),
    (r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put_tile$', 'catmaid2.control.put_tile'),

    (r'^(?P<project_id>\d+)/wiringdiagram/json$', 'catmaid2.control.export_wiring_diagram'),
    (r'^(?P<project_id>\d+)/wiringdiagram/nx_json$', 'catmaid2.control.export_wiring_diagram_nx'),
    (r'^(?P<project_id>\d+)/annotationdiagram/nx_json$', 'catmaid2.control.convert_annotations_to_networkx'),
    (r'^(?P<project_id>\d+)/microcircuit/neurohdf$', 'catmaid2.control.microcircuit_neurohdf'),

    (r'^(?P<project_id>\d+)/treenode/create$', 'catmaid2.control.treenode.create_treenode'),
    (r'^(?P<project_id>\d+)/treenode/delete$', 'catmaid2.control.treenode.delete_treenode'),
    (r'^(?P<project_id>\d+)/treenode/info$', 'catmaid2.control.treenode.treenode_info'),
    (r'^(?P<project_id>\d+)/treenode/table/list$', 'catmaid2.control.treenode.list_treenode_table'),
    (r'^(?P<project_id>\d+)/treenode/table/update$', 'catmaid2.control.treenode.update_treenode_table'),

    (r'^(?P<project_id>\d+)/node-list$', 'vncbrowser.views.node_list'),

    )

# Cropping
urlpatterns += patterns('',
    (r'^(?P<project_id>\d+)/stack/(?P<stack_ids>%s)/crop/(?P<x_min>%s),(?P<x_max>%s)/(?P<y_min>%s),(?P<y_max>%s)/(?P<z_min>%s),(?P<z_max>%s)/(?P<zoom_level>\d+)/$' % (intlist, num, num, num, num, num, num), 'catmaid2.control.crop'),
    (r'^crop/download/(?P<file_path>.*)/$', 'catmaid2.control.download_crop')

    )

urlpatterns += patterns('',
    # Uncomment the next line to enable the admin:
    url(r'^admin/', include(admin.site.urls))
    )

if settings.DEBUG:
    urlpatterns += patterns('',
                            (r'^static/(?P<path>.*)$',
                             'django.views.static.serve',
                             {'document_root': settings.STATICFILES_LOCAL}))
