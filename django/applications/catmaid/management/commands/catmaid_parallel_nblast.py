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

from catmaid.control.similarity import compute_nblast
from catmaid.models import NblastSimilarity
from catmaid.util import str2bool


logger = logging.getLogger(__name__)


snippets = {
    'ssh': {
        'pre': """
# Create a local SSH tunnel using key based authentication
LOCAL_PORT={ssh_local_port}
REMOTE_PORT={ssh_remote_port}
HOST={ssh_host}
SSH_PORT={ssh_port}
SSH_IDENTITY={ssh_identity}

# Go into temp dir to not have nodes overwrite each other
WORKING_DIR=$(mktemp -d)
cd $WORKING_DIR

echo "Waiting a few seconds to establish tunnel..."
ssh -M -S catmaid-ctrl-socket -fnNT -L $LOCAL_PORT:localhost:$REMOTE_PORT -i $SSH_IDENTITY -p $SSH_PORT $HOST
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

SIMILARITY_ID={similarity_id}
BIN_IDX={bin}
MIN_LENGTH={min_length}
INITIAL_WORKING_DIR="{working_dir}"
N_JOBS={n_jobs}
MAX_CLUSTER_SIZE={max_cluster_size}
MAX_PARTNER_DISTANCE={max_partner_distance}
IGNORE_IMPOSSIBLE_TARGETS={ignore_impossible_targets}

{pre_matter}

# Do work
cd "$INITIAL_WORKING_DIR"
python manage.py catmaid_parallel_nblast --similarity-id $SIMILARITY_ID --n-jobs $N_JOBS --min-length $MIN_LENGTH --compute-bin $BIN_IDX  --max-cluster-size $MAX_CLUSTER_SIZE --max-partner-distance $MAX_PARTNER_DISTANCE $IGNORE_IMPOSSIBLE_TARGETS

{post_matter}

cd "$INITIAL_WORKING_DIR"
"""


class Command(BaseCommand):
    help = "Create a set of separate shell scripts to run independently on a cluster"

    def add_arguments(self, parser):
        parser.add_argument('--similarity-id', dest='similarity_id', type=int, required=True,
                help='The NBLAST similarity configuration to use, which also includes all NBLAST parameters'),
        parser.add_argument('--min-length', dest='min_length', type=float,
                default=None, help='An optional minimum length for skeletons looked at')
        parser.add_argument("--ignore-impossible-targets", dest='ignore_impossible_targets', type=str2bool, nargs='?',
                const=True, default=False, help="Only consider target objects that have a closest point to the query point set that can lead to a NBLAST score")
        parser.add_argument('--max-partner-distance', dest='max_partner_distance', type=float,
                default=None, help='Can be used to override the default max distance (largest dist break in the NBLAST config).'),
        parser.add_argument('--max-cluster-size', dest='max_cluster_size', type=float,
                default=10000.0, help='Set a maximum cluster radius for clustering target candidates.'),
        parser.add_argument('--n-jobs', dest='n_jobs', type=int,
                default=50, help='How many jobs should be created.'),
        parser.add_argument("--create-tasks", dest='create_tasks', type=str2bool, nargs='?',
                const=True, default=False, help="Create task shell scripts")
        parser.add_argument('--target-dir', dest='target_dir', type=str,
                default='nblast_jobs', help='Where to create the NBLAST jobss'),
        parser.add_argument('--prefix', dest='prefix', type=str,
                default='nblast-job', help='A filename prefix to use for generated tasks'),
        parser.add_argument("--ssh", dest='ssh', type=str2bool, nargs='?',
                const=True, default=False, help="Establish an SSH tunnel")
        parser.add_argument('--compute-bin', dest='bin', type=int, required=False, default=0,
                help='The bin to compute scores for'),
        parser.add_argument("--remove-target_duplicates", dest='remove_target_duplicates', type=str2bool, nargs='?',
                const=True, default=False, help="Whether to remove duplicates in the target set")
        parser.add_argument('--ssh-local-port', dest='ssh_local_port',
                default=7777, help='The local port for an optional SSH tunnel'),
        parser.add_argument('--ssh-remote-port', dest='ssh_remote_port',
                default=5432, help='The remote port for an optional SSH tunnel'),
        parser.add_argument('--ssh-host', dest='ssh_host',
                default='', help='The user@host string for an SSH tunnel'),
        parser.add_argument('--ssh-port', dest='ssh_port', type=int,
                default=22, help='The SSH port for an SSH tunnel'),
        parser.add_argument('--ssh-identity', dest='ssh_identity',
                default='', help='The path to the private SSH key for the tunnel (-I in ssh)'),
        parser.add_argument("--conda", dest='conda', default=None,
                help="A conda environment to load in tasks")
        parser.add_argument("--venv", dest='venv', default=None,
                help="A venv environment to load in tasks")
        parser.add_argument("--working-dir", dest='working_dir', default='$(pwd)',
                help="An optional working directory")
        parser.add_argument('--remote-dps-host', dest='remote_dps_host', required=False,
                default=None, help='A host to use to load DPS objects'),
        parser.add_argument('--remote-dps-port', dest='remote_dps_port', required=False,
                default=None, type=int, help='A port to use to load DPS objects'),
        parser.add_argument("--target-cache", dest='target_cache', type=str2bool, nargs='?',
                const=True, default=False, help="Compute NBLAST scores for entire set of cached skeletons")

    def handle(self, *args, **options):
        similarity = NblastSimilarity.objects.get(pk=options['similarity_id'])
        n_jobs = options['n_jobs']
        target_dir = options['target_dir']
        job_prefix = options['prefix']
        ssh_tunnel = options['ssh']
        create_tasks = options['create_tasks']
        job_index = options['bin']
        remove_target_duplicates = options['remove_target_duplicates']
        ignore_impossible_targets = options['ignore_impossible_targets']
        max_partner_distance = options['max_partner_distance']
        min_length = options['min_length'] or 0
        working_dir = options['working_dir']
        max_cluster_size = options['max_cluster_size']
        target_cache = options['target_cache']

        ssh_local_port = options['ssh_local_port']
        ssh_remote_port = options['ssh_remote_port']
        ssh_host = options['ssh_host']
        ssh_port = options['ssh_port']
        ssh_identity = options['ssh_identity']
        if ssh_tunnel:
            if not ssh_host:
                raise CommandError('Need --ssh-host if --ssh is used')
            if not ssh_identity:
                raise CommandError('Need --ssh-dentity if --ssh is used')

        venv_path = options['venv']
        conda_env = options['conda']

        remote_dps_host = options['remote_dps_host']
        remote_dps_port = options['remote_dps_port']
        if remote_dps_host and remote_dps_port:
            remote_dps_source = (remote_dps_host, remote_dps_port)
        else:
            remote_dps_source = None

        skeleton_constraints = None
        if similarity.query_objects and len(similarity.query_objects):
            skeleton_constraints = set(similarity.query_objects)
        if similarity.target_objects and len(similarity.target_objects):
            if skeleton_constraints:
                skeleton_constraints = skeleton_constraints.union(set(similarity.query_objects))
            else:
                skeleton_constraints = set(similarity.target_objects)

        extra_join = ''
        if skeleton_constraints:
            extra_join = '''
                JOIN UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
                    ON skeleton.id = css.skeleton_id
            '''

        extra_where = []
        if min_length:
            extra_where.append(f'AND cable_length > {min_length}')

        # Get a histogram of all skeletons in this project and collect <n_jobs>
        # buckets of equal length. In order to do this, we first find the total
        # length, divide it by <n_jobs> and form groups of skeletons so that the
        # cumulative length matches the desired length per job.
        cursor = connection.cursor()
        cursor.execute("""
            SELECT sum(cable_length), count(*)
            FROM catmaid_skeleton_summary css
            {extra_join}
            WHERE css.project_id = %(project_id)s
            {extra_where}
        """.format(extra_join=extra_join, extra_where='\n'.join(extra_where)), {
            'project_id': similarity.project_id,
            'skeleton_ids': skeleton_constraints,
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
                    {extra_join}
                    WHERE project_id = %(project_id)s
                    {extra_where}
                ) sub
            ) sub2
            GROUP BY grp;
        """.format(extra_join=extra_join, extra_where='\n'.join(extra_where)), {
            'project_id': similarity.project_id,
            'group_length': length_per_task,
            'skeleton_ids': skeleton_constraints,
        })
        skeleton_groups = list([r[0] for r in cursor.fetchall()])
        avg_skeleton_count = np.mean([len(l) for l in skeleton_groups])

        if min_length:
            logger.info(f'Minimum skeleton length: {min_length}')

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
                    'ssh_port': ssh_port,
                    'ssh_identity': ssh_identity,
                }))
                post.append(snippets['ssh']['post'].format(**{
                    'ssh_local_port': ssh_local_port,
                    'ssh_remote_port': ssh_remote_port,
                    'ssh_host': ssh_host,
                    'ssh_port': ssh_port,
                    'ssh_identity': ssh_identity,
                }))

            for n, sg in enumerate(skeleton_groups):
                job_sh = job_template.format(**{
                    'working_dir': working_dir,
                    'similarity_id': similarity.id,
                    'bin': n,
                    'n_jobs': n_jobs,
                    'min_length': min_length,
                    'max_cluster_size': max_cluster_size,
                    'max_partner_distance': max_partner_distance,
                    'ignore_impossible_targets': '--ignore-impossible-targets' if ignore_impossible_targets else '',
                    'pre_matter': '\n'.join(pre),
                    'post_matter': '\n'.join(post),
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
                if ignore_impossible_targets:
                    # Find a set of potential target objects to avoid having to fetch
                    # all potential partners in each worker. This is done by only
                    # allowing skeletons with a maximum distance from the set of query
                    # skeletons. This distance is compued by looking at the
                    # similarity matrix to see at what distance the score is
                    # lowest.
                    max_distance = max_partner_distance
                    if not max_distance:
                        max_distance = similarity.config.distance_breaks[-1]

                    logger.info('Finding skeletons close by')
                    cursor.execute("""
                        WITH query_skeleton AS (
                            SELECT id FROM UNNEST(%(query_object_ids)s::bigint[]) query(id)
                        ), merged_edges AS (
                            SELECT ST_Collect(ST_Expand(box3d(edge), %(max_distance)s)) AS cluster
                            FROM (
                                SELECT ST_ClusterKMeans(edge, 1, %(max_cluster_size)s) over () AS cid, edge
                                FROM treenode t
                                JOIN query_skeleton query
                                    ON query.id = t.skeleton_id
                                JOIN LATERAL (
                                    SELECT edge
                                    FROM treenode_edge
                                    WHERE id = t.id
                                    LIMIT 1
                                ) AS e ON TRUE
                            ) sq
                            GROUP BY cid
                        ), clusterextent AS (
                            SELECT box3d(c.cluster) as bb
                            FROM merged_edges c
                        )
                        SELECT ST_XMin(bb), ST_YMin(bb), ST_ZMin(bb), ST_XMax(bb), ST_YMax(bb), ST_ZMax(bb)
                        FROM clusterextent
                    """, {
                        'query_object_ids': query_skeletons,
                        'max_cluster_size': max_cluster_size,
                        'max_distance': max_distance,
                    })

                    boundingboxes = cursor.fetchall()
                    logger.info(f'Split query skeleton edges into {len(boundingboxes)} clusters (max radius {max_cluster_size} nm)')

                    # Unfortunately, I found no good way to do this in single
                    # query
                    target_acc = set()
                    bb_filters = [f"""
                        SELECT id
                        FROM treenode_edge te
                        WHERE te.project_id = %(project_id)s
                        AND edge &&& Box3d(ST_MakeLine(ARRAY[
                            ST_MakePoint({bb[0]}, {bb[4]}, {bb[5]}),
                            ST_MakePoint({bb[3]}, {bb[1]}, {bb[2]})] ::geometry[]))
                        AND floatrange(ST_ZMin(edge), ST_ZMax(edge), '[]') &&
                        floatrange({bb[2]}, {bb[5]}, '[]')
                    """ for bb in boundingboxes]

                    collect_op = '\nUNION\n'
                    cursor.execute(f"""
                        WITH filtered_edges AS (
                            {collect_op.join(bb_filters)}
                        ), skeleton AS (
                            SELECT DISTINCT skeleton.id
                            FROM filtered_edges t
                            JOIN LATERAL (
                                SELECT skeleton_id
                                FROM treenode tt
                                WHERE tt.id = t.id
                                LIMIT 1) skeleton(id) ON TRUE
                            JOIN catmaid_skeleton_summary css
                                ON css.skeleton_id = skeleton.id
                            WHERE css.cable_length >= %(min_length)s
                        )
                        SELECT array_agg(id)
                        FROM skeleton
                    """, {
                        'project_id': similarity.project_id,
                        'min_length': min_length,
                    })
                    target_skeletons = cursor.fetchone()[0]

                    logger.info(f'Found {len(target_skeletons)} close skeletons as potential partners, max distance: {max_distance}')

                logger.info(f'Computing NBLAST values for similarity {similarity.id}, '
                        f'bin {job_index} ({job_index+1}/{len(skeleton_groups)}), '
                        f'containing {len(query_skeletons)} skeletons')
                if target_skeletons:
                    logger.info(f'Limiting target object set to {len(target_skeletons)} skeletons with a max distance of {max_distance} nm')

                compute_nblast(similarity.project_id, similarity.user_id,
                        similarity.id, remove_target_duplicates,
                        min_length=min_length, min_soma_length=min_length,
                        relational_results=True, query_object_ids=query_skeletons,
                        target_object_ids=target_skeletons, notify_user=False,
                        write_scores_only=True, clear_results=False,
                        parallel=True, remote_dps_source=remote_dps_source,
                        target_cache=target_cache)
            else:
                logger.info(f'Nothing to compute for similarity {similarity.id}, '
                        f'bin {job_index} ({job_index+1}/{len(skeleton_groups)}), '
                        f'containing no skeletons')
