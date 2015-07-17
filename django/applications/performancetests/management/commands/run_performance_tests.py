from django.db import connection
from django.conf import settings
from django.core.management.base import NoArgsCommand, CommandError

from optparse import make_option

from performancetests import PerformanceTest
from performancetests.models import TestView


class Command(NoArgsCommand):
    help = "Test all available test views and save generated TestResult objects."

    option_list = NoArgsCommand.option_list + (
        make_option('--dont-save', dest='saveresults',
            default=True, action='store_false',
            help='Don\'t save generated test results to the database'),
        )

    def handle_noargs(self, **options):
        # Make sure we have all neaded parameters available
        if not hasattr(settings, 'PERFORMANCETESTS_TEMPLATE_DB'):
            raise CommandError('Could not find required setting PERFORMANCETESTS_TEMPLATE_DB')
        if not hasattr(settings, 'PERFORMANCETESTS_TEST_USER'):
            raise CommandError('Could not find required setting PERFORMANCETESTS_TEST_USER')
        if not hasattr(settings, 'PERFORMANCETESTS_TEST_PASS'):
            raise CommandError('Could not find required setting PERFORMANCETESTS_TEST_PASS')

        test_table_space = getattr(settings, 'PERFORMANCETESTS_TABLE_SPACE', None)
        template_db = settings.PERFORMANCETESTS_TEMPLATE_DB
        test_user = settings.PERFORMANCETESTS_TEST_USER
        test_pass = settings.PERFORMANCETESTS_TEST_PASS

        test = PerformanceTest(connection, test_user, test_pass, template_db,
                               test_table_space)

        views = list(TestView.objects.all().order_by('id'))
        if not views:
            self.stdout.write('No test views found')
            return

        results = test.run_tests(views)

        # Print and optionally save all results
        for r in results:
            self.stdout.write("URL: %s Time: %sms" % (r.view.url, r.time))

            if options['saveresults']:
                r.save()

        if options['saveresults']:
            self.stdout.write('Saved all results')
        else:
            self.stdout.write('Did not save results')
