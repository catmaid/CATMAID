.. _user-accounts:

User accounts
=============

.. _user-profiles:

User Profiles
-------------

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

.. _user-registration:

User registration
-----------------

If ``USER_REGISTRATION_ALLOWED = True`` in ``settings.py``, CATMAID will allow
new users to register. The registration page is reachable through the "Register"
link in the upper right corner of the CATMAID website.

Optionally, new users can be required to confirm their email address. This
requires a working E-Mail setup (``EMAIL_HOST``,  ``EMAIL_PORT``,
``EMAIL_HOST_USER``, ``EMAIL_HOST_PASSWORD``, ``DEFAULT_FROM_EMAIL``). If this
is working can be tested from the Python shell::

  from django.core.mail import send_mail
  send_mail('Test-Mail', 'Test-Message', '<valid-sender>', ['<recipient>'], fail_silently=False)

If this works, then confirmation emails can be enabled by setting::

  USER_REGISTRATION_EMAIL_CONFIRMATION_REQUIRED = True

The text of the welcome message can be adjusted using the
``USER_REGISTRATION_EMAIL_CONFIRMATION_EMAIL_TEXT`` setting. Look at the default
in ``settings_base.py`` for an example.

This confirmation email also requires admins to defined the correct domain for
their CATMAID instance in the admin interface by changing the default
``example.com`` ``Site`` entry. Make sure to provide a fully qualified domain
like ``em.catmaid.org``.

Once users have their email address confirmed, or right after registration, if
no confirmation is required, a welcome email can be sent to users. To enable
this email, set ``USER_REGISTRATION_EMAIL_WELCOME_EMAIL = True``. Its text can
be modified as well using the ``USER_REGISTRATION_EMAIL_WELCOME_EMAIL_TEXT``
setting. Like with the confirmation email, have a alook at the default for an
example.

Additionally, it is possible to add a ``Reply-To`` header in those emails, by
setting ``USER_REGISTRATION_EMAIL_REPLY_TO`` to an email address.
