# -*- coding: utf-8 -*-

from django.conf import settings
from django.conf.urls import include
from django.urls import re_path
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView
from django.urls import reverse_lazy, path

from rest_framework.decorators import api_view

from catmaid.control import (authentication, user, group, log, message, client,
        common, deeplink, project, stack, stackgroup, tile, tracing, stats,
        annotation, textlabel, label, link, connector,
        neuron, node, treenode, suppressed_virtual_treenode, skeleton,
        skeletonexport, treenodeexport, cropping, data_view, ontology,
        classification, notifications, roi, clustering, volume, noop,
        useranalytics, user_evaluation, search, graphexport, transaction,
        graph2, circles, analytics, review, wiringdiagram, object, sampler,
        similarity, nat, origin, point, landmarks, project_token, pointcloud, pointset)

from catmaid.history import record_request_action as record_view
from catmaid.views import CatmaidView
from catmaid.views.admin import ProjectDeletion


# A regular expression matching floating point and integer numbers
num = r'[-+]?[0-9]*\.?[0-9]+'
integer = r'[-+]?[0-9]+'
# A regular expression matching lists of integers with comma as delimiter
intlist = r'[0-9]+(,[0-9]+)*'
# A list of words, not containing commas
wordlist= r'\w+(,\w+)*'

app_name = 'catmaid'

# Add the main index.html page at the root:
urlpatterns = [
    re_path(r'^$', ensure_csrf_cookie(CatmaidView.as_view(template_name='catmaid/index.html')), name="home"),
    re_path(r'^version$', common.get_catmaid_version),
    re_path(r'^neuroglancer$', ensure_csrf_cookie(CatmaidView.as_view(template_name='catmaid/neuroglancer.html'))),
]

# Additional administration views
urlpatterns += [
    re_path(r'^admin/catmaid/project/delete-with-data$', ProjectDeletion.as_view(),
        name="delete-projects-with-data"),
]

# Authentication and permissions
urlpatterns += [
    re_path(r'^accounts/login$', authentication.login_user),
    re_path(r'^accounts/logout$', authentication.logout_user),
    re_path(r'^accounts/anonymous-api-token$', authentication.get_anonymous_token),
    re_path(r'^accounts/remote-login-api-token$', authentication.get_remote_login_token),
    re_path(r'^accounts/is-remote-login$', authentication.is_remote_login),
    re_path(r'^accounts/(?P<project_id>\d+)/all-usernames$', authentication.all_usernames),
    re_path(r'^permissions$', authentication.user_project_permissions),
    re_path(r'^classinstance/(?P<ci_id>\d+)/permissions$', authentication.get_object_permissions),
    re_path(r'^register$', authentication.register, name="register"),
    path('activate/<uidb64>/<token>/', authentication.activate, name='activate'),
]

# Users
urlpatterns += [
    re_path(r'^user-list$', user.user_list),
    re_path(r'^user-table-list$', user.user_list_datatable),
    re_path(r'^user-profile/update$', user.update_user_profile),
    re_path(r'^user/password_change/$', user.NonAnonymousPasswordChangeView.as_view(
            success_url=reverse_lazy('catmaid:home'), raise_exception=False)),
]

# Groups
urlpatterns += [
    re_path(r'^groups/$', group.GroupList.as_view()),
    re_path(r'^(?P<project_id>\d+)/groups/memberships/$', group.GroupMemberships.as_view()),
]

# Log
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/logs/list$', log.list_logs),
    re_path(r'^log/(?P<level>(info|error|debug))$', log.log_frontent_event),
]

# Transaction history
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/transactions/$', transaction.transaction_collection),
    re_path(r'^(?P<project_id>\d+)/transactions/location$', transaction.get_location),
    re_path(r'^(?P<project_id>\d+)/transactions/skeletons$', transaction.TransactionSkeletonView.as_view()),
]

# Project permissions
urlpatterns += [
    re_path(r'^permissions/$', authentication.list_project_permissions),
    re_path(r'^(?P<project_id>\d+)/permissions/project-user$', authentication.project_user_permission_set),
    re_path(r'^(?P<project_id>\d+)/permissions/project-group$', authentication.project_group_permission_set),
]

# Project permissions
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/project-tokens/$', project_token.ProjectTokenList.as_view()),
    re_path(r'^(?P<project_id>\d+)/user-project-tokens/$', project_token.UserProjectTokenList.as_view()),
    re_path(r'^(?P<project_id>\d+)/project-tokens/revoke$', project_token.ProjectTokenRevoker.as_view()),
    re_path(r'^project-tokens/apply$', project_token.ProjectTokenApplicator.as_view()),
]

# Messages
urlpatterns += [
    re_path(r'^messages/list$', message.list_messages),
    re_path(r'^messages/(?P<message_id>\d+)/mark_read$', message.read_message),
    re_path(r'^messages/latestunreaddate', message.get_latest_unread_date),
]

# CATMAID client datastore and data access
urlpatterns += [
    re_path(r'^client/datastores/$', client.ClientDatastoreList.as_view()),
    re_path(r'^client/datastores/(?P<name>[\w-]+)$', client.ClientDatastoreDetail.as_view()),
    re_path(r'^client/datastores/(?P<name>[\w-]+)/$', client.ClientDataList.as_view()),
]

# General project model access
urlpatterns += [
    re_path(r'^projects/$', project.projects),
    re_path(r'^projects/export$', project.export_projects),
    re_path(r'^(?P<project_id>\d+)/$', project.ProjectDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/interpolatable-sections/$', project.interpolatable_sections),
    re_path(r'^(?P<project_id>\d+)/fork$', project.fork),
    re_path(r'^(?P<project_id>\d+)/favorite$', project.ProjectFavorite.as_view()),
]

# Deep links
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/links/$', deeplink.DeepLinkList.as_view()),
    re_path(r'^(?P<project_id>\d+)/links/(?P<alias>[0-9A-Za-z_\-]+)$', deeplink.DeepLinkSelector.as_view()),
    re_path(r'^(?P<project_id>\d+)/links/(?P<alias>[0-9A-Za-z_\-]+)/details$', deeplink.DeepLinkDetails.as_view()),
    re_path(r'^(?P<project_id>\d+)/links/by-id/(?P<link_id>[0-9]+)$', deeplink.DeepLinkByIdSelector.as_view()),
]

# General stack model access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/stacks$', stack.stacks),
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/info$', stack.stack_info),
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/groups$', stack.stack_groups),
    re_path(r'^(?P<project_id>\d+)/writable-stacks/$', stack.WritableStackListView.as_view()),
    re_path(r'^(?P<project_id>\d+)/writable-stacks/(?P<writable_stack_id>\d+)/write-block$', cropping.write_block),
]

# General stack group access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/stackgroup/(?P<stackgroup_id>\d+)/info$', stackgroup.get_stackgroup_info),
]

# Tile access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tile$', tile.get_tile),
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/put_tile$', tile.put_tile),
]

# Tracing general
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/tracing/setup/rebuild$', tracing.rebuild_tracing_setup_view),
    re_path(r'^(?P<project_id>\d+)/tracing/setup/test$', tracing.check_tracing_setup_view),
    re_path(r'^(?P<project_id>\d+)/tracing/setup/validate$', tracing.validate_tracing_setup),
]

# Reconstruction sampling
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/samplers/$', sampler.list_samplers),
    re_path(r'^(?P<project_id>\d+)/samplers/add$', sampler.add_sampler),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/types/$', sampler.list_domain_types),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/intervals/states/$', sampler.list_interval_states),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/(?P<domain_id>\d+)/details$', sampler.get_domain_details),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/(?P<domain_id>\d+)/intervals/$', sampler.list_domain_intervals),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/(?P<domain_id>\d+)/intervals/add-all$', sampler.add_all_intervals),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/intervals/(?P<interval_id>\d+)/details$', sampler.get_interval_details),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/intervals/(?P<interval_id>\d+)/set-state$', sampler.set_interval_state),
    re_path(r'^(?P<project_id>\d+)/samplers/(?P<sampler_id>\d+)/$', sampler.SamplerDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/samplers/(?P<sampler_id>\d+)/delete$', sampler.delete_sampler),
    re_path(r'^(?P<project_id>\d+)/samplers/(?P<sampler_id>\d+)/domains/$', sampler.list_sampler_domains),
    re_path(r'^(?P<project_id>\d+)/samplers/(?P<sampler_id>\d+)/domains/add$', sampler.add_sampler_domain),
    re_path(r'^(?P<project_id>\d+)/samplers/(?P<sampler_id>\d+)/domains/add-all$', sampler.add_multiple_sampler_domains),
    re_path(r'^(?P<project_id>\d+)/samplers/connectors/$', sampler.list_connectors),
    re_path(r'^(?P<project_id>\d+)/samplers/connectors/states/$', sampler.list_connector_states),
    re_path(r'^(?P<project_id>\d+)/samplers/domains/intervals/(?P<interval_id>\d+)/connectors/(?P<connector_id>\d+)/set-state$',
            sampler.set_connector_state),
    re_path(r'^(?P<project_id>\d+)/samplers/states/$', sampler.list_sampler_states),
]

# Statistics
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/stats/aggregates$', stats.ProjectAggStats.as_view()),
    re_path(r'^(?P<project_id>\d+)/stats/cable-length$', stats.stats_cable_length),
    re_path(r'^(?P<project_id>\d+)/stats/nodecount$', stats.stats_nodecount),
    re_path(r'^(?P<project_id>\d+)/stats/editor$', stats.stats_editor),
    re_path(r'^(?P<project_id>\d+)/stats/summary$', stats.stats_summary),
    re_path(r'^(?P<project_id>\d+)/stats/history$', stats.stats_history),
    re_path(r'^(?P<project_id>\d+)/stats/user-history$', stats.stats_user_history),
    re_path(r'^(?P<project_id>\d+)/stats/user-activity$', stats.stats_user_activity),
    re_path(r'^(?P<project_id>\d+)/stats/server$', stats.ServerStats.as_view()),
]

# Annotations
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/annotations/$', annotation.list_annotations),
    re_path(r'^(?P<project_id>\d+)/annotations/query$', annotation.annotations_for_entities),
    re_path(r'^(?P<project_id>\d+)/annotations/forskeletons$', annotation.annotations_for_skeletons),
    re_path(r'^(?P<project_id>\d+)/annotations/table-list$', annotation.list_annotations_datatable),
    re_path(r'^(?P<project_id>\d+)/annotations/add$', record_view("annotations.add")(annotation.annotate_entities)),
    re_path(r'^(?P<project_id>\d+)/annotations/add-neuron-names$', record_view("annotations.addneuronname")(annotation.add_neuron_name_annotations)),
    re_path(r'^(?P<project_id>\d+)/annotations/remove$', record_view("annotations.remove")(annotation.remove_annotations)),
    re_path(r'^(?P<project_id>\d+)/annotations/replace$', record_view("annotations.replace")(annotation.replace_annotations)),
    re_path(r'^(?P<project_id>\d+)/annotations/(?P<annotation_id>\d+)/remove$', record_view("annotations.remove")(annotation.remove_annotation)),
    re_path(r'^(?P<project_id>\d+)/annotations/query-targets$', annotation.query_annotated_classinstances),
]

# Text labels
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/textlabel/create$', record_view("textlabels.create")(textlabel.create_textlabel)),
    re_path(r'^(?P<project_id>\d+)/textlabel/delete$', record_view("textlabels.delete")(textlabel.delete_textlabel)),
    re_path(r'^(?P<project_id>\d+)/textlabel/update$', record_view("textlabels.update")(textlabel.update_textlabel)),
    re_path(r'^(?P<project_id>\d+)/textlabel/all', textlabel.textlabels),
]

# Treenode labels
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/labels/$', label.labels_all),
    re_path(r'^(?P<project_id>\d+)/labels/detail$', label.labels_all_detail),
    re_path(r'^(?P<project_id>\d+)/labels/stats$', label.get_label_stats),
    re_path(r'^(?P<project_id>\d+)/labels-for-nodes$', label.labels_for_nodes),
    re_path(r'^(?P<project_id>\d+)/labels/(?P<node_type>(treenode|location|connector))/(?P<node_id>\d+)/$', label.labels_for_node),
    re_path(r'^(?P<project_id>\d+)/label/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)/update$', record_view("labels.update")(label.label_update)),
    re_path(r'^(?P<project_id>\d+)/label/(?P<ntype>(treenode|location|connector))/(?P<location_id>\d+)/remove$', record_view("labels.remove")(label.remove_label_link)),
    re_path(r'^(?P<project_id>\d+)/label/remove$', record_view("labels.remove_unused")(label.label_remove)),
]

# Links
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/link/create$', record_view("links.create")(link.create_link)),
    re_path(r'^(?P<project_id>\d+)/link/delete$', record_view("links.remove")(link.delete_link)),
]

# Connector access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/connector/create$', record_view("connectors.create")(connector.create_connector)),
    re_path(r'^(?P<project_id>\d+)/connector/delete$', record_view("connectors.remove")(connector.delete_connector)),
    re_path(r'^(?P<project_id>\d+)/connector/list/graphedge$', connector.graphedge_list),
    re_path(r'^(?P<project_id>\d+)/connector/list/one_to_many$', connector.one_to_many_synapses),
    re_path(r'^(?P<project_id>\d+)/connector/list/many_to_many$', connector.many_to_many_synapses),
    re_path(r'^(?P<project_id>\d+)/connector/list/completed$', connector.list_completed),
    re_path(r'^(?P<project_id>\d+)/connector/list/linked-to-nodes$', connector.connectors_from_treenodes),
    re_path(r'^(?P<project_id>\d+)/connector/skeletons$', connector.connector_skeletons),
    re_path(r'^(?P<project_id>\d+)/connector/edgetimes$', connector.connector_associated_edgetimes),
    re_path(r'^(?P<project_id>\d+)/connector/info$', connector.connectors_info),
    re_path(r'^(?P<project_id>\d+)/connectors/$', connector.list_connectors),
    re_path(r'^(?P<project_id>\d+)/connectors/links/$', connector.list_connector_links),
    re_path(r'^(?P<project_id>\d+)/connectors/link-pairs/$', connector.list_connector_link_pairs),
    re_path(r'^(?P<project_id>\d+)/connectors/(?P<connector_id>\d+)/$',
        connector.connector_detail),
    re_path(r'^(?P<project_id>\d+)/connectors/user-info$', connector.connector_user_info),
    re_path(r'^(?P<project_id>\d+)/connectors/types/$', connector.connector_types),
    re_path(r'^(?P<project_id>\d+)/connectors/in-bounding-box$', connector.connectors_in_bounding_box),
]

# Neuron access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/get-all-skeletons$', neuron.get_all_skeletons_of_neuron),
    re_path(r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/give-to-user$', record_view("neurons.give_to_user")(neuron.give_neuron_to_other_user)),
    re_path(r'^(?P<project_id>\d+)/neuron/(?P<neuron_id>\d+)/delete$', record_view("neurons.remove")(neuron.delete_neuron)),
    re_path(r'^(?P<project_id>\d+)/neurons/(?P<neuron_id>\d+)/rename$', record_view("neurons.rename")(neuron.rename_neuron)),
    re_path(r'^(?P<project_id>\d+)/neurons/$', neuron.list_neurons),
    re_path(r'^(?P<project_id>\d+)/neurons/from-models$', neuron.get_neuron_ids_from_models),
    re_path(r'^(?P<project_id>\d+)/neurons/rename$', neuron.rename_neurons),
    re_path(r'^(?P<project_id>\d+)/neurons/all-skeletons$', neuron.list_all_skeletons),
]

# Node access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/node/(?P<node_id>\d+)/reviewed$', record_view("nodes.add_or_update_review")(node.update_location_reviewer)),
    re_path(r'^(?P<project_id>\d+)/nodes/most-recent$', node.most_recent_treenode),
    re_path(r'^(?P<project_id>\d+)/nodes/location$', node.get_locations),
    re_path(r'^(?P<project_id>\d+)/nodes/nearest$', node.node_nearest),
    re_path(r'^(?P<project_id>\d+)/node/update$', record_view("nodes.update_location")(node.node_update)),
    re_path(r'^(?P<project_id>\d+)/node/list$', node.node_list_tuples),
    re_path(r'^(?P<project_id>\d+)/node/get_location$', node.get_location),
    re_path(r'^(?P<project_id>\d+)/node/user-info$', node.user_info),
    re_path(r'^(?P<project_id>\d+)/nodes/find-labels$', node.find_labels),
    re_path(r'^(?P<project_id>\d+)/nodes/$', api_view(['POST'])(node.node_list_tuples)),
]

# Treenode access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/treenode/create$', record_view("treenodes.create")(treenode.create_treenode)),
    re_path(r'^(?P<project_id>\d+)/treenode/insert$', record_view("treenodes.insert")(treenode.insert_treenode)),
    re_path(r'^(?P<project_id>\d+)/treenode/delete$', record_view("treenodes.remove")(treenode.delete_treenode)),
    re_path(r'^(?P<project_id>\d+)/treenodes/compact-detail$', treenode.compact_detail_list),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/info$', treenode.treenode_info),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/compact-detail$', treenode.compact_detail),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/children$', treenode.find_children),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/confidence$', record_view("treenodes.update_confidence")(treenode.update_confidence)),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/parent$', record_view("treenodes.update_parent")(treenode.update_parent)),
    re_path(r'^(?P<project_id>\d+)/treenode/(?P<treenode_id>\d+)/radius$', record_view("treenodes.update_radius")(treenode.update_radius)),
    re_path(r'^(?P<project_id>\d+)/treenodes/radius$', record_view("treenodes.update_radius")(treenode.update_radii)),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/previous-branch-or-root$', treenode.find_previous_branchnode_or_root),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/next-branch-or-end$', treenode.find_next_branchnode_or_end),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/importing-user$', treenode.importing_user),
]

# Suppressed virtual treenode access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/suppressed-virtual/$',
            record_view("treenodes.suppress_virtual_node", "POST")(suppressed_virtual_treenode.SuppressedVirtualTreenodeList.as_view())),
    re_path(r'^(?P<project_id>\d+)/treenodes/(?P<treenode_id>\d+)/suppressed-virtual/(?P<suppressed_id>\d+)$',
            record_view("treenodes.unsuppress_virtual_node", "DELETE")(suppressed_virtual_treenode.SuppressedVirtualTreenodeDetail.as_view())),
]

# General skeleton access
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/skeletons/$', skeleton.list_skeletons),
    re_path(r'^(?P<project_id>\d+)/skeletons/cable-length$', skeleton.cable_lengths),
    re_path(r'^(?P<project_id>\d+)/skeletons/summary$', skeleton.summary),
    re_path(r'^(?P<project_id>\d+)/skeletons/connectivity-counts$', skeleton.connectivity_counts),
    re_path(r'^(?P<project_id>\d+)/skeletons/completeness$', skeleton.completeness),
    re_path(r'^(?P<project_id>\d+)/skeletons/validity$', skeleton.validity),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/node_count$', skeleton.node_count),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuronname$', skeleton.neuronname),
    re_path(r'^(?P<project_id>\d+)/skeleton/neuronnames$', skeleton.neuronnames),
    re_path(r'^(?P<project_id>\d+)/skeleton/node/(?P<treenode_id>\d+)/node_count$', skeleton.node_count),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/review/reset-own$', record_view("skeletons.reset_own_reviews")(skeleton.reset_own_reviewer_ids)),
    re_path(r'^(?P<project_id>\d+)/skeletons/connectivity$', skeleton.skeleton_info_raw),
    re_path(r'^(?P<project_id>\d+)/skeletons/in-bounding-box$', skeleton.skeletons_in_bounding_box),
    re_path(r'^(?P<project_id>\d+)/skeleton/connectivity_matrix$', skeleton.connectivity_matrix),
    re_path(r'^(?P<project_id>\d+)/skeletons/connectivity_matrix/csv$', skeleton.connectivity_matrix_csv),
    re_path(r'^(?P<project_id>\d+)/skeletons/review-status$', skeleton.review_status),
    re_path(r'^(?P<project_id>\d+)/skeletons/from-origin$', skeleton.from_origin),
    re_path(r'^(?P<project_id>\d+)/skeletons/origin$', skeleton.origin_info),
    re_path(r'^(?P<project_id>\d+)/skeletons/import-info$', skeleton.import_info),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/statistics$', skeleton.skeleton_statistics),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/contributor_statistics$', skeleton.contributor_statistics),
    re_path(r'^(?P<project_id>\d+)/skeleton/contributor_statistics_multiple$', skeleton.contributor_statistics_multiple),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/id$', record_view('skeletons.update_id')(skeleton.SkeletonIdDetails.as_view())),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/find-labels$', skeleton.find_labels),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/open-leaves$', skeleton.open_leaves),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/root$', skeleton.root_for_skeleton),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/sampler-count$', skeleton.sampler_count),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/cable-length$', skeleton.cable_length),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/neuron-details$', skeleton.neurondetails),
    re_path(r'^(?P<project_id>\d+)/skeleton/split$', record_view("skeletons.split")(skeleton.split_skeleton)),
    re_path(r'^(?P<project_id>\d+)/skeleton/ancestry$', skeleton.skeleton_ancestry),
    re_path(r'^(?P<project_id>\d+)/skeleton/join$', record_view("skeletons.merge")(skeleton.join_skeleton)),
    re_path(r'^(?P<project_id>\d+)/skeleton/reroot$', record_view("skeletons.reroot")(skeleton.reroot_skeleton)),
    re_path(r'^(?P<project_id>\d+)/skeletons/sampler-count$', skeleton.list_sampler_count),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/permissions$', skeleton.get_skeleton_permissions),
    re_path(r'^(?P<project_id>\d+)/skeletons/import$', record_view("skeletons.import")(skeleton.import_skeleton)),
    re_path(r'^(?P<project_id>\d+)/skeleton/annotationlist$', skeleton.annotation_list),
    re_path(r'^(?P<project_id>\d+)/skeletons/within-spatial-distance$', skeleton.within_spatial_distance),
    re_path(r'^(?P<project_id>\d+)/skeletons/node-labels$', skeleton.skeletons_by_node_labels),
    re_path(r'^(?P<project_id>\d+)/skeletons/change-history$', skeleton.change_history),
    re_path(r'^(?P<project_id>\d+)/skeletongroup/adjacency_matrix$', skeleton.adjacency_matrix),
    re_path(r'^(?P<project_id>\d+)/skeletongroup/skeletonlist_subgraph', skeleton.skeletonlist_subgraph),
    re_path(r'^(?P<project_id>\d+)/skeletongroup/all_shared_connectors', skeleton.all_shared_connectors),
]

urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/origins/$', origin.OriginCollection.as_view()),
]

# Skeleton export
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/neuroml/neuroml_level3_v181$', skeletonexport.export_neuroml_level3_v181),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/swc$', skeletonexport.skeleton_swc),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/eswc$', skeletonexport.skeleton_eswc),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/neuroml$', skeletonexport.skeletons_neuroml),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/json$', skeletonexport.skeleton_with_metadata),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/compact-json$', skeletonexport.skeleton_for_3d_viewer),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/nrrd$', nat.r.export_nrrd),
    re_path(r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_nodes>\d)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-arbor$', skeletonexport.compact_arbor),
    re_path(r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_nodes>\d)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-arbor-with-minutes$', skeletonexport.compact_arbor_with_minutes),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/review$', skeletonexport.export_review_skeleton),
    re_path(r'^(?P<project_id>\d+)/skeleton/(?P<skeleton_id>\d+)/reviewed-nodes$', skeletonexport.export_skeleton_reviews),
    re_path(r'^(?P<project_id>\d+)/skeletons/measure$', skeletonexport.measure_skeletons),
    re_path(r'^(?P<project_id>\d+)/skeleton/connectors-by-partner$', skeletonexport.skeleton_connectors_by_partner),
    re_path(r'^(?P<project_id>\d+)/skeletons/partners-by-connector$', skeletonexport.partners_by_connector),
    re_path(r'^(?P<project_id>\d+)/skeletons/connector-polyadicity$', skeletonexport.connector_polyadicity),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/compact-detail$', skeletonexport.compact_skeleton_detail),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/neuroglancer$', skeletonexport.neuroglancer_skeleton),
    re_path(r'^(?P<project_id>\d+)/skeletons/(?P<skeleton_id>\d+)/node-overview$', skeletonexport.treenode_overview),
    re_path(r'^(?P<project_id>\d+)/skeletons/compact-detail$', skeletonexport.compact_skeleton_detail_many),
    # Marked as deprecated, but kept for backwards compatibility
    re_path(r'^(?P<project_id>\d+)/(?P<skeleton_id>\d+)/(?P<with_connectors>\d)/(?P<with_tags>\d)/compact-skeleton$', skeletonexport.compact_skeleton),
]

# Treenode and Connector image stack archive export
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/connectorarchive/export$', treenodeexport.export_connectors),
    re_path(r'^(?P<project_id>\d+)/treenodearchive/export$', treenodeexport.export_treenodes),
]

# Pointclouds
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/pointclouds/$', pointcloud.PointCloudList.as_view()),
    re_path(r'^(?P<project_id>\d+)/pointclouds/(?P<pointcloud_id>\d+)/$', pointcloud.PointCloudDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/pointclouds/(?P<pointcloud_id>\d+)/images/(?P<image_id>\d+)/$', pointcloud.PointCloudImageDetail.as_view()),
]

# Pointsets
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/pointsets/$', pointset.PointSetList.as_view()),
    re_path(r'^(?P<project_id>\d+)/pointsets/(?P<pointset_id>\d+)/$', pointset.PointSetDetail.as_view()),
]

urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/similarity/configs/$', similarity.ConfigurationList.as_view()),
    re_path(r'^(?P<project_id>\d+)/similarity/configs/(?P<config_id>\d+)/$', similarity.ConfigurationDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/similarity/configs/(?P<config_id>\d+)/recompute$', similarity.recompute_config),
    re_path(r'^(?P<project_id>\d+)/similarity/queries/$', similarity.SimilarityList.as_view()),
    re_path(r'^(?P<project_id>\d+)/similarity/queries/similarity$', similarity.compare_skeletons),
    re_path(r'^(?P<project_id>\d+)/similarity/queries/(?P<similarity_id>\d+)/$', similarity.SimilarityDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/similarity/queries/(?P<similarity_id>\d+)/recompute$', similarity.recompute_similarity),
    re_path(r'^(?P<project_id>\d+)/similarity/test-setup$', similarity.test_setup),
]

# Cropping
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/crop', cropping.crop),
    re_path(r'^crop/download/(?P<file_path>.*)/$', cropping.download_crop)
]

# Tagging
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/tags/list$', project.list_project_tags),
    re_path(r'^(?P<project_id>\d+)/tags/clear$', record_view("projects.clear_tags")(project.update_project_tags)),
    re_path(r'^(?P<project_id>\d+)/tags/(?P<tags>.*)/update$', record_view("projects.update_tags")(project.update_project_tags)),
]
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/list$', stack.list_stack_tags),
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/clear$', record_view("stacks.clear_tags")(stack.update_stack_tags)),
    re_path(r'^(?P<project_id>\d+)/stack/(?P<stack_id>\d+)/tags/(?P<tags>.*)/update$', record_view("stacks.update_tags")(stack.update_stack_tags)),
]

# Data views
urlpatterns += [
    re_path(r'^dataviews/list$', data_view.get_available_data_views, name='list_dataviews'),
    re_path(r'^dataviews/default$', data_view.get_default_properties, name='default_dataview'),
    re_path(r'^dataviews/(?P<data_view_id>\d+)/$', data_view.get_detail, name='detail_dataview'),
    re_path(r'^dataviews/(?P<data_view_id>\d+)/make-home-view$', data_view.make_home_view, name='make_home_view'),
    re_path(r'^dataviews/show/(?P<data_view_id>\d+)$', data_view.get_data_view, name='show_dataview'),
    re_path(r'^dataviews/show/default$', data_view.get_default_data_view, name='show_default_dataview'),
    re_path(r'^dataviews/type/comment$', data_view.get_data_view_type_comment, name='get_dataview_type_comment'),
    re_path(r'^dataviews/type/(?P<data_view_id>\d+)$', data_view.get_data_view_type, name='get_dataview_type'),
]

# Ontologies
urlpatterns += [
    re_path(r'^ontology/knownroots$', ontology.get_known_ontology_roots),
    re_path(r'^(?P<project_id>%s)/ontology/roots/$' % (integer), ontology.get_existing_roots),
    re_path(r'^(?P<project_id>%s)/ontology/list$' % (integer), ontology.list_ontology),
    re_path(r'^(?P<project_id>%s)/ontology/relations$' % (integer), ontology.get_available_relations),
    re_path(r'^(?P<project_id>%s)/ontology/relations/add$' % (integer), record_view("ontologies.add_relation")(ontology.add_relation_to_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/relations/rename$' % (integer), record_view("ontologies.rename_relation")(ontology.rename_relation)),
    re_path(r'^(?P<project_id>%s)/ontology/relations/remove$' % (integer), record_view("ontologies.remove_relation")(ontology.remove_relation_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/relations/removeall$' % (integer), record_view("ontologies.remove_all_relations")(ontology.remove_all_relations_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/relations/list$' % (integer), ontology.list_available_relations),
    re_path(r'^(?P<project_id>%s)/ontology/classes$' % (integer), ontology.get_available_classes),
    re_path(r'^(?P<project_id>%s)/ontology/classes/add$' % (integer), record_view("ontologies.add_class")(ontology.add_class_to_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/classes/rename$' % (integer), record_view("ontologies.rename_class")(ontology.rename_class)),
    re_path(r'^(?P<project_id>%s)/ontology/classes/remove$' % (integer), record_view("ontologies.remove_class")(ontology.remove_class_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/classes/removeall$' % (integer), record_view("ontologies.remove_all_classes")(ontology.remove_all_classes_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/classes/list$' % (integer), ontology.list_available_classes),
    re_path(r'^(?P<project_id>%s)/ontology/links/add$' % (integer), record_view("ontologies.add_link")(ontology.add_link_to_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/links/remove$' % (integer), record_view("ontologies.remove_link")(ontology.remove_link_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/links/removeselected$' % (integer), record_view("ontologies.remove_link")(ontology.remove_selected_links_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/links/removeall$' % (integer), record_view("ontologies.remove_all_links")(ontology.remove_all_links_from_ontology)),
    re_path(r'^(?P<project_id>%s)/ontology/restrictions/add$' % (integer), record_view("ontologies.add_restriction")(ontology.add_restriction)),
    re_path(r'^(?P<project_id>%s)/ontology/restrictions/remove$' % (integer), record_view("ontologies.remove_restriction")(ontology.remove_restriction)),
    re_path(r'^(?P<project_id>%s)/ontology/restrictions/(?P<restriction>[^/]*)/types$' % (integer), ontology.get_restriction_types),
]

# Classification
urlpatterns += [
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/roots/$',
        classification.get_classification_roots),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/setup/test$',
        classification.check_classification_setup_view, name='test_classification_setup'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/setup/rebuild$',
        record_view("classifications.rebuild_env")(classification.rebuild_classification_setup_view), name='rebuild_classification_setup'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/new$',
        record_view("classifications.add_graph")(classification.add_classification_graph), name='add_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/list$',
        classification.list_classification_graph, name='list_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/list/(?P<link_id>\d+)$',
        classification.list_classification_graph, name='list_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/(?P<link_id>\d+)/remove$',
        record_view("classifications.remove_graph")(classification.remove_classification_graph), name='remove_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/instance-operation$',
        record_view("classifications.update_graph")(classification.classification_instance_operation), name='classification_instance_operation'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/(?P<link_id>\d+)/autofill$',
        record_view("classifications.autofill_graph")(classification.autofill_classification_graph), name='autofill_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/link$',
        record_view("classifications.link_graph")(classification.link_classification_graph), name='link_classification_graph'),
    re_path(rf'^(?P<project_id>{integer})/classification/(?P<workspace_pid>{integer})/stack/(?P<stack_id>{integer})/linkroi/(?P<ci_id>{integer})/$',
        record_view("classifications.link_roi")(classification.link_roi_to_classification), name='link_roi_to_classification'),
    re_path(rf'^classification/(?P<workspace_pid>{integer})/export$',
        classification.export, name='export_classification'),
    re_path(rf'^classification/(?P<workspace_pid>{integer})/export/excludetags/(?P<exclusion_tags>{wordlist})/$',
        classification.export, name='export_classification'),
    re_path(rf'^classification/(?P<workspace_pid>{integer})/search$',
        classification.search, name='search_classifications'),
    re_path(rf'^classification/(?P<workspace_pid>{integer})/export_ontology$',
        classification.export_ontology, name='export_ontology'),
]

# Notifications
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/notifications/list$', notifications.list_notifications),
    re_path(r'^(?P<project_id>\d+)/changerequest/approve$', record_view("change_requests.approve")(notifications.approve_change_request)),
    re_path(r'^(?P<project_id>\d+)/changerequest/reject$', record_view("change_requests.reject")(notifications.reject_change_request)),
]

# Regions of interest
urlpatterns += [
    re_path(rf'^(?P<project_id>{integer})/roi/(?P<roi_id>{integer})/info$', roi.get_roi_info, name='get_roi_info'),
    re_path(rf'^(?P<project_id>{integer})/roi/link/(?P<relation_id>{integer})/stack/(?P<stack_id>{integer})/ci/(?P<ci_id>{integer})/$',
        record_view("rois.create_link")(roi.link_roi_to_class_instance), name='link_roi_to_class_instance'),
    re_path(rf'^(?P<project_id>{integer})/roi/(?P<roi_id>{integer})/remove$', record_view("rois.remove_link")(roi.remove_roi_link), name='remove_roi_link'),
    re_path(rf'^(?P<project_id>{integer})/roi/(?P<roi_id>{integer})/image$', roi.get_roi_image, name='get_roi_image'),
    re_path(rf'^(?P<project_id>{integer})/roi/add$', record_view("rois.create")(roi.add_roi), name='add_roi'),
]

# General points
urlpatterns += [
    re_path(rf'^(?P<project_id>{integer})/points/$', point.PointList.as_view()),
    re_path(rf'^(?P<project_id>{integer})/points/(?P<point_id>[0-9]+)/$', point.PointDetail.as_view()),
]

# Landmarks
urlpatterns += [
    re_path(rf'^(?P<project_id>{integer})/landmarks/$', landmarks.LandmarkList.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/normalize-names$', landmarks.LandmarkNameNormalizer.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/(?P<landmark_id>[0-9]+)/$', landmarks.LandmarkDetail.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/(?P<landmark_id>[0-9]+)/locations/$',
            landmarks.LandmarkLocationList.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/(?P<landmark_id>[0-9]+)/locations/(?P<location_id>[0-9]+)/$',
            landmarks.LandmarkLocationDetail.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/(?P<landmark_id>[0-9]+)/groups/(?P<group_id>[0-9]+)/$',
            landmarks.LandmarkAndGroupkLocationDetail.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/$', landmarks.LandmarkGroupList.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/import$', landmarks.LandmarkGroupImport.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/materialize$', landmarks.LandmarkGroupMaterializer.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/links/$', landmarks.LandmarkGroupLinks.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/links/(?P<link_id>[0-9]+)/$',
            landmarks.LandmarkGroupLinkDetail.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/(?P<landmarkgroup_id>[0-9]+)/$', landmarks.LandmarkGroupDetail.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/(?P<landmarkgroup_id>[0-9]+)/transitively-linked$',
        landmarks.LandmarkGroupLinkage.as_view()),
    re_path(rf'^(?P<project_id>{integer})/landmarks/groups/(?P<landmarkgroup_id>[0-9]+)/locations/(?P<location_id>[0-9]+)/$',
            landmarks.LandmarkGroupLocationList.as_view()),
]

# Clustering
urlpatterns += [
    re_path(r'^clustering/(?P<workspace_pid>\d+)/setup$',
        record_view("clusterings.setup_env")(clustering.setup_clustering), name='clustering_setup'),
    re_path(r'^clustering/(?P<workspace_pid>\d+)/show$',
        TemplateView.as_view(template_name="catmaid/clustering/display.html"),
        name="clustering_display"),
]

# Volumes
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/volumes/$', volume.volume_collection),
    re_path(r'^(?P<project_id>\d+)/volumes/add$', record_view("volumes.create")(volume.add_volume)),
    re_path(r'^(?P<project_id>\d+)/volumes/from-origin$', volume.from_origin),
    re_path(r'^(?P<project_id>\d+)/volumes/from-entities$', volume.from_entities),
    re_path(r'^(?P<project_id>\d+)/volumes/import$', record_view("volumes.create")(volume.import_volumes)),
    re_path(r'^(?P<project_id>\d+)/volumes/entities/$', volume.get_volume_entities),
    re_path(r'^(?P<project_id>\d+)/volumes/skeleton-innervations$', volume.get_skeleton_innervations),
    re_path(r'^(?P<project_id>\d+)/volumes/(?P<volume_id>\d+)/$', volume.VolumeDetail.as_view()),
    re_path(r'^(?P<project_id>\d+)/volumes/(?P<volume_id>\d+)/intersect$', volume.intersects),
    re_path(r'^(?P<project_id>\d+)/volumes/(?P<volume_id>\d+)/export\.(?P<extension>\w+)', volume.export_volume),
    re_path(r'^(?P<project_id>\d+)/volumes/(?P<volume_id>\d+)/update-meta-info$', volume.update_meta_information),
]

# Analytics
urlpatterns += [
    re_path(r'^(?P<project_id>\d+)/analytics/skeletons$', analytics.analyze_skeletons),
    re_path(r'^(?P<project_id>\d+)/analytics/broken-section-nodes$', analytics.list_broken_section_nodes)
]

# Front-end tests, disabled by default
if settings.FRONT_END_TESTS_ENABLED:
    urlpatterns += [
        re_path(r'^tests$', login_required(CatmaidView.as_view(template_name="catmaid/tests.html")), name="frontend_tests"),
    ]

# Collection of various parts of the CATMAID API. These methods are usually
# one- or two-liners and having them in a separate statement would not improve
# readability. Therefore, they are all declared in this general statement.
urlpatterns += [
    # User analytics and proficiency
    re_path(r'^(?P<project_id>\d+)/useranalytics$', useranalytics.plot_useranalytics),
    re_path(r'^(?P<project_id>\d+)/useranalytics/data$', useranalytics.UserAnalyticsAPIView.as_view()),
    re_path(r'^(?P<project_id>\d+)/userproficiency$', user_evaluation.evaluate_user),

    re_path(r'^(?P<project_id>\d+)/graphexport/json$', graphexport.export_jsongraph),

    # Graphs
    re_path(r'^(?P<project_id>\d+)/skeletons/confidence-compartment-subgraph', graph2.skeleton_graph),

    # Circles
    re_path(r'^(?P<project_id>\d+)/graph/circlesofhell', circles.circles_of_hell),
    re_path(r'^(?P<project_id>\d+)/graph/directedpaths', circles.find_directed_paths),
    re_path(r'^(?P<project_id>\d+)/graph/dps', circles.find_directed_path_skeletons),

    # Review
    re_path(r'^(?P<project_id>\d+)/user/reviewer-whitelist$', review.reviewer_whitelist),

    # Search
    re_path(r'^(?P<project_id>\d+)/search$', search.search),

    # Wiring diagram export
    re_path(r'^(?P<project_id>\d+)/wiringdiagram/json$', wiringdiagram.export_wiring_diagram),
    re_path(r'^(?P<project_id>\d+)/wiringdiagram/nx_json$', wiringdiagram.export_wiring_diagram_nx),

    # Annotation graph export
    re_path(r'^(?P<project_id>\d+)/annotationdiagram/nx_json$', object.convert_annotations_to_networkx),
]

# Patterns for Janelia render web service access
from catmaid.control.janelia_render import (
    project as janelia_render_project,
    review as janelia_render_review,
    stack as janelia_render_stack)
urlpatterns += [
    re_path(r'^janelia-render/projects/$', janelia_render_project.projects),
    re_path(r'^(?P<project_id>.+)/user/reviewer-whitelist$', janelia_render_review.reviewer_whitelist),
    re_path(r'^(?P<project_id>.+)/interpolatable-sections/$', noop.interpolatable_sections),
    re_path(r'^janelia-render/(?P<project_id>.+)/stack/(?P<stack_id>.+)/info$', janelia_render_stack.stack_info),
    re_path(r'^janelia-render/(?P<project_id>.+)/stacks$', janelia_render_stack.stacks),
    re_path(r'^janelia-render/(?P<project_id>.+)/annotations/$', noop.list_annotations),
    re_path(r'^janelia-render/(?P<project_id>.+)/annotations/query-targets$', noop.query_annotation_targets),
    re_path(r'^janelia-render/client/datastores/(?P<name>[\w-]+)/$', noop.datastore_settings),
]

# Patterns for DVID access
from catmaid.control.dvid import (project as dvidproject,
        review as dvidreview, stack as dvidstack)
urlpatterns += [
    re_path(r'^dvid/projects/$', dvidproject.projects),
    re_path(r'^(?P<project_id>.+)/user/reviewer-whitelist$', dvidreview.reviewer_whitelist),
    re_path(r'^(?P<project_id>.+)/interpolatable-sections/$', noop.interpolatable_sections),
    re_path(r'^dvid/(?P<project_id>.+)/stack/(?P<stack_id>.+)/info$', dvidstack.stack_info),
    re_path(r'^dvid/(?P<project_id>.+)/stacks$', dvidstack.stacks),
    re_path(r'^dvid/(?P<project_id>.+)/annotations/$', noop.list_annotations),
    re_path(r'^dvid/(?P<project_id>.+)/annotations/query-targets$', noop.query_annotation_targets),
    re_path(r'^dvid/client/datastores/(?P<name>[\w-]+)/$', noop.datastore_settings),
]
