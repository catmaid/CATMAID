from django.db import connection

def enable_spatial_update_events(ignore_missing_fn:bool=False) -> bool:
    """Enable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT * FROM pg_proc
            WHERE proname = 'enable_spatial_update_events');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("SELECT enable_spatial_update_events()")
    return True


def disable_spatial_update_events(ignore_missing_fn:bool=False) -> bool:
    """Disable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT * FROM pg_proc
            WHERE proname = 'disable_spatial_update_events');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("SELECT disable_spatial_update_events()")
    return True

