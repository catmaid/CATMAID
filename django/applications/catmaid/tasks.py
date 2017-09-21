from django.core.management import call_command
from catmaid.control.cropping import cleanup as cropping_cleanup, process_crop_job
from catmaid.control.nat import export_skeleton_as_nrrd_async
from catmaid.control.treenodeexport import process_export_job
from catmaid.control.roi import create_roi_image
from celery import shared_task


@shared_task
def cleanup_cropped_stacks():
    """Define a periodic task that runs every day at midnight. It removes all
    cropped stacks that are older than 24 hours.
    """
    seconds_per_day = 60 * 60 * 24
    cropping_cleanup(seconds_per_day)
    return "Cleaned cropped stacks directory"


@shared_task
def update_project_statistics():
    """Call management command to update all project statistics
    """
    call_command('catmaid_populate_summary_tables')
    return "Updated project statistics summary"
