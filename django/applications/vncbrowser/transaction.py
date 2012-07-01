from django.db import transaction
from django.http import HttpResponse, Http404

import json


class RollbackAndReport(Exception):
    def __init__(self, error_report_dict):
        self.error_report_dict = error_report_dict

    def __str__(self):
        return self.error_report_dict


def reportable_commit_on_success_transaction(f):
    """
    This decorator works as django's transaction.commit_on_success
    but with added functionality. For any raised exception, all
    database activity will be rolled back as usual, but we now have
    the ability to return an HttpResponse to report the error.

    If you raise the RollbackAndReport exception, it will return
    an HTTP 200 response with the error data of your choosing.
    This data should be a dict, as it will be converted to JSON for
    inclusion in the HTTP response.

    If you raise an Http404 exception, any error message will be
    inserted into an 'error' key in the json response.
    """

    @transaction.commit_manually
    def decorated_function(*args, **kwargs):
        try:
            result = f(*args, **kwargs)
        except RollbackAndReport as e:
            if transaction.is_dirty():
                transaction.rollback()
            return HttpResponse(json.dumps(e.error_report_dict))
        except Http404 as e:
            if transaction.is_dirty():
                transaction.rollback()
            error_message = str(e)
            if error_message == "":
                error_message = "Unknown HTTP 404 error."
            return HttpResponse(json.dumps({'error': error_message}))
        except:
            if transaction.is_dirty():
                transaction.rollback()
            raise
        else:
            if transaction.is_dirty():
                try:
                    transaction.commit()
                    return result
                except:
                    transaction.rollback()
                    raise

    return decorated_function
