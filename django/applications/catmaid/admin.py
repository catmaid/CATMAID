from django import forms
from django.core.exceptions import ValidationError
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from django.utils.safestring import mark_safe
from guardian.admin import GuardedModelAdmin
from catmaid.models import Project, DataView, Stack, ProjectStack, UserProfile
from catmaid.models import BrokenSlice, Overlay
from catmaid.control.importer import importer_admin_view
from catmaid.control.classificationadmin import classification_admin_view
from catmaid.control.annotationadmin import ImportingWizard
from catmaid.views import UseranalyticsView, UserProficiencyView


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


class BrokenSliceModelForm(forms.ModelForm):
    """ This model form for the BrokenSlide model, will add an optional "last
    index" field. BrokenSliceAdmin will deactivate it, when an existing
    instance is edited. Using it when adding, allows to add many broken slice
    entries at once.
    """
    last_index = forms.IntegerField(initial="",
            required=False, help_text="Optionally, add a last index "
            "and a new broken slice entry will be generated for each "
            "slice in the range [index, last index].")

    class Meta:
        model = BrokenSlice


class BrokenSliceAdmin(GuardedModelAdmin):
    list_display = ('stack', 'index')
    search_fields = ('stack', 'index')
    list_editable = ('index',)

    form = BrokenSliceModelForm

    def get_fieldsets(self, request, obj=None):
        """ Remove last_index field if an existing instance is edited.
        """
        fieldsets = super(BrokenSliceAdmin, self).get_fieldsets(request, obj)
        print fieldsets
        if obj and 'last_index' in fieldsets[0][1]['fields']:
            fieldsets[0][1]['fields'].remove('last_index')
        return fieldsets

    def save_model(self, request, obj, form, change):
        """ After calling the super method, additinal broken slice records are
        created if a "last index was specified.
        """
        super(BrokenSliceAdmin, self).save_model(request, obj, form, change)
        li = (form.cleaned_data.get('last_index'))
        # Only attemt to add additional broken slice entries, if a last index
        # was specified.
        if li and not change:
            s = form.cleaned_data.get('stack')
            i = int(form.cleaned_data.get('index'))
            # Add a new broken slice entry for each additional index, if it
            # doesn't exist already.
            num_extra_slices = max(li - i, 0)
            new_entry_count = 0
            for diff in range(1, num_extra_slices + 1):
                _, created = BrokenSlice.objects.get_or_create(stack=s,
                        index=i+diff)
                if created:
                    new_entry_count += 1

            # Create a result message
            if new_entry_count > 0:
                msg = 'Added %s additional broken slice entries.' % \
                        str(new_entry_count)
                if num_extra_slices != new_entry_count:
                    msg += ' %s broken slice entries were already present.' %\
                        str(num_extra_slices - new_entry_count)
                messages.add_message(request, messages.INFO, msg)
            elif num_extra_slices > 0 and new_entry_count == 0:
                msg = 'All %s extra broken slice entries were already ' \
                    'present.' % str(num_extra_slices)
                messages.add_message(request, messages.INFO, msg)


class ProjectStackInline(admin.TabularInline):
    model = ProjectStack
    extra = 1


class ProjectAdmin(GuardedModelAdmin):
    list_display = ('title',)
    search_fields = ['title','comment']
    inlines = [ProjectStackInline]
    save_as = True
    actions = (duplicate_action,)


class StackAdmin(GuardedModelAdmin):
    list_display = ('title', 'dimension', 'resolution', 'num_zoom_levels',
                    'image_base')
    search_fields = ['title', 'comment', 'image_base']
    inlines = [ProjectStackInline]
    save_as = True
    actions = (duplicate_action,)


class OverlayAdmin(GuardedModelAdmin):
    list_display = ('title', 'image_base')
    search_fields = ['title', 'image_base']
    save_as = True
    actions = (duplicate_action,)


class DataViewConfigWidget(forms.widgets.Textarea):
    def render(self, name, value, attrs=None):
        output = super(DataViewConfigWidget, self).render(name, value, attrs)
        output += "<p id='data_view_config_help'></p>"
        return mark_safe(output)


class DataViewAdminForm(forms.ModelForm):
    """ As custom validation is needed for a data view's configuration
    field (it must be JSON data), a custom form is needed, too.
    """
    class Meta:
        model = DataView

    def __init__(self, *args, **kwargs):
        super(DataViewAdminForm, self).__init__(*args, **kwargs)
        # Since we want to add additional information to the data view
        # configuration widget, we decorate it
        self.fields['config'].widget = DataViewConfigWidget(
            attrs={'class': 'vLargeTextField'})
        # The positioning should be handled by a choice field
        num_data_views = DataView.objects.count()
        position_choices = ((x, str(x)) for x in range(num_data_views))
        self.fields['position'] = forms.ChoiceField(choices=position_choices)

    def clean_config(self):
        """ Custom validation for tha data view's config field.
        """
        config = self.cleaned_data["config"]
        try:
            import json
            json.loads(config)
        except:
            raise ValidationError("Couldn't parse the configuration as JSON "
                                  "data. See e.g. http://en.wikipedia.org/"
                                  "wiki/JSON for examples.")

        return config


class DataViewAdmin(GuardedModelAdmin):
    list_display = ('title', 'data_view_type', 'position', 'is_default',
                    'comment')
    list_editable = ('position',)
    # Add the custom form which does validation of the view
    # configuration
    form = DataViewAdminForm
    # A custom change form admin view template is needed to display
    # configuraiton information. Since django-guardian is used, which
    # provides a custiom change_form.html template as well, we need
    # to explicitely refer to our wanted template.
    change_form_template = 'catmaid/admin/dataview/change_form.html'
    save_as = True
    actions = (duplicate_action,)


class ProfileInline(admin.StackedInline):
    model = UserProfile
    fk_name = 'user'
    max_num = 1

    def get_formset(self, request, obj=None, **kwargs):
        """ Exclude the color field for non-superusers. It's not important to
        override exactly this method, we just need some method that gets the
        request object.
        """
        if request.user.is_superuser:
            self.exclude = ()
        else:
            self.exclude = ('color',)
        return super(ProfileInline, self).get_formset(request, obj, **kwargs)


class CustomUserAdmin(UserAdmin):
    inlines = [ProfileInline]
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff')
    filter_horizontal = ('groups', 'user_permissions')

    def changelist_view(self, request, extra_context=None):
        """ Add a color column for superusers. It's not important to override
        exactly this method, we just need some method that gets the request
        object.
        """
        if request.user.is_superuser and self.list_display[-1] != 'color':
            self.list_display = self.list_display + ('color',)
        return super(CustomUserAdmin, self) \
            .changelist_view(request, extra_context=extra_context)


def color(self):
    try:
        up = UserProfile.objects.get(user=self)
        return mark_safe('<div style="background-color:%s; border-style:' \
                'inset; border-width:thin; margin-left:1em; width:100px; ' \
                'height:100%%;">&nbsp;</div>' % up.color.hex_color())
    except Exception as e:
        return mark_safe('<div>%s</div>' % str(e))

color.allow_tags = True
User.color = color

# Add model admin views
admin.site.register(BrokenSlice, BrokenSliceAdmin)
admin.site.register(Project, ProjectAdmin)
admin.site.register(DataView, DataViewAdmin)
admin.site.register(Stack, StackAdmin)
admin.site.register(Overlay, OverlayAdmin)
admin.site.register(ProjectStack)

# Replace the user admin view with custom view
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)
# Register additional views
admin.site.register_view('annotationimporter', 'Annotation data importer',
                         view=ImportingWizard.as_view())
admin.site.register_view('importer', 'Image data importer',
                         view=importer_admin_view)
admin.site.register_view('useranalytics', 'User Analytics',
                         view=UseranalyticsView.as_view())
admin.site.register_view('userproficiency', 'User Proficiency',
                         view=UserProficiencyView.as_view())
admin.site.register_view('classificationadmin',
                         'Tag Based Classification Graph Linker',
                         view=classification_admin_view)
