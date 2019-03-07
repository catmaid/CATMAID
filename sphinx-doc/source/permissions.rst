.. _permissions:

Permissions and access control
==============================

There are multiple levels of user permissons available in CATMAID. All of them
are configured from within the admin interface, reachable by appending
``/admin`` to your regular CATMAID URL and opening it in a browser.

Permissions can be given to either users or groups. Users can be members of
multiple groups and using them makes user and permission management often a
little bit easier.

Project access and visibility
*****************************

Users can access projects through either the top menu bar, a front page (data
view), a deep link or directly through the API. Which projects users can see and
access by these means is determined by whether they have ``can-browse``
permission on those projects.

To view and change project permissions, open a project in CATMAID's admin view
and click "Object permissions" in the upper right corner. There it is possible
to add either individual users or groups to the various permissions that exists
for projects (including ``can-browse``).

If users or groups have ``can-annotate`` permissions they are allowed to create
new data (e.g. neuron reconstructions or ontology classifications) in a project.
This permission also makes it possible to edit data that was created by other
users. However, for this another test comes into play as well and not every user
can edit the data of all other users. See next section for more details.

The ``can-administer`` permission provides access to additional group management
and user ananlysis tools, mainly useful for group managers. It will add
additional tools to the statistics widget in the web-client.

The anonymous user is with respect to project visibility a special case. If a
project should be publicly visible, the anonymous user needs to have
``can-browse`` permissions on the project, but another permission is needed as
well: in the anonymous user's own user settings the general "catmaid | can
browse projects" setting has to be assigned. With this, the anonymous user acts
just like a regular user and can be assigned project specific ``can-browse`` and
``can-annotate`` permissions.

Inactive users
**************

Users who are marked as inactive won't be able to log into CATMAID. Once
reactivated, these user accounts are fully functional agian. By default,
users have to be marked inactive manually. It is howevere also possible to
automatically deactivate user accounts after a specified time. If `Celery
and Celery Beat<celery>`_ are set up, a periodic task will check every night if
user accounts need deactivation.

Which user accounts get deactivated is configured based on which user groups
they are in. Group Inactivity Periods are objects that associate a user group
with a maximum inactivity time as well as an optional message and (internal)
comment. During activity check, the last login of a user is looked up and
comparead against the specificied maximum inactivity time. If the last login
exceeds this interval, the user account is made inactive. These Group Inactivity
Periods can be managed in the respective admin view.

For each Group Inactivity Period contact, users can be specified, who are
displayed to users whoe have been inactivated due to this mechanism try to
login. A message displayed to them explains the situation and how long the
inactivity period is they violated.

Editing data of other users
***************************

Users with ``can-annotate`` permission on a project can create new data and by
default, users can't edit data of each other. However, they are allowed to to so
if they are member of a group with a name matching the data creator's login
name. So user A can edit user B's data if user A is member of a group named B.
Superusers can edit data of everyone.
