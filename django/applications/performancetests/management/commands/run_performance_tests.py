import numpy as np
import scipy.stats as stats

from django.db import connection
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from optparse import make_option

from performancetests import PerformanceTest
from performancetests.models import TestView


class Command(BaseCommand):
    help = "Test all available test views and save generated TestResult objects."

    def add_arguments(self, parser):
        parser.add_argument('--dont-save', dest='saveresults',
            default=True, action='store_false',
            help='Don\'t save generated test results to the database')

    def handle(self, *args, **options):
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

        n_repeat = getattr(settings, 'PERFORMANCETESTS_TEST_REPEAT', 0)

        results, repeat_runs = test.run_tests_and_repeat(views, n_repeat)

        # Calculate std. deviation and std. error
        std_dev = []
        std_err = []
        if repeat_runs:
            self.stdout.write("Calculating average timings")
            n_samples = 1 + len(results)
            for n,r in enumerate(results):
                timings = [r.time] + [rr[n].time for rr in repeat_runs]
                r.time = sum(timings) / n_samples
                std = np.std(timings, ddof=1)
                sem = stats.sem(timings, axis=None, ddof=1)
                std_dev.append(std)
                std_err.append(sem)
        else:
            std_dev = ("-",) * len(results)
            std_err = ("-",) * len(results)

        # Print and optionally save all results
        for i,r in enumerate(results):
            self.stdout.write("URL: %s Time: %sms N: %s SD: %s SE: %s" % (
                r.view.url, r.time, 1 + n_repeat, std_dev[i], std_err[i]))

            if options['saveresults']:
                r.save()

        if options['saveresults']:
            self.stdout.write('Saved all results')
        else:
            self.stdout.write('Did not save results')
