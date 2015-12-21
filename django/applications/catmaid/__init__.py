from django.conf import settings
from django.contrib import auth
from django.core.exceptions import ImproperlyConfigured

default_app_config = 'catmaid.apps.CATMAIDConfig'

def get_system_user():
    """Return a User instance of a superuser. This is either the superuser
    having the ID configured in SYSTEM_USER_ID or the superuser with the lowest
    ID."""
    User = auth.get_user_model()

    if hasattr(settings, "SYSTEM_USER_ID"):
        try:
            return User.objects.get(id=settings.SYSTEM_USER_ID, is_superuser=True)
        except User.DoesNotExist:
            raise ImproperlyConfigured("Could not find any super user with ID "
                                       "configured in SYSTEM_USER_ID (%s), "
                                       "please fix this in settings.py" % settings.SYSTEM_USER_ID)
    else:
        # Find admin user with lowest id
        users = User.objects.filter(is_superuser=True).order_by('id')
        if not len(users):
            raise ImproperlyConfigured("Couldn't find any super user, " +
                                       "please make sure you have one")
        return users[0]
