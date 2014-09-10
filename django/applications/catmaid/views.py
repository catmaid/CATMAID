from django.conf import settings
from django.views.generic import TemplateView
from django.conf import settings

class HomepageView(TemplateView):
    """ This view returns the index page of CATMAID and passes some
    extra context to its template.
    """
    template_name = "catmaid/index.html"

    def get_context_data(self, **kwargs):
        context = super(self.__class__, self).get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        context['JS_FILES'] = settings.PIPELINE_JS.keys()
        profile_context = self.request.user.userprofile.as_dict()
        return dict(context.items() + profile_context.items())

class UseranalyticsView(TemplateView):
    template_name = "catmaid/useranalytics.html"

    def get_context_data(self, **kwargs):
        context = super(UseranalyticsView, self).get_context_data(**kwargs)
        context['catmaid_url'] = settings.CATMAID_URL
        return context

class UserProficiencyView(TemplateView):
    template_name = "catmaid/userproficiency.html"

    def get_context_data(self, **kwargs):
        context = super(UserProficiencyView, self).get_context_data(**kwargs)
        context['catmaid_url'] = settings.CATMAID_URL
        return context

class ExportWidgetView(TemplateView):
    template_name = "catmaid/exportwidget.html"

    def get_context_data(self, **kwargs):
        context = super(ExportWidgetView, self).get_context_data(**kwargs)
        context['catmaid_url'] = settings.CATMAID_URL
        return context
