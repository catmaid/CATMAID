.. _nblast-setup:

Configuring NBLAST
==================

After setting up the :ref:`R environment <r_setup>` for NBLAST the front-end
tools like the Similarity Widget should work. By default these tools will read
the most recent skeleton data from the database. For bigger datasets this can
introduce some performance problems. Typically, in bigger datasets, only a small
portion of skeleton does actually change and a cache can be used for some data.

Creating skeleton caches
------------------------

Caches are stored in R's binary RDS files in the ``cache`` directory in the
``MEDIA_ROOT`` path. At the moment, caches are created either manually, e.g.
through the management shell or through a cron job::

    from catmaid.control import nat
    project_id = 1
    nat.create_dps_data_cache(project_id, 'skeleton', tangent_neighbors=5, detail=10, min_nodes=100, progress=True)

This would create the cache file `r-dps-cache-project-1-skeleton-10.rda``,
following the pattern ``r-dps-cache-project-<project-id>-<type>-<detail>.rda``.

Caches can be created for the types ``skeleton`` and ``pointcloud``. The
``tangend_neighbords`` settings defines how many neighbor points should be used
to compute a tangent vector, the default is 20, but 5 often yields good results
as well and is faster. The ``detail`` setting defins the branching level below
which skeletons will be pruned. Using the ``min_nodes`` setting, only skeletons
with the respective minimum number of nodes are included. By default, no
progress is shown, which can be changed using the ``progress`` setting.
