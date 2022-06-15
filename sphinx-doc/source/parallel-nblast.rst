.. _parallel-nblast:

Parallel large NBLAST computations
==================================

Computing smaller NBLAST queries like asking for the similarity of a handful of
neurons versus the `cached representation <nblast-skeleton-cache>` will only
take a few seconds. Computing a large all-by-all similarity result can however
be a different problem. In this section we will consider the NBLAST computation
of the skeltonized version of the automatically segmented FAFBv14 dataset. It
contains about 31,5 million fragments. Comparing each of them to all the other
ones will in its entirely result in 992.25 million comparisons and scores. Of
course, not all of the results are useful and there are different optimizations
possible to minimize the time on a compute cluster, because its use usually has
to be paid.

Large parallel NBLAST computations aren't configurable from the web front-end.
Instead, a management command has to be used directly on the server. This
management command is called ``catmaid_parallel_nblast``. It serves both as a
worker in a parallel computation as well as a tool to create small Bash scripts
that can be easily run in parallel, e.g. on a cluster. It comes with may options,
most of which relate to either task preparation or optimization. Using the
``--help`` flag will show more details: ``manage.py catmaid_parallel_nblast
--help``. Most of the options will be discussed below.

In worker mode, this management command will first select the neurons/skeletons
it will use as its "query" set and will then compare this set against all others
using a user provided reference to a similarity object. This similarity object
can be created in the front-end's Neuron Similarity widget. More details will be
provided below.

As a task creator, it will create as many partial computation scripts as
requested, which can then e.g. be submitted to a cluster. By default, the
management command starts as a worker. To create tasks, provide the
``--create-tasks`` parameter. In task creation mode, all other arguments will
become parameters for all created tasks.

The number of tasks is defined with the ``--n-jobs <N_JOBS>`` argument. Together
with the ``--similarity-id <id>`` argument, it is one of the core parameters and
is discussed in more detail below.

Selecting query skeletons
-------------------------

Each parallel job should run for a similar amount of time. Since skeletons vary
in length, we can't simply select random sets of skeletons. Instead the script
will add up the length of skeletons and divide it by the number of jobs, leading
to buckets with skeletons with a similar total length. Each job is then assigned
an numeric bucket index. A worker will regenerate this histogram and pick the
correct bucket based on this ID

Without further constraints, both management command and worker will choose
their bucket among all skeletons, based on the provided bucket ID and
recomputing all buckets.

The number of skeletons can be lowered by providing a minimum length
``--min-length <length>`` (in nanometer), which is also usually advisable from
an analysis point of view. Of course, this also depends on the analysis that is
aimed for. Here is an example: for many NBLAST computations in the context of
the FAFBv14 dataset, we only considered fragments of ten microns and larger,
leading to the use of the argument ``--min-length 10000``. The pool of
candidates (e.g. all skeletons 10um+) is then sorted by ID and broken into
almost-equal lengths buckets.

With ``--min-length 10000`` and ``n-jobs 10000``, the automatically segmented
FAFBv14 dataset averages 200 skeletons, targeting a cable length of 9,167,953 nm
per task to cover a total length of 91,679,529,940 nm of 2,336,920 skeletons.

Number of jobs
--------------

How many separate jobs are useful depends of course on many factors like compute
time for a single job, compute cost, time constraints, etc. Testing jobs with
different sizes (e.g. 100, 1000, 10000) is advised. The ``--n-jobs <N_JOBS>``
parameter has to be provided both in worker and task creation mode. Workers use
this information together with a ``--compute-bin <BIN>`` parameter to determine
the skeletons to work on. For the initial example of the autosegmented FAFBv14
dataset, a number of 10,000 tasks felt appropriate, where each task would take
about 15min, with a parallel CPU use in about 70% of it.

Similarity objects and similarity configurations
------------------------------------------------

Similarity objects keeps track of some basic parameters of a similarity
computation as well as its status. Apart from defining on what skeletons the
similarity computation will run on, NBLAST parameters like normalization, the
result storage type as well as a so called *Similarity configuration* can be
defined.

Similarity configurations keep track of the NBLAST *scoring matrix* and some
parameters on how to create them. A scoring matrix is the most central parameter
of an NBLAST computation, because it assigns a score to a combination of
distance between two points and their relative angle.

Both, similarity objects and similarity configurations can be created through
the front-end's Neuron Similarity Widget. In its *Configurations* tab, existing
NBLAST configurations can be viewed an new ones can be created. The easiest way
to do this is to click the *Create built-in matrix* button and create a tested
scoring matrix based on the adult fly brain. Make sure to scale it to your
dataset in the UI.

Generally, such a configuration stores parameters that determine how the NBLAST
computations are performed. NBLAST scores always exist in relation to such a
configuration. Each entry in the list of configurations in the *Configurations*
tab provides a *View* link, which provides a visual representation of a scoring
matrix.

The parameters stored in an NBLAST configuration include the binning for
distances and angles between nodes as well as information on whether query and
target skeleton should be resampled. It also stores information on how to
compute the scoring matrix from scratch.

With a similarity configuration created, a new similarity object can be created
in the first tab, *Neuron similarity*. Provide an optional name, and select any
query and target skeleton. In this example, the parallel NBLAST computation will
ignore the selected query and target skeletons provided here. Instead it will
use a filtering mechanism on the command line. Select a normalization method
like geometric mean (how forward and backward score are combined into a final
score). As storage mode, a relational storage is required for large result sets.
Smaller computations (<1000 skeletons) can be done in BLOB mode. As a central
option, a similarity configuration has to be selected (e.g. the one created
above). Since we don't want to run this NBLAST computation right away (but
e.g. rather run it on a cluster), click on the button "Apply only (don't run)".
This will only add the similarity object and we can find its ID in the table of
similarity objects below.

For running the parallel NBLAST management command, the ID of an NBLAST
object is needed. It is provided to the command using the
``--similarity-id <ID>`` parameter.

Running a basic NBLAST computation
----------------------------------

With a similarity ID chosen, it is now possible to run a simple version of the
management command, without any parallelization. On the server hosting the
CATMAID database that should keep track of the results, try running the
following management command, using a similarity ID of an similarity object,
that was created before::

  python manage.py catmaid_parallel_nblast --similarity-id $SIMILARITY_ID --n-jobs 1000 --compute-bin 0

This will divides all skeletons into arbitrary 1000 jobs and computes the
first one. If this starts without errors and NBLAST values are computed, we know
that the NBLAST configuration (the similarity object) should work in principle.
The computation can be stopped for now (Ctrl + C).

It is important to get a good baseline time for running one of these tasks. This
will be important to optimize the computation as well as to settle of the number
of compute tasks. Therefore, as a starting point, it might make sense to try a
few different number of jobs to see how long a single run can take. Keep in mind
though, that this should be redone on the type of machine that will actually run
the full parallelized computation (i.e. a cluster node).

Loading skeletons and computing NBLAST scores can be very time consuming.
Therefore, there are various optimizations possible to reduce the time needed to
finish the computation of one NBLAST job. Before we look into setting up cluster
compute nodes, these optimizations will

Setting up parallel NBLAST computation
--------------------------------------

Before we can run the computation on compute nodes, we need to allow remote
connections to the database (``listen_address = '0.0.0.0'`` in
``postgressql.conf`` and an entry in ``pg_hba.conf`` to allow connections to the
target database with a special user, ideally limited to a local subnet, e.g.::

  host    catmaid   catmaid_nblast_user  10.10.0.0/16  md5

The next section explains how to create a user with limited write access.

Should the compute nodes have no direct access the database, the parallel NBLAST
computation management command is able to start and use an SSH tunnel through a
host that is visible by both ends.

All remaining configuration apart from the user creation should be done on a
compute node or o similar host in the cluster network.

NBLAST result writing access control
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To restrict potential damage a cluster job can do on a production database, it
is advisable to create a new database user in the target database. This user
should only be allowed to write to the ``nblast_similarity_score`` table. As a
database superuser this can be done like that::

  CREATE ROLE catmaid_nblast_user WITH LOGIN PASSWORD 'AStrongPassword' NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION VALID UNTIL 'infinity';
  GRANT CONNECT ON DATABASE catmaid TO catmaid_nblast_user;
  \c catmaid
  GRANT USAGE ON SCHEMA public TO catmaid_nblast_user;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO catmaid_nblast_user;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO catmaid_nblast_user;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public to catmaid_nblast_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO catmaid_nblast_user;
  GRANT SELECT ON TABLE catmaid_nblast_score TO catmaid_nblast_user;
  GRANT SELECT, UPDATE ON TABLE nblast_similarity TO catmaid_nblast_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE nblast_similarity_score TO catmaid_nblast_user;

Conda environment for cluster nodes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Executing CATMAID code on a cluster node, requires the all CATMAID dependencies
to be installed. Often times, it is not possible to install new system level
dependencies on cluster nodes. So in order to use a more recent Python version
or install additional dependencies, ``Conda`` is useful. After installing
MiniConda, a new Conda environment can be created and activated::

  conda create -n catmaid python=3.8
  conda activate catmaid

In this environment, we also need to install the CATMAID dependency GDAL as well
as R (to later run NBLAST)::

  conda install -c conda-forge gdal r-base=4 libgit2

To test the GDAL installation, run ``gdalinfo --version``. If this leads to an
error about a missing ``libtiledb.so.2.2`` (OSError: libtiledb.so.2.2: cannot
open shared object file), install the required ``tiledb`` version::

  conda install -c conda-forge tiledb=2.2

With this installed, all regular CATMAID dependencies can be installed::

  conda install pip
  pip install -r django/requirements.txt

With this in place, CATMAID can be configured in ``django/configuration.py``
(and running ``django/create_configuration.py``). As database, use the central
target database, that all cluster nodes should connect to (e.g. a production
database on another server), using the NBLAST user created before.

To check everything is working, the ``manage.py check`` management command
should run without raising an exception.

Set up R environment for cluster nodes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Create a writable directory for the R environment and add it to your
``settings.py`` file::

  R_LIBS_HOME = '/path/to/user/writable/folder/r_libs'
  os.environ['R_LIBS_USER'] = R_LIBS_USER

With this in place, install all required R dependencies for NBLAST::

  manage.py catmaid_setup_nblast_environment

Note that this will likely trigger some GitHub rate limiting. This can be
prevented by creating a Personal Access Token on GitHub (Settings > Dev.
Settings > Personal Access Token) and then export it as environment variable::

  export GITHUB_PAT='<your-github-pat>'

Rerunning the ``manage.py catmaid_setup_nblast_environment`` management command,
should now work without rate limiting.

Initial parameterization of NBLAST jobs
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To make testing of different parameters a bit easier to test on the cluster,
let's create a simple script that we can run through its resource manager (e.g.
Slurm, LSF, etc.), ``nblast-jobs/nblast-job.0.sh``::

  #!/bin/bash -l

  conda activate catmaid

  function finish {
    echo "Exit"
    conda deactivate
  }
  trap finish EXIT

  date;hostname;pwd
  python manage.py catmaid_parallel_nblast --similarity-id <SIMILARITY_ID> --n-jobs 1000 --compute-bin 0
  date

This will activate the already prepared Conda environment, run the first of 1000
compute jobs.

Test run using Slurm
--------------------

To compute the NBLAST scores between about 25,000 skeletons in the FAFBv14
dataset, we configure a CATMAID environment that can be used from a node in a
larger compute cluster.

In in this particular environment, *Slurm* is used as a resource manager. Since
we will use one Bash script per task, we want to use its array task
capabilities. This allows us to queue sub-ranges for testing and makes it easy
to define a maximum number of parallel tasks. For each array job, Slurm will set
an environment variable called ``SLURM_ARRAY_TASK_ID``. To translate this into a
filename, we can use a simple script like this
(``nblast-jobs/array_nblast_job.sh``)::

  #!/bin/bash -l
  F_PATH_NAME="/path/to/cluster/catmaid/django/projects/nblast-jobs/nblast-job.%a.sh"

  if [[ ! -z ${SLURM_ARRAY_TASK_ID} ]]; then
    F_PATH_NAME=$(echo $F_PATH_NAME | sed -e "s|%a|${SLURM_ARRAY_TASK_ID}|g")
  fi

  echo "Hosthame: `hostname`"
  echo "Array task ID: ${SLURM_ARRAY_TASK_ID}"
  echo "File: ${F_PATH_NAME}"
  /bin/bash -l ${F_PATH_NAME}

To test different parameters, we start out with the script for the first job
that was created manually above (``nblast-jobs/nblast-job.0.sh``)::

Such a task can now be queued with Slurm as an array task like this::

  sbatch --job-name=parallel_nblast --array=0-0%1 -nodes=1 --ntasks=20 \
    --mem-per-cpu=2G --time=03:00:00 --output=%x_%a_%j.log --partition=short \
    /path/to/cluster/catmaid/django/projects/nblast-jobs/array_nblast_job.sh

This will only run an array with a single entry (index 0), with max. one job
being run at the same time (``0-0%1``). We also allow only a single compute node
with 20 cores and 2G of memory per core. CATMAID was also configured in
``settings.py`` to allow for 20 parallel compute processes::

  MAX_PARALLEL_ASYNC_WORKERS = 20

If this runs successfully, an output similar to the following will be shown::

  INFO 2022-03-30 06:34:57,724 Targeting a cable length of 40921530 nm per task to cover a total length of 40921529674.469574 nm of 24306 skeleton(s)
  INFO 2022-03-30 06:34:57,876 Computing NBLAST values for similarity 2301, bin 0 (1/998), containing 15 skeletons
  INFO 2022-03-30 06:34:57,941 Getting target object IDs
  INFO 2022-03-30 06:34:57,970 Fetched 24392 target object IDs of type skeleton with min length 0, min length if soma found 0, soma tags ('soma',), max length inf, and the bounding box None
  INFO 2022-03-30 06:35:01,410 Allowed number of separate processes: 20
  INFO 2022-03-30 06:35:01,478 Looking for object cache
  INFO 2022-03-30 06:35:01,478 Fetching 15 query skeletons (0 cache hits)
  INFO 2022-03-30 06:35:01,479 Example IDs to fetch: [21711389, 21711419, 21711446]
  INFO 2022-03-30 06:35:02,294 Creating combined neuronlist
  INFO 2022-03-30 06:35:02,498 Freeing memory
  INFO 2022-03-30 06:35:02,697 Loaded 15/15 neurons
  INFO 2022-03-30 06:35:02,736 Simplifying fetched query neurons, removing parts below branch level 10
  INFO 2022-03-30 06:35:03,237 Computing fetched query skeleton stats, resampling and using 5 neighbors for tangents
  INFO 2022-03-30 06:35:04,094 Fetching 24392 target skeletons (0 cache hits)
  INFO 2022-03-30 06:35:04,096 Example IDs to fetch: [21714976, 21729677, 21743642]
  INFO 2022-03-30 06:43:47,229 Creating combined neuronlist
  INFO 2022-03-30 06:44:00,209 Freeing memory
  INFO 2022-03-30 06:44:07,626 Loaded 24392/24392 neurons
  INFO 2022-03-30 06:44:07,911 Simplifying fetched target neurons, removing parts below branch level 10
  INFO 2022-03-30 06:48:13,530 Computing fetched target skeleton stats
  INFO 2022-03-30 06:50:18,181 Computing score (alpha: No, noramlized: Yes (geometric-mean), reverse: No, top N: -)
  INFO 2022-03-30 06:59:10,188 NBLAST computation done
  INFO 2022-03-30 06:59:10,508 NBLAST computation completed, used 15 query objects and 24345 target objects
  INFO 2022-03-30 06:59:10,525 Preparing to store positive NBLAST scores in result relation
  INFO 2022-03-30 06:59:10,531 Storing 906 non-zero and non-self scores (out of 365175)
  INFO 2022-03-30 06:59:10,591 Stored non-zero results

We see that our randomly choosing number of 1000 jobs leads to 15 query
skeletons being computed in the first batch. The part that benefits from
parallelization across multiple cores is the NBLAST computation ("Computing
score…"). In the log above this takes 8m52s. Compared to the total runtime of
24m12s, this is only 36%. It would generally be nice to use the cores we
requested per job to at least 60% (because usually the number of nodes has to be
paid). We can do this by either shortening the non-parallelizable parts or by
doing more parallel processing.

Assuming a linear scale, a reasonable first guess would be that comparing all 24345
query skeletons to all 24345 target skeletons would take ~240 hours (8m52s *
24345/15) with a single compute node and 20 cores. This is the NBLAST computation
only, though.

In order to save cluster time, Parts of the initialization can be precomputed.
The most time consuming part of the non-NBLAST work is loading query and target
skeletons. This can be optimized by providing a cache file. On top of that, the
selection of query skeletons can also be computed in advance for each job. The
next chapters look into optimizations in more detail.

Optimization: constrain query and target skeletons
--------------------------------------------------

Less skeletons also mean less work. And often times it is useful to exclude
objects that are very small, simply to reduce noise. The
``catmaid_parallel_nblast`` management command offers the ``--min-length``
option to this. It expects a value in nanometers.

Optimization: precompute query skeleton set
-------------------------------------------

While it might not help a lot with the smaller example of 25,000 skeletons, it
helps with larger computations.

Optimization: create cache file with NBLAST-ready skeletons
-----------------------------------------------------------

This allows the NBLAST cluster job to load the prepared skeletons from the cache
file rather than getting them from the database and preparing them on the fly.
This can be done using the ``catmaid_update_nblast_dps_cache``. If the cache
file is not present, this management command will warn you and stop. Please
create the folder or correct the ``MEDIA_ROOT`` setting in the ``settings.py``
file and rerun the cache creation command. For the smaller example above this
looks like this::

  $ python manage.py catmaid_update_nblast_dps_cache --project-id <project-id>

  INFO 2022-03-30 09:46:28,475 Creating cache for project FAFBv14 import test
  INFO 2022-03-30 09:46:28,477 Cache file: /users/tkazimiers/catmaid/django/files/cache/r-dps-cache-project-52-skeleton-simple-10.rda
  INFO 2022-03-30 10:57:20,002 Finding matching skeletons
  INFO 2022-03-30 10:57:20,037 Fetching 24392 skeletons
  INFO 2022-03-30 11:05:50,667 Creating combined neuronlist
  INFO 2022-03-30 11:06:03,756 Freeing memory
  INFO 2022-03-30 11:06:11,167 Loaded 24392/24392 neurons
  INFO 2022-03-30 11:06:11,437 Simplifying 24392 skeletons
  INFO 2022-03-30 11:10:12,978 Computing stats for 24390 skeletons
  INFO 2022-03-30 11:12:20,652 Writing 24303 objects to cache file: /users/tkazimiers/catmaid/django/files/cache/r-dps-cache-project-52-skeleton-simple-10.rda
  INFO 2022-03-30 11:13:02,127 Done

This can be run on any machine and doesn't benefit from a cluster a lot. In case
there are much more or bigger neurons to create a cache for, it might makse
sense to parallelize this cache generation as well, again either on a cluster or
on a single machine. In order to do this, use the mamagement command
``catmaid_parallel_nblast_cache`` to first create a set of task Shell scripts::

  $ python manage.py catmaid_parallel_nblast_cache --project-id <project-id> --n-jobs 50 --prefix 'nblast-cache-job' --venv /path/to/pip/env --working-dir /path/to/catmaid/django/projects --cache-dir nblast-tmp --create-tasks --target-dir nblast-cache-jobs

If on a computer with many cores, these scripts could then be executed with e.g.
GNU ``parallel``::

  $ parallel -j50 --bar --eta 'sh nblast-cache-jobs/nblast-cache-job-{}.sh' ::: {0..99}

The ``catmaid_parallel_nblast_cache`` command also offers options to be run on a
cluster. The resulting ``<prefix>.rda.<index>`` then need to be combined into a
single file::

  $ python manage.py catmaid_parallel_nblast_cache --project-id <project-id> --n-jobs 50 --prefix 'nblast-cache-job' --venv /path/to/pip/env --working-dir /path/to/catmaid/django/projects --cache-dir nblast-tmp --target-dir nblast-cache-jobs --combine-cache-files --combined-cache-path /path/to/catmaid/media-dir/cache/r-dps-cache-project-<project-id>-skeleton-simple-10.rda

This will create the cache file
``r-dps-cache-project-<project-id>-skeleton-simple-10.rda`` at the respective
``MEDIA_DIR`` path for cache files. The ``10`` in the name reflects the level of
simplication and ``10`` is the default.

If computed on a separate machine, make sure to copy the resulting cache file to
the cluster CATMAID instance, so that it can be picked up there. The file has to
be put in the cache location CATMAID expects. Even for only 25,000 skeletons,
this can reduce the required loading and computation time significantly::

  INFO 2022-03-30 11:30:58,923 Targeting a cable length of 40921530 nm per task to cover a total length of 40921529674.469574 nm of 24306 skeleton(s)
  INFO 2022-03-30 11:30:59,071 Computing NBLAST values for similarity 2301, bin 0 (1/998), containing 15 skeletons
  INFO 2022-03-30 11:30:59,121 Getting target object IDs
  INFO 2022-03-30 11:30:59,148 Fetched 24392 target object IDs of type skeleton with min length 0, min length if soma found 0, soma tags ('soma',), max length inf, and the bounding box None
  INFO 2022-03-30 11:31:06,528 Allowed number of separate processes: 20
  INFO 2022-03-30 11:31:06,612 Looking for object cache
  INFO 2022-03-30 11:31:20,065 Using skeleton cache file: /users/tkazimiers/catmaid/django/files/cache/r-dps-cache-project-52-skeleton-simple-10.rda
  INFO 2022-03-30 11:31:20,073 Fetching 0 query skeletons (15 cache hits)
  INFO 2022-03-30 11:31:20,289 Fetching 89 target skeletons (24303 cache hits)
  INFO 2022-03-30 11:31:20,289 Example IDs to fetch: [22204418, 22201869, 22201359]
  INFO 2022-03-30 11:31:22,830 Creating combined neuronlist
  INFO 2022-03-30 11:31:23,594 Freeing memory
  INFO 2022-03-30 11:31:23,778 Loaded 89/89 neurons
  INFO 2022-03-30 11:31:23,845 Simplifying fetched target neurons, removing parts below branch level 10
  INFO 2022-03-30 11:31:24,491 Computing fetched target skeleton stats
  INFO 2022-03-30 11:31:26,150 Computing score (alpha: No, noramlized: Yes (geometric-mean), reverse: No, top N: -)
  INFO 2022-03-30 11:32:59,301 NBLAST computation done
  INFO 2022-03-30 11:32:59,515 NBLAST computation completed, used 15 query objects and 24345 target objects
  INFO 2022-03-30 11:32:59,515 Preparing to store positive NBLAST scores in result relation
  INFO 2022-03-30 11:32:59,517 Storing 912 non-zero and non-self scores (out of 365175)
  INFO 2022-03-30 11:32:59,566 Stored non-zero results

The whole computation takes now only two minutes now.

Optimization: precompute possible target options for each task
--------------------------------------------------------------

Larger sets of skeletons can take quite a while to compute. While this can be
mitigated with paralellization, this usually doesn't make a big difference
cost-wise if run on a compute cluster. A way to drastically lower the time
requirements is to reduce the number of comparisons. In a batch-wise setup it is
usually enough to compare all skeletons in a batch with all skeletons that have
their closest point no farther away than a certain distance.

The ``catmaid_parallel_nblast`` management command can limit the set of
potential partners with the help of the ``--ignore-impossible-targets``. It will --max-cluster-size 5000 --max-partner-distance 30000

In order to use this feature, the Postgres database needs to have Python
installed as a possible processing language. This can be done by logging in to
the database and installing the ``plpython3u`` extension::

  sudo -u postgres psql
  \c <catmaid-db>
  CREATE EXTENSION plpython3u;

Additionally, it requires unfortunately to mark this language as trusted to let
regular users use it (needs to be done as a Postgres superuser as well)::



that the CATMAID user (or optionally a dedicated
NBLAST user)

Optimization: store scoring results in file
-------------------------------------------

Generating all job scripts
--------------------------

Running cluster tasks
---------------------

Once running a single job finishes in an acceptable time frame, the complete set
of jobs can be queued. How this is done exactly, depends on the resource manager
in use. For Slurm, this could look like this for a 100-job task::

  sbatch --job-name=parallel_nblast --array=0-99%20 --mail-type=END,FAIL --mail-user=me@example.com --ntasks=1 --cpus-per-task=20 --mem-per-cpu=2G --time=03:00:00 --output=%x_%a_%j.log --partition=short nblast-jobs/array_nblast_job.sh

This will run
