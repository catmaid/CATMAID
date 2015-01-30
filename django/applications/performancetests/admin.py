from django.contrib import admin
from .models import TestView, TestResult
from .views import TestResultDisplay

class TestViewAdmin(admin.ModelAdmin):
    list_display = ('url', 'method', 'data', 'creation_time')
    search_fields = ('url', 'method', 'data')


class TestResultAdmin(admin.ModelAdmin):
    list_display = ('view', 'time', 'result_code', 'result')
    search_fields = ('view', 'result_code', 'result')

# Register models with admin site
admin.site.register(TestView, TestViewAdmin)
admin.site.register(TestResult, TestResultAdmin)

# Register additional views
admin.site.register_view('performancetests', 'Plot performance test results',
                         view=TestResultDisplay.as_view())
