from django.contrib import admin
from guardian.admin import GuardedModelAdmin
from catmaid.models import Project

class ProjectAdmin(GuardedModelAdmin):
    list_display = ('title', 'public', 'wiki_base_url')
    
#    def has_change_permission(self, request, obj=None):
#        pass

admin.site.register(Project, ProjectAdmin)
