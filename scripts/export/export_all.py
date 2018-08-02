# -*- coding: utf-8 -*-

# Albert Cardona 2015-02-03
# This file is meant to be run from within ./manager.py shell in the environment, like:
# [1] load 'export_all.py'
# [2] project_id = 12
# [3] export(project_id)

from django.db import transaction
import export_all_graphml
import export_all_csv
import export_all_annotations

@transaction.atomic
def export(project_id):
    project_id = int(project_id)
    export_all_graphml.export(project_id, "all." + str(project_id) + ".graphml")
    export_all_csv.export(project_id, "all")
    export_all_annotations.export(project_id, "all", "all")

