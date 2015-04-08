import catmaid.models

from django.db.models import signals
from catmaid.models import Project
from catmaid.conf import settings as catmaid_settings

def init_classification(sender, app, created_models, **kwargs):
    """ Creates a dummy project to store classification graphs in.
    """
    if sender == catmaid.models:
        try:
            Project.objects.get(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID)
        except Project.DoesNotExist:
            print("Creating ontology dummy project")
            Project.objects.create(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID,
                title="Classification dummy project")

signals.post_syncdb.connect(init_classification)
