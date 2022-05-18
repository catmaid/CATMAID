import logging
import math
import ujson
import msgpack
import psycopg2
import numpy as np
import os

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.nat.r import create_dps_data_cache, get_cache_file_name, combine_cache_files
from catmaid.models import Project
from catmaid.util import str2bool


logger = logging.getLogger(__name__)


snippets = {
    'ssh': {
        'pre': """
# Create a local SSH tunnel using key based authentication
LOCAL_PORT={ssh_local_port}
REMOTE_PORT={ssh_remote_port}
HOST={ssh_host}
SSH_IDENTITY={ssh_identity}

# Go into temp dir to not have nodes overwrite each other
WORKING_DIR=$(mktemp -d)
cd $WORKING_DIR

echo "Waiting a few seconds to establish tunnel..."
ssh -M -S catmaid-ctrl-socket -fnNT -L $LOCAL_PORT:localhost:$REMOTE_PORT -i $SSH_IDENTITY $HOST
ssh -S catmaid-ctrl-socket -O check $HOST
while [ ! -e catmaid-ctrl-socket ]; do sleep 0.1; done
        """,
        'post': """
echo "Closing SSH tunnel"
cd $WORKING_DIR
ssh -S catmaid-ctrl-socket -O exit $HOST
rm -r $WORKING_DIR
        """,
    },
    'conda': {
        'pre': """
conda activate {conda_env}
        """,
        'post': '',
    },
    'venv': {

        'pre': """
source {venv_path}/bin/activate
        """,
        'post': '',
    },
}


job_template = """
#!/usr/bin/env sh
#
# This script was generaetd by CATMAID in order to compute NBLAST scores for a
# particular set of query and target skeletons. If either set is empty, it is
# assumed that ALL skeletons should be compared against.

PROJECT_ID={project_id}
BIN_IDX={bin}
MIN_LENGTH={min_length}
MIN_SOMA_LENGTH={min_soma_length}
INITIAL_WORKING_DIR="{working_dir}"
N_JOBS={n_jobs}
SIMPLIFICATION={simplification}
TANGENT_NEIGHBORS={tangent_neighbors}
CACHE_DIR={cache_dir}

{pre_matter}

# Do work
cd "$INITIAL_WORKING_DIR"
python manage.py catmaid_parallel_nblast_cache --project-id $PROJECT_ID --n-jobs $N_JOBS --min-length $MIN_LENGTH --min-soma-length $MIN_SOMA_LENGTH --compute-bin $BIN_IDX --simplification $SIMPLIFICATION --tangent-neighbors $TANGENT_NEIGHBORS --cache-dir $CACHE_DIR

{post_matter}

cd "$INITIAL_WORKING_DIR"
"""


class Command(BaseCommand):
    help = "Create a set of separate shell scripts to run independently on a cluster"

    def add_arguments(self, parser):
        parser.add_argument('--project-id', dest='project_id', type=int, required=True,
                help='The project to generate a NBLAST cache for')
        parser.add_argument('--min-length', dest='min_length', type=float,
                default=None, help='An optional minimum length for skeletons looked at')
        parser.add_argument('--min-soma-length', dest='min_soma_length', type=float,
                default=None, help='Only include skeletons with a cable length of at least this, in case there is a soma node.'),
        parser.add_argument('--simplification', dest='simplification', type=int,
                default=10, help='The number of branching levels to keep'),
        parser.add_argument('--tangent-neighbors', dest='tangent_neighbors', type=int,
                default=5, help='The number of neighbors to consider for computing tangents'),
        parser.add_argument('--n-jobs', dest='n_jobs', type=int,
                default=50, help='How many jobs should be created.'),
        parser.add_argument("--create-tasks", dest='create_tasks', type=str2bool, nargs='?',
                const=True, default=False, help="Create task shell scripts")
        parser.add_argument("--combine-cache-files", dest='combine_cache_files', type=str2bool, nargs='?',
                const=True, default=False, help="Combine all cache files in the cache directory")
        parser.add_argument('--target-dir', dest='target_dir', type=str,
                default='nblast_cache_jobs', help='Where to create the NBLAST cache jobs'),
        parser.add_argument('--prefix', dest='prefix', type=str,
                default='nblast-cache-job', help='A filename prefix to use for generated tasks'),
        parser.add_argument("--ssh", dest='ssh', type=str2bool, nargs='?',
                const=True, default=False, help="Establish an SSH tunnel")
        parser.add_argument('--compute-bin', dest='bin', type=int, required=False, default=0,
                help='The bin to compute scores for'),
        parser.add_argument('--ssh-local-port', dest='ssh_local_port',
                default=7777, help='The local port for an optional SSH tunnel'),
        parser.add_argument('--ssh-remote-port', dest='ssh_remote_port',
                default=5432, help='The remote port for an optional SSH tunnel'),
        parser.add_argument('--ssh-host', dest='ssh_host',
                default='', help='The user@host string for an SSH tunnel'),
        parser.add_argument('--ssh-identity', dest='ssh_identity',
                default='', help='The path to the private SSH key for the tunnel (-I in ssh)'),
        parser.add_argument("--conda", dest='conda', default=None,
                help="A conda environment to load in tasks")
        parser.add_argument("--venv", dest='venv', default=None,
                help="A venv environment to load in tasks")
        parser.add_argument("--working-dir", dest='working_dir', default='$(pwd)',
                help="An optional working directory")
        parser.add_argument("--cache-dir", dest='cache_dir', required=True,
                help="The directory where each cache part should be stored")
        parser.add_argument("--combined-cache-path", dest='combined_cache_path', required=False,
                help="A file path to which multiple cache files should be combined to")

    def handle(self, *args, **options):
        project = Project.objects.get(pk=options['project_id'])
        n_jobs = options['n_jobs']
        target_dir = options['target_dir']
        job_prefix = options['prefix']
        ssh_tunnel = options['ssh']
        create_tasks = options['create_tasks']
        run_combine_cache_files = options['combine_cache_files']
        job_index = options['bin']
        min_length = options['min_length'] or 0
        min_soma_length = options['min_soma_length'] or 0
        simplification = options['simplification'] or 10
        tangent_neighbors = options['simplification']
        working_dir = options['working_dir']
        cache_dir = options['cache_dir']

        if run_combine_cache_files:
            logger.info(f'Combining cache files in folder: {cache_dir}')
            combine_cache_files(cache_dir, options['combined_cache_path'])
            return

        ssh_local_port = options['ssh_local_port']
        ssh_remote_port = options['ssh_remote_port']
        ssh_host = options['ssh_host']
        ssh_identity = options['ssh_identity']
        if ssh_tunnel:
            if not ssh_host:
                raise CommandError('Need --ssh-host if --ssh is used')
            if not ssh_identity:
                raise CommandError('Need --ssh-dentity if --ssh is used')

        venv_path = options['venv']
        conda_env = options['conda']

        extra_where = []
        if min_length:
            extra_where.append(f'AND cable_length > {min_length}')

        # Get a histogram of all skeletons in this project and collect <n_jobs>
        # buckets of similar length. In order to do this, we first find the total
        # length, divide it by <n_jobs> and form groups of skeletons so that the
        # cumulative length matches the desired length per job.
        cursor = connection.cursor()
        cursor.execute("""
            SELECT sum(cable_length), count(*)
            FROM catmaid_skeleton_summary css
            WHERE css.project_id = %(project_id)s
            {extra_where}
        """.format(extra_where='\n'.join(extra_where)), {
            'project_id': project.id,
        })
        total_length, n_skeletons = cursor.fetchone()
        if not total_length or n_skeletons == 0:
            raise CommandError('No skeletons found for query')

        length_per_task = math.ceil(total_length / n_jobs)

        logger.info(f'Targeting a cable length of {length_per_task} nm per '
                f'task to cover a total length of {total_length} nm of {n_skeletons} skeleton(s)')

        cursor.execute("""
            SELECT array_agg(skeleton_id) FROM (
                SELECT *, floor(lag(cumsum, 1, 0::double precision) OVER (ORDER BY skeleton_id)/%(group_length)s) AS grp
                FROM (
                    SELECT skeleton_id, sum(cable_length) OVER (ORDER BY skeleton_id) as cumsum
                    FROM catmaid_skeleton_summary css
                    WHERE project_id = %(project_id)s
                    {extra_where}
                ) sub
            ) sub2
            GROUP BY grp;
        """.format(extra_where='\n'.join(extra_where)), {
            'project_id': project.id,
            'group_length': length_per_task,
        })
        skeleton_groups = list([r[0] for r in cursor.fetchall()])
        avg_skeleton_count = np.mean([len(l) for l in skeleton_groups])

        logger.info(f'Minimum skeleton length: {min_length} (with soma tag: {min_soma_length}')

        if create_tasks:
            logger.info(f'Generating {len(skeleton_groups)} jobs with a cumulative '
                    f'cable length with an average of {int(avg_skeleton_count)} skeletons per group')

            pre, post = [], []
            if conda_env:
                pre.append(snippets['conda']['pre'].format(conda_env=conda_env))
            if venv_path:
                pre.append(snippets['venv']['pre'].format(venv_path=venv_path))
            if ssh_tunnel:
                pre.append(snippets['ssh']['pre'].format(**{
                    'ssh_local_port': ssh_local_port,
                    'ssh_remote_port': ssh_remote_port,
                    'ssh_host': ssh_host,
                    'ssh_identity': ssh_identity,
                }))
                post.append(snippets['ssh']['post'].format(**{
                    'ssh_local_port': ssh_local_port,
                    'ssh_remote_port': ssh_remote_port,
                    'ssh_host': ssh_host,
                    'ssh_identity': ssh_identity,
                }))

            for n, sg in enumerate(skeleton_groups):
                job_sh = job_template.format(**{
                    'working_dir': working_dir,
                    'cache_dir': cache_dir,
                    'project_id': project.id,
                    'bin': n,
                    'n_jobs': n_jobs,
                    'min_length': min_length,
                    'min_soma_length': min_soma_length,
                    'pre_matter': '\n'.join(pre),
                    'post_matter': '\n'.join(post),
                    'simplification': simplification,
                    'tangent_neighbors': tangent_neighbors,
                })
                with open(os.path.join(target_dir, f'{job_prefix}-{n}.sh'), 'w') as f:
                    f.write(job_sh)

            logger.info(f'Done. Saved all jobs in folder {target_dir}')
        else:
            if job_index < 0 or job_index >= len(skeleton_groups):
                raise ValueError('Invalid job index: {job_index}')
            query_skeletons = skeleton_groups[job_index]

            if query_skeletons:
                target_skeletons = None

                logger.info(f'Computing NBLAST cache for project {project.id}, '
                        f'bin {job_index} ({job_index+1}/{len(skeleton_groups)}), '
                        f'containing {len(query_skeletons)} skeletons')

                cache_name = get_cache_file_name(project.id, 'skeleton', simplification)
                cache_path = os.path.join(cache_dir, f'{cache_name}.{job_index}')

                cache_params = {
                    'update_cache': True,
                    'progress': False,
                    'parallel': True,
                    'cache_path': cache_path,
                    'min_length': min_length,
                    'min_soma_length': min_soma_length,
                    'detail': simplification,
                    'tangent_neighbors': tangent_neighbors,
                    'object_ids': query_skeletons,
                }
                create_dps_data_cache(project.id, 'skeleton', **cache_params)
            else:
                logger.info(f'Nothing to compute for project {project.id}, '
                        f'bin {job_index} ({job_index+1}/{len(skeleton_groups)}), '
                        f'containing no skeletons')

