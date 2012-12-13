import json

from django.db import transaction
from django.http import HttpResponse, Http404

class CatmaidException(Exception):
    def __init__(self, error):
        self.error = error
    def __str__(self):
        return self.error

def report_error(f):
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            return HttpResponse(json.dumps({'error': str(e)}))
    return decorated_function

def transaction_reportable_commit_on_success(f):

    @transaction.commit_manually
    def decorated_function(*args, **kwargs):
        try:
            result = f(*args, **kwargs)
            if transaction.is_dirty():
                transaction.commit()
            return result
        except Exception as e:
            if transaction.is_dirty():
                transaction.rollback()
            return HttpResponse(json.dumps({'error': str(e)}))

    return decorated_function
