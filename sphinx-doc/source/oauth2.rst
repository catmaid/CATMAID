.. _oauth2:

Setting up OAuth2 providers for login
=====================================

CATMAID can use other OAuth2 services like GitHub or Orcid.org to sign users in.
Internally a regular Django account is created that is linked to the selected
remote service. These accounts respect the ``NEW_USER_DEFAULT_GROUPS`` setting
and default tool configuration.

Below there are instructions to set this up with GitHub and Orcid.org. A lot
more services are supported, more details can be found on the
`django-allauth <https://django-allauth.readthedocs.io/en/latest/installation.html>`_
documentation.

All OAuth2 providers have a parameter called "redirect URLs". When a user tries
to login to such a service through CATMAID, a URL to a login API on this CATMAID
server is sent along the login service. The login service has a white list of
URLs that are passed in (the redirection URLs) and allows only a successful
login if the passed in URL is on this white list.

GitHub
------

1. Add GitHub support to installed applications in ``settings.py``::

    INSTALLED_APPS += ('allauth.socialaccount.providers.github',)

2. Create GitHub OAuth application:

  https://github.com/settings/applications/new

  Make sure that the "Authorization callback URL" machtes your setup. Generally,
  the form is::

    https://<catmaid-path>/accounts/github/login/callback/

  For a local development setup, use this URL::

    http://localhost:8000/accounts/github/login/callback/

  This creates a *Client ID* and a *Client Secret*, which are needed in a later
  step.

3. Create a Site object in the CATMAID admin view with ``ID = 1``, or if you
   have configured your own ``SIDE_ID`` in ``settings.py`` use this one.

4. Create *Social application* using the GitHub provider in CATMAID's admin
   view. Use *Client ID* and *Client Secret* created in step 2.

5. The front-end should now display a menu for when hovering the mouse over the
   Login button, showing the new entry "Login with GitHub". Clicking it should
   ask your GitHub user account if CATMAID has permission to use it.

Orcid.org
---------

To use Orcid.org as login service, their Public API is sufficient, which is
available to everyone to everyone with an Orcid.org account. The details on how
to create a new application and obtain the *Client ID* and *Client Secret* can
be found on `orcid.org
<https://support.orcid.org/hc/en-us/articles/360006897174>`_. Everyone with an
Orcid ID can create new applications from the developer tools (available in the
user account drop down menu). Remember to define the redirect URLs or domains
properly. With this done, CATMAID can be configured like this:

1. Add ORCID support to installed applications in ``settings.py``::

    INSTALLED_APPS += ('allauth.socialaccount.providers.orcid',)

2. Create a Site object in the CATMAID admin view with ``ID = 1``, or if you
   have configured your own ``SIDE_ID`` in ``settings.py`` use this one.
   Multiple login services can use the same site.

4. Create *Social application* using the Orcid.org provider in CATMAID's admin
   view. Use *Client ID* and *Client Secret* assigned in the Orcid.org sign-up
   process.

5. The front-end should now display a menu for when hovering the mouse over the
   Login button, showing the new entry "Login with Orcid.org". Clicking it
   should ask your Orcid user account if CATMAID has permission to use it.


Orcid.org sandbox
-----------------

Obtaining an Orcid.org sandbox account is easier and a prerequisite of a
production account. More details on the process can be found on `orcid.org
<https://orcid.org/content/register-client-application-sandbox>`_. This process
will also result in a *Client ID* and a *Client Secret*.

The rest of the Orcid-Sandbox configuration is just like the production
Orcid.org setup, but needs additionally the following entry in ``settings.py``::

  SOCIALACCOUNT_PROVIDERS = {
      'orcid': {
          # Base domain of the API. Default value: 'orcid.org', for the production API
          'BASE_DOMAIN':'sandbox.orcid.org',  # for the sandbox API
          # Member API or Public API? Default: False (for the public API)
          'MEMBER_API': True,  # for the member API
      },
  }
