from django.views.generic import TemplateView

class HomepageView(TemplateView):
    """ This view returns the index page of CATMAID.
    """
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super(self.__class__, self).get_context_data(**kwargs)

        return context
