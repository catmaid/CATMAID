# -*- coding: utf-8 -*-

from django.contrib import admin
from .models import TestView, TestResult, Event
from .views import TestResultDisplay


def duplicate_action(modeladmin, request, queryset):
    """
    An action that can be added to individual model admin forms to duplicate
    selected entries. Currently, it only duplicates each object without any
    foreign key or many to many relationships.
    """
    for object in queryset:
        object.id = None
        object.save()
duplicate_action.short_description = "Duplicate selected without relations"


def trimmed_result(obj):
    last_character = min(len(obj.result), 100)
    return "%s ..." % obj.result[:last_character]

class TestViewAdmin(admin.ModelAdmin):
    list_display = ('url', 'method', 'data', 'creation_time')
    search_fields = ('url', 'method', 'data')
    actions = (duplicate_action,)


class TestResultAdmin(admin.ModelAdmin):
    list_display = ('view', 'creation_time', 'time', 'result_code',
                    trimmed_result)
    search_fields = ('view', 'result_code', 'result')
    order_by = ('creation_time',)

class EventAdmin(admin.ModelAdmin):
    list_display = ('creation_time', 'title')
    search_fields = ('title',)
    order_by = ('creation_time',)
    actions = (duplicate_action,)

# Register models with admin site
admin.site.register(TestView, TestViewAdmin)
admin.site.register(TestResult, TestResultAdmin)
admin.site.register(Event, EventAdmin)

# Register additional views
admin.site.register_view('performancetests', 'Plot performance test results',
                         view=TestResultDisplay.as_view())
