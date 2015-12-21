.. _user-profiles:

User Profiles
=============

To manage per-user settings, in CATMAID each user has a profile attached.
These profiles can be adjusted in the admin interface by going to a users
settings page. Currently, these settings control access to CATMAID's
different tools.

Those settings also have default values which are user for new users and
which can be set for all users at once. To adjust those defaults to your
use case, add and change the following lines to your Django configuration
(likely `settings.py`)::

  PROFILE_SHOW_TEXT_LABEL_TOOL = False
  PROFILE_SHOW_TAGGING_TOOL = False
  PROFILE_SHOW_CROPPING_TOOL = False
  PROFILE_SHOW_SEGMENTATION_TOOL = False
  PROFILE_SHOW_TRACING_TOOL = False
  PROFILE_SHOW_TEXT_LABEL_TOOL = False
  PROFILE_SHOW_ONTOLOGY_TOOL = False
  PROFILE_SHOW_ROI_TOOL = False

As you can see, by default all tools are invisible. Change ``False`` to
``True`` if you want to make a tool available on the toolbar for new users.
If you want to use these default settings for existing users, please use
this management command::

  ./manage.py catmaid_set_user_profiles_to_default

If you add the ``--update-anon-user`` option, the user profile of the
anonymous user will get updated to the current default settings as well. By
default, the anonymous user is not updated.
