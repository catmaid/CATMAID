from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from django.utils.safestring import mark_safe
from guardian.admin import GuardedModelAdmin
from catmaid.models import Project, DataView, Stack, ProjectStack, UserProfile, Overlay, StackSliceInfo
from catmaid.control.importer import importer_admin_view
from catmaid.views import UseranalyticsView

class ProjectAdmin(GuardedModelAdmin):
    list_display = ('title', 'public')
    search_fields = ['title']
    
#    def has_change_permission(self, request, obj=None):
#        pass

class StackAdmin(GuardedModelAdmin):
    list_display = ('title', 'dimension', 'resolution', 'num_zoom_levels', 'image_base')
    search_fields = ['title', 'image_base']

class DataViewConfigWidget(forms.widgets.Textarea):
    def render(self, name, value, attrs=None):
        output = super(DataViewConfigWidget, self).render(name, value, attrs)
        output += "<p id='data_view_config_help'></p>"
        return mark_safe(output)

class DataViewAdminForm(forms.ModelForm):
    """ As custom validation is needed for a data views's configuration
    field (it must be JSON data), a custom form is needed, too.
    """
    class Meta:
        model = DataView

    def __init__(self, *args, **kwargs):
        super(DataViewAdminForm, self).__init__(*args, **kwargs)
        # Since we want to add additional information to the data view
        # configuration widget, we decorate it
        self.fields['config'].widget = DataViewConfigWidget(attrs={'class':'vLargeTextField'})
        # The positioning should be handled by a choice field
        num_data_views = DataView.objects.count()
        position_choices = ( (x,str(x)) for x in range(num_data_views) )
        self.fields['position'] = forms.ChoiceField(choices = position_choices)

    def clean_config(self):
        """ Custom validation for tha data view's config field.
        """
        config = self.cleaned_data["config"]
        try:
            import json
            json_data = json.loads( config )
        except:
            raise ValidationError( "Couldn't parse the configuration as JSON data. See e.g. http://en.wikipedia.org/wiki/JSON for examples." )

        return config

class DataViewAdmin(GuardedModelAdmin):
    list_display = ('title', 'data_view_type', 'position', 'is_default', 'comment')
    list_editable = ('position',)
    # Add the custom form which does validation of the view
    # configuration
    form = DataViewAdminForm
    # A custom change form admin view template is needed to display
    # configuraiton information. Since django-guardian is used, which
    # provides a custiom change_form.html template as well, we need
    # to explicitely refer to our wanted template.
    change_form_template = 'admin/catmaid/dataview/change_form.html'

class ProfileInline(admin.StackedInline):
    model = UserProfile
    fk_name = 'user'
    max_num = 1
    
    def get_formset(self, request, obj=None, **kwargs):
        # Exclude the color field for non-superusers.
        # It's not important to override exactly this method, we just need some method that gets the request object.
        if request.user.is_superuser:
            self.exclude = ()
        else:
            self.exclude = ('color',)
        return super(ProfileInline, self).get_formset(request, obj, **kwargs)

class CustomUserAdmin(UserAdmin):
    inlines = [ProfileInline,]
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff')
    
    def changelist_view(self, request, extra_context=None):
        # Add a color column for superusers.
        # It's not important to override exactly this method, we just need some method that gets the request object.
        if request.user.is_superuser and self.list_display[-1] != 'color':
            self.list_display = self.list_display + ('color',)
        return super(CustomUserAdmin, self).changelist_view(request, extra_context=extra_context)

def color(self):
    try:
        up = UserProfile.objects.get(user=self)
        return mark_safe('<div style="background-color:%s; border-style:inset; border-width:thin; margin-left:1em; width:100px; height:100%%;">&nbsp;</div>' % up.color.hex_color())
    except Exception as e:
        return mark_safe('<div>%s</div>' % str(e))

color.allow_tags = True
User.color = color

# Add model admin views
admin.site.register(Project, ProjectAdmin)
admin.site.register(DataView, DataViewAdmin)
admin.site.register(Stack, StackAdmin)
admin.site.register(ProjectStack)

# Replace the user admin view with custom view
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)
# Register additional views
admin.site.register_view('importer', importer_admin_view, 'Importer')
admin.site.register_view('useranalytics', UseranalyticsView.as_view(), 'User Analytics')
admin.site.register(Overlay)
admin.site.register(StackSliceInfo)
