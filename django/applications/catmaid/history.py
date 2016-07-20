from django.db import connection


def add_log_entry(user_id, label):
    """Give a label to the current transaction and time, executed by a
    particular user. This information is recorded only once per transaction, and
    subsequent calls will be ignored silently.
    """
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO catmaid_transaction_info (user_id, change_type, label)
        VALUES (%s, 'Backend', %s)
        ON CONFLICT DO NOTHING
    """, (user_id, label))


def record_request_action(label):
    """Give a label to the current transaction and time, executed by a Django
    user as provided by the wrapped function's request parameter. This
    parameter is first looked up in the function's keyword arguments and if not
    found, the request is expected to be provided as the first argument.
    """
    def decorator(f):
        def wrapped_f(*args, **kwargs):
            if 'request' in kwargs:
                user_id = kwargs['request'].user.id
            elif len(args) > 0:
                user_id = args[0].user.id
            else:
                raise ValueError("Couldn't find request to record action for")

            result = f(*args, **kwargs)
            print "Log", user_id, label
            add_log_entry(user_id, label)
            return result
        return wrapped_f
    return decorator


def record_action(user_id, label):
    """Give a label to the current transaction and time, executed by a
    particular user.
    """
    def decorator(f):
        def wrapped_f(*args, **kwargs):
            result = f(*args, **kwargs)
            add_log_entry(user_id, label)
            return result
        return wrapped_f
    return decorator


def enable_history_tracking(ignore_missing_fn=False):
    """Enable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT * FROM pg_proc
            WHERE proname = 'enable_history_tracking');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("SELECT enable_history_tracking()")
    return True


def disable_history_tracking(ignore_missing_fn=False):
    """Disable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT * FROM pg_proc
            WHERE proname = 'disable_history_tracking');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("SELECT disable_history_tracking()")
    return True


def sync_history_table(table):
    """Sync history of a particular table. By default a time column named
    "creation_time" is expected, which can be changed or disabled (if falsy).
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT sync_history_table(%s::regclass,
            (SELECT history_table_name FROM catmaid_history_table
            WHERE live_table_name=%s::regclass)::text)
    """, (table, table, table))
