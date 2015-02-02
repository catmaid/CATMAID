from django.contrib import admin
from .models import TestView, TestResult
from .views import TestResultDisplay

def trimmed_result(obj):
    last_character = min(len(obj.result), 100)
    return "%s ..." % obj.result[:last_character]

class TestViewAdmin(admin.ModelAdmin):
    list_display = ('url', 'method', 'data', 'creation_time')
    search_fields = ('url', 'method', 'data')


class TestResultAdmin(admin.ModelAdmin):
    list_display = ('view', 'creation_time', 'time', 'result_code',
                    trimmed_result)
    search_fields = ('view', 'result_code', 'result')
    order_by = ('creation_time',)

# Register models with admin site
admin.site.register(TestView, TestViewAdmin)
admin.site.register(TestResult, TestResultAdmin)

# Register additional views
admin.site.register_view('performancetests', 'Plot performance test results',
                         view=TestResultDisplay.as_view())
