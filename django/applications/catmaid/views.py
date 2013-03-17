from django.views.generic import TemplateView

class HomepageView(TemplateView):
    """ This view returns the index page of CATMAID and passes some
    extra context to its template.
    """
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super(self.__class__, self).get_context_data(**kwargs)

        # Add user profile information to the main context
        profile = self.request.user.userprofile
        context['show_text_label_tool'] = profile.show_text_label_tool
        context['show_tagging_tool'] = profile.show_tagging_tool
        context['show_cropping_tool'] = profile.show_cropping_tool
        context['show_segmentation_tool'] = profile.show_segmentation_tool
        context['show_tracing_tool'] = profile.show_tracing_tool

        return context
