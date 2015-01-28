import sys
import gc
import timeit

from django.conf import settings


class PerformanceTest(object):
    """
    Test query performance for a set of views. It will create a new database
    that has the some content as a template databse, test views against it and
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

    from catmaid.tests.performance_test import View, PerformanceTest
    from django.db import connection

    if __name__ == "__main__":
        views = [
            View('GET', '/permissions'),
            View('GET', '/dataviews/default'),
            View('GET', '/projects'),
        ]
        template_db_name = 'catmaid_performance_test'
        test = PerformanceTest(connection, 'user', 'pass', template_db_name)
        results = test.run_tests(views)

        # Print all results
        for r in results:
            print("URL: %s Time: %sms" % (r.view.url, r.time * 1000))
            print('\t' + str(r.result).replace('\n', '\n\t'))
    """

    def __init__(self, connection, user, password, template_db_name):
        """
        Create a new performance test instance. It expects a database connection
        as parameter. The easiest way to get one is to use django.db.connection.
        A CATMAID user and password is required as well.
        """
        from django.test.client import Client
        self.connection = connection
        self.client = Client()
        self.client.login(username=user, password=password)
        self.template_db_name = template_db_name

    def log(self, msg):
        """
        Prints a message and is basically a placeholder to add better logging.
        """
        print(msg)

    def create_db(self, cursor, db_name, db_template):
        """
        Create a new database from a template.
        """
        try:
            self.log("Creating test database")
            cursor.execute('CREATE DATABASE "%s" WITH TEMPLATE "%s"' %
                           (db_name, db_template))
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

    def run_tests(self, views):
        """
        Run the CATMAID performance tests.
        """
        from django.test.utils import setup_test_environment, \
            teardown_test_environment
        setup_test_environment()

        # We need a cursor to talk to the database
        cursor = self.connection.cursor()

        # Create test database, based on an existing template databse
        db_name = "test_%s" % self.template_db_name

        self.create_db(cursor, db_name, self.template_db_name)

        # Store new database configuration
        self.connection.close()
        old_db_name = settings.DATABASES[self.connection.alias]["NAME"]
        settings.DATABASES[self.connection.alias]["NAME"] = db_name
        self.connection.settings_dict["NAME"] = db_name

        # Ensure a connection for the side effect of initializing the test
        # database.
        self.connection.ensure_connection()

        # Test all views
        self.log("Testing all %s views" % len(views))
        results = []
        for v in views:
            # Ideally the DB cluster would be stopped here, OS caches would be
            # dropped (http://linux-mm.org/Drop_Caches) and then the DB cluster
            # would be restarted.
            results.append(self.test(v))

        teardown_test_environment()

        # Restore the original database name
        self.connection.close()
        settings.DATABASES[self.connection.alias]["NAME"] = old_db_name
        self.connection.settings_dict["NAME"] = old_db_name
        self.connection.ensure_connection()
        self.drop_db(self.connection.cursor(), db_name)

        return results

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
            return TestResult(view, end - start, response)
        finally:
            if gc_old:
                gc.enable()


class View():
    """
    Represents a views that should be tested. It expects 'GET' or 'POST'
    as method, a URL and optionally a data dictionary.
    """
    def __init__(self, method, url, data={}):
        self.method = method
        self.url = url
        self.data = data


class TestResult(object):
    """
    Respresents the result of test of the given view. It expects a time and a
    result.
    """
    def __init__(self, view, time, result):
        self.view = view
        self.time = time
        self.result = result
