# -*- coding: utf-8 -*-

from django.db.models import Count
from django_migration_testcase import MigrationTest


class Migration0018Tests(MigrationTest):

    app_name = 'catmaid'
    before = '0017_update_edge_indices'
    after = '0018_add_stack_mirrors_and_groups'

    def migrate_kwargs(self):
        return {
            'verbosity': 0,
            'interactive': False,
        }

    def test_migrate_overlays_to_stack_groups(self):
        OldStack = self.get_model_before('Stack')
        Overlay = self.get_model_before('Overlay')

        # Test that multiple stack with the same title have their overlays
        # migrated to the correct groups.
        os1 = OldStack.objects.create(title='Old Stack', comment='Old Stack 1')
        oo11 = Overlay.objects.create(stack=os1, title='Overlay 1-1')
        oo12 = Overlay.objects.create(stack=os1, title='Overlay 1-2')
        os2 = OldStack.objects.create(title='Old Stack', comment='Old Stack 2')
        oo21 = Overlay.objects.create(stack=os2, title='Overlay 2-1')

        self.run_migration()

        StackGroup = self.get_model_after('StackGroup')
        StackStackGroup = self.get_model_after('StackStackGroup')
        NewStack = self.get_model_after('Stack')

        sg = StackGroup.objects.annotate(num_ssg=Count('stackstackgroup')).filter(num_ssg=3)[0]
        self.assertEqual(sg.title, 'Old Stack')

        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Old Stack',
                                                       stack__comment='Old Stack 1',
                                                       group_relation__name='view').exists())
        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Overlay 1-1',
                                                       group_relation__name='view').exists())
        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Overlay 1-2',
                                                       group_relation__name='view').exists())

        sg = StackGroup.objects.annotate(num_ssg=Count('stackstackgroup')).filter(num_ssg=2)[0]
        self.assertEqual(sg.title, 'Old Stack')

        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Old Stack',
                                                       stack__comment='Old Stack 2',
                                                       group_relation__name='view').exists())
        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Overlay 2-1',
                                                       group_relation__name='view').exists())


    def test_migrate_stack_groups(self):
        OldProject = self.get_model_before('Project')
        OldStack = self.get_model_before('Stack')
        OldC = self.get_model_before('Class')
        OldCI = self.get_model_before('ClassInstance')
        OldSCI = self.get_model_before('StackClassInstance')
        OldR = self.get_model_before('Relation')
        OldUser = self.get_model_before('auth.User')

        user = OldUser.objects.create(username='Test user', is_superuser=True)
        op = OldProject.objects.create(title='Old Project')
        old_stack_group_class = OldC.objects.create(project=op, class_name='stackgroup', user=user)
        has_view = OldR.objects.create(project=op, relation_name='has_view', user=user)
        has_channel = OldR.objects.create(project=op, relation_name='has_channel', user=user)

        old_stack_group = OldCI.objects.create(project=op, class_column=old_stack_group_class, user=user)
        os1 = OldStack.objects.create(title='Old Stack 1')
        osci1 = OldSCI.objects.create(project=op, class_instance=old_stack_group, stack=os1, relation=has_view, user=user)
        os2 = OldStack.objects.create(title='Old Stack 2')
        osci1 = OldSCI.objects.create(project=op, class_instance=old_stack_group, stack=os2, relation=has_channel, user=user)

        self.run_migration()

        StackGroup = self.get_model_after('StackGroup')
        StackStackGroup = self.get_model_after('StackStackGroup')
        StackGroupRelation = self.get_model_after('StackGroupRelation')

        sg = StackGroup.objects.all()[0]
        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Old Stack 1',
                                                       group_relation__name='view').exists())
        self.assertTrue(StackStackGroup.objects.filter(stack_group=sg,
                                                       stack__title='Old Stack 2',
                                                       group_relation__name='channel').exists())
