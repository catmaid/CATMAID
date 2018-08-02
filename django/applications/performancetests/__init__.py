# -*- coding: utf-8 -*-

import sys
import gc
import timeit
import subprocess
import compileall

from django.conf import settings


class PerformanceTest(object):
    """
    Test query performance for a set of views. It will create a new database
    that has the some content as a template database, test views against it and
    eventually will destroy the database again. This is done to generate timing
    information that is comparable (without database caching). This class is
    probably best used from a custom script and is not part of Django's test
    framework. This could for instance look like this:

    #!/usr/bin/env python
    # Needed by Django
    import os
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
    # This is needed to have sys.path correctly extended so that CATMAID modules
    # can be found.
    import settings

    from performancetests import PerformanceTest
    from performancetests.models import TestView
    from django.db import connection

    if __name__ == "__main__":
        pid = 1
        sid = 2

        views = [
            TestView(method='GET', url='/permissions'),
            TestView(method='POST', url='/%s/annotations/list' % pid),
            TestView(method='POST', url='/%s/node/list' % pid, data={
                'pid': pid,
                'sid': sid,
                'z': 62350,
                'top': 4781.168,
                'left': 17382.772,
                'width': 69501.549,
                'height': 32037.332,
                'zres': 50,
                'atnid': 18130840,
                'labels': 'false',
            }),
        ]

        template_db_name = 'catmaid_performance_test'
        test = PerformanceTest(connection, 'user', 'pass', template_db_name)
        results = test.run_tests(views)

        # Print all results
        for r in results:
            print("URL: %s Time: %sms" % (r.view.url, r.time))
            print('\t' + str(r.result).replace('\n', '\n\t'))

            # Optionally, make results persistent
            r.save()
    """

    def __init__(self, connection, username, password, template_db_name,
            target_tablespace = None):
        """
        Create a new performance test instance. It expects a database connection
        as parameter. The easiest way to get one is to use django.db.connection.
        A CATMAID user and password is required as well.
        """
        from django.test.client import Client
        self.connection = connection
        self.username = username
        self.password = password
        self.client = Client()
        self.template_db_name = template_db_name
        self.target_tablespace = target_tablespace

    def log(self, msg):
        """
        Prints a message and is basically a placeholder to add better logging.
        """
        print(msg)

    def create_db(self, cursor, db_name, db_template, tablespace = None):
        """
        Create a new database from a template.
        """
        try:
            self.log("Creating test database")
            query = 'CREATE DATABASE "%s" WITH TEMPLATE "%s"' % (db_name, db_template)
            if tablespace:
                query += " TABLESPACE %s" % (tablespace,)
            cursor.execute(query)
            self.log("Database %s successfully created" % db_name)
        except Exception as e:
            sys.stderr.write("Got an error creating the performance test "
                             "database: %s\n" % e)
            sys.exit(1)

    def drop_db(self, cursor, db_name):
        """
        Destroy a test database.
        """
        try:
            self.log("Dropping test database")
            cursor.execute('DROP DATABASE "%s"' % db_name)
            self.log("Database %s successfully destroyed" % db_name)
        except Exception as e:
            sys.stderr.write("Got an error deleting the performance test "
                             "database: %s\n" % e)
            sys.exit(1)

    def run_tests(self, views, n_repeat=2):
        """
        Run the CATMAID performance tests and return a list of results for
        every run.
        """
        results, _ = self.run_tests_and_repeat(views, repeats=n_repeat)
        return results

    def run_tests_and_repeat(self, views, repeats=3):
        """
        Run the CATMAID performance tests and return a list of results and a
        list of repeats for every run.
        """
        from django.test.utils import setup_test_environment, \
            teardown_test_environment
        setup_test_environment()

        # Make sure all python code is compiled to not include this timing
        compileall.compile_path(maxlevels=10)
        self.log("Made sure all Python modules in sys.path are compiled")

        # We need a cursor to talk to the database
        cursor = self.connection.cursor()

        # Create test database, based on an existing template database
        db_name = "test_%s" % self.template_db_name

        self.create_db(cursor, db_name, self.template_db_name, self.target_tablespace)

        # Store new database configuration
        self.connection.close()
        old_db_name = settings.DATABASES[self.connection.alias]["NAME"]
        settings.DATABASES[self.connection.alias]["NAME"] = db_name
        self.connection.settings_dict["NAME"] = db_name

        # Ensure a connection for the side effect of initializing the test
        # database and login.
        self.connection.ensure_connection()
        self.client.login(username=self.username, password=self.password)

        # Test all views
        self.log("Testing all %s views" % len(views))
        results = []
        repeat_results = [[] for i in range(repeats)]
        for v in views:
            # Ideally the DB cluster would be stopped here, OS caches would be
            # dropped (http://linux-mm.org/Drop_Caches) and then the DB cluster
            # would be restarted.
            results.append(self.test(v))
            for r in range(repeats):
                repeat_results[r].append(self.test(v))

        teardown_test_environment()

        # Restore the original database name
        self.connection.close()
        settings.DATABASES[self.connection.alias]["NAME"] = old_db_name
        self.connection.settings_dict["NAME"] = old_db_name
        self.connection.ensure_connection()
        self.drop_db(self.connection.cursor(), db_name)

        return results, repeat_results

    def test(self, view):
        """
        Calls the given view and measures the time for it to return. The
        garbage collector is diabled during execution.
        """
        gc_old = gc.isenabled()
        gc.disable()
        try:
            start = timeit.default_timer()
            if view.method == 'GET':
                response = self.client.get(view.url, view.data)
            elif view.method == 'POST':
                response = self.client.post(view.url, view.data)
            else:
                raise ValueError('Unknown view method: %s' % view.method)

            end = timeit.default_timer()
            # Return result in milliseconds
            time_ms = (end - start) * 1000
            # Try to get version information
            version = subprocess.check_output(['git', 'describe'])

            from .models import TestResult
            return TestResult(view=view, time=time_ms, result=response,
                              result_code=response.status_code, version=version)
        finally:
            if gc_old:
                gc.enable()
