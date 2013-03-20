from django.db.models import signals
from catmaid.models import Project
from catmaid import models as catmaid_app
from catmaid.conf import settings as catmaid_settings

def init_classification(**kwargs):
    """ Creates a dummy project to store classification graphs in.
    """
    try:
        Project.objects.get(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID)
    except Project.DoesNotExist:
        Project.objects.create(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID,
            title="Classification dummy project")

signals.post_syncdb.connect(init_classification)
