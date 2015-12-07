from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import NoArgsCommand, CommandError

from optparse import make_option

class Command(NoArgsCommand):
    help = "Set the user profile settings of every user to the defaults"

    option_list = NoArgsCommand.option_list + (
        make_option('--update-anon-user', dest='update-anon-user',
            default=False, action='store_true',
            help='Update also the profile of the anonymous user'),
        )

    def handle_noargs(self, **options):
        update_anon_user = 'update-anon-user' in options
        for u in User.objects.all():
            # Ignore the anonymous user by default
            if u.id == settings.ANONYMOUS_USER_ID and not update_anon_user:
                continue
            up = u.userprofile
            # Expect user profiles to be there and add all default settings
            up.independent_ontology_workspace_is_default = \
                settings.PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT
            up.show_text_label_tool = settings.PROFILE_SHOW_TEXT_LABEL_TOOL
            up.show_tagging_tool = settings.PROFILE_SHOW_TAGGING_TOOL
            up.show_cropping_tool = settings.PROFILE_SHOW_CROPPING_TOOL
            up.show_segmentation_tool = settings.PROFILE_SHOW_SEGMENTATION_TOOL
            up.show_tracing_tool = settings.PROFILE_SHOW_TRACING_TOOL
            up.show_ontology_tool = settings.PROFILE_SHOW_ONTOLOGY_TOOL
            # Save the changes
            up.save()
