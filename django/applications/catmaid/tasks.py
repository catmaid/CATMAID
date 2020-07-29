import logging

from django.core.management import call_command
from django.conf import settings
from catmaid.control.cropping import cleanup as cropping_cleanup, process_crop_job
from catmaid.control.nat.r import export_skeleton_as_nrrd_async
from catmaid.control.treenodeexport import process_export_job
from catmaid.control.roi import create_roi_image
from catmaid.control.node import update_node_query_cache as do_update_node_query_cache
from catmaid.control.authentication import deactivate_inactive_users as \
    deactivate_inactive_users_impl
from celery import shared_task, Task

logger = logging.getLogger(__name__)


class LoggingTask(Task):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.exception('Task failed: %s' % exc, exc_info=exc)
        super(LoggingTask, self).on_failure(exc, task_id, args, kwargs, einfo)


@shared_task
def cleanup_cropped_stacks() -> str:
    """Define a periodic task that runs every day at midnight. It removes all
    cropped stacks that are older than 24 hours.
    """
    seconds_per_day = 60 * 60 * 24
    cropping_cleanup(seconds_per_day)
    return "Cleaned cropped stacks directory"


@shared_task
def update_project_statistics() -> str:
    """Call management command to update all project statistics
    """
    call_command('catmaid_refresh_node_statistics')
    return "Updated project node statistics summary"


@shared_task
def update_project_statistics_from_scratch() -> str:
    """Call management command to update all project statistics
    """
    call_command('catmaid_refresh_node_statistics', clean=True)
    return "Updated and cleand project node statistics summary"


@shared_task
def update_node_query_cache() -> str:
    """Update the query cache of changed sections for node providers defined in
    the NODE_PROVIDERS settings variable.
    """
    do_update_node_query_cache()
    return "Updating node query cache"

@shared_task
def deactivate_inactive_users() -> str:
    """Mark all those users as inactive that didn't log in within a specified
    time range. Which users this are is defined by their group memberships. If a
    user is member of a group that is also marked as "deactivation group"
    (dedicated relation) and hasn't logged in since the associated time range,
    the user account is set to inactive.
    """
    inactive_users = deactivate_inactive_users_impl()
    return f"Deactivated inactive users ({len(inactive_users)} in total)"
