from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import NoArgsCommand, CommandError

class Command(NoArgsCommand):
    help = "Set the user profile settings of every user to the defaults"

    def handle_noargs(self, **options):
        for u in User.objects.all():
            up = u.userprofile
            # Expect user profiles to be there and add all default settings
            up.inverse_mouse_wheel = settings.PROFILE_DEFAULT_INVERSE_MOUSE_WHEEL
            up.show_text_label_tool = settings.PROFILE_SHOW_TEXT_LABEL_TOOL
            up.show_tagging_tool = settings.PROFILE_SHOW_TAGGING_TOOL
            up.show_cropping_tool = settings.PROFILE_SHOW_CROPPING_TOOL
            up.show_segmentation_tool = settings.PROFILE_SHOW_SEGMENTATION_TOOL
            up.show_tracing_tool = settings.PROFILE_SHOW_TRACING_TOOL
            # Save the changes
            up.save()
