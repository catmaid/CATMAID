from django import forms
from django.db.models import fields as db_fields, ForeignKey
from django.core.exceptions import ValidationError
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from django.utils.safestring import mark_safe
from guardian.admin import GuardedModelAdmin
from catmaid.models import (Project, DataView, Stack, ProjectStack, UserProfile,
    BrokenSlice, Overlay, StackClassInstance, Relation, ClassInstance, StackGroup,
    Class, StackStackGroup)
from catmaid.control.importer import importer_admin_view
from catmaid.control.classificationadmin import classification_admin_view
from catmaid.control.annotationadmin import ImportingWizard
from catmaid.views import UseranalyticsView, UserProficiencyView, \
    GroupMembershipHelper
from catmaid.views.dvid import DVIDImportWizard


def add_related_field_wrapper(form, col_name, rel=None):
    """Wrap a field on a form so that a little plus sign appears right next to
    it. If clicked a new instance can be added. Expects the form to have the
    admin site instance available in the admin_site field."""
    if not rel:
        rel_model = form.Meta.model
        rel = rel_model._meta.get_field(col_name).rel

    form.fields[col_name].widget =  admin.widgets.RelatedFieldWidgetWrapper(
        form.fields[col_name].widget, rel, form.admin_site, can_add_related=True)


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


class StackGroupMemberModelForm(forms.ModelForm):
    """Edit stack group memberships."""
    class Meta:
        model = StackClassInstance
        fields = ('stack',)

    # Limit relation instances to 'has_view' and 'has_channel'
    relation_name = forms.ChoiceField(label="Relation", required=False,
        choices=[('', '---------'), ("has_view", "This stack is a view"),
                 ("has_channel", "This stack is a channel")])

    def __init__(self, *args, **kwargs):
        super(StackGroupMemberModelForm, self).__init__(*args, **kwargs)
        if self.instance and hasattr(self.instance, 'relation'):
            relation_name = self.instance.relation.relation_name
            self.fields['relation_name'].initial = relation_name

    def save(self, *args, **kwargs):
        """Override save method to attach relation_name field to new object"""
        obj = super(StackGroupMemberModelForm, self).save(*args, **kwargs)
        obj.relation_name = self.cleaned_data['relation_name']
        return obj

    def clean_relation_name(self):
        rn = self.cleaned_data.get('relation_name', None)
        if rn not in ("has_view", "has_channel"):
            raise ValidationError("Please choose a valid relation")
        return rn


class StackGroupChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, obj):
        return str(obj) + " (Project: %s)" % obj.project


class StackGroupModelForm(StackGroupMemberModelForm):
    class Meta:
        model = StackStackGroup
        fields = ('stack', 'class_instance')

    # Limit class instances to stack groups
    class_instance = StackGroupChoiceField(label="Stack group",
        queryset=StackGroup.objects.filter(class_column__class_name='stackgroup'))

    def __init__(self, *args, **kwargs):
        super(StackGroupModelForm, self).__init__(*args, **kwargs)
        # This is a hack to create StackGroup proxy models from the inline,
        # instead of ClassInstance model objects.
        rel = ForeignKey(StackGroup).rel
        add_related_field_wrapper(self, 'class_instance', rel)


class StackGroupMembersInline(admin.TabularInline):
    """Allows to add attach stack group membership links to be created while
    adding or editing a stack"""
    verbose_name = "Stack group membership"
    verbose_name_plural = "Stack group memberships"
    model = StackStackGroup
    form = StackGroupMemberModelForm
    extra = 1


class StackGroupInline(admin.TabularInline):
    verbose_name = "Stack group membership"
    verbose_name_plural = "Stack group memberships"
    model = StackStackGroup
    form = StackGroupModelForm
    extra = 1

    def __init__(self, obj, admin_site, *args, **kwargs):
        super(StackGroupInline, self).__init__(obj, admin_site, *args, **kwargs)
        self.form.admin_site = admin_site

class StackGroupAdmin(GuardedModelAdmin):
    """Edit or add a stack group (class instance) and links to it."""
    list_display = ('name', 'project')
    search_fields = ('name', 'project')
    readonly_fields = ('creation_time', 'edition_time', 'user', 'class_column')
    fields = ('project', 'name')
    inlines = (StackGroupMembersInline,)

    def save_model(self, request, obj, form, change):
        """Set the user and class of the new stack group"""
        obj.user = request.user
        obj.class_column = Class.objects.get(project=obj.project, class_name="stackgroup")
        super(StackGroupAdmin, self).save_model(request, obj, form, change)
        self.parent_instance = obj

    def save_formset(self, request, form, formset, change):
        """Make sure each new stack group link has all properties it needs to be instantiated."""
        instances = formset.save(commit=False)
        for i in instances:
            i.user = self.parent_instance.user
            i.project = self.parent_instance.project
            i.relation = Relation.objects.get(project=i.project,
                                              relation_name=i.relation_name)
            i.save()
        formset.save_m2m();


class StackAdmin(GuardedModelAdmin):
    list_display = ('title', 'dimension', 'resolution', 'num_zoom_levels',
                    'image_base')
    search_fields = ['title', 'comment', 'image_base']
    inlines = [ProjectStackInline, StackGroupInline]
    save_as = True
    actions = (duplicate_action,)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for i in instances:
            # For stack group memberships created through an inline formset,
            # additional information has to be added.
            if type(i) == StackStackGroup:
                i.user = i.class_instance.user
                i.project = i.class_instance.project
                i.relation = Relation.objects.get(project=i.project,
                                                relation_name=i.relation_name)
            i.save()
        formset.save_m2m();

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
admin.site.register(StackGroup, StackGroupAdmin)

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
admin.site.register_view('groupmembershiphelper',
                         'Group membership helper',
                         view=GroupMembershipHelper.as_view())
admin.site.register_view('dvidimporter', 'DVID stack importer',
                         view=DVIDImportWizard.as_view())
