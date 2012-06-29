from django.db import transaction
from django.http import HttpResponse


class AbortAndReport(Exception):
    def __init__(self, error_json_report):
        self.error_json_report = error_json_report

    def __str__(self):
        return self.error_json_report


def catmaid_transact_or_error(f):

    @transaction.commit_manually
    def decorated_with_catmaid_transact_or_error(request, *args, **kwargs):
        try:
            f()
        except AbortAndReport as e:
            if transaction.is_dirty():
                transaction.rollback()
            return HttpResponse(e.error_json_report)
        except:
            if transaction.is_dirty():
                transaction.rollback()
            raise
        else:
            if transaction.is_dirty():
                try:
                    transaction.commit()
                except:
                    transaction.rollback()
                    raise
