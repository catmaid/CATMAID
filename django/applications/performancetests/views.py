# -*- coding: utf-8 -*-

from django.views.generic import TemplateView
from django.core import serializers
from .models import TestResult, TestView, Event

class TestResultDisplay(TemplateView):
    template_name = 'performancetests/test_result_display.html'

    def get_context_data(self, **kwargs):
        # Call the base implementation first to get a context
        context = super(TestResultDisplay, self).get_context_data(**kwargs)
        # Add in a QuerySet of all the test results
        test_results = TestResult.objects.select_related('view') \
                .order_by('-creation_time').all()
        context['test_results'] = list(test_results)
        # Build a dictionary of views
        view_index = {r.view_id: r.view for r in test_results}
        context['view_index'] = view_index
        # Add events
        context['events'] = list(Event.objects.all().order_by('-creation_time'))

        return context
