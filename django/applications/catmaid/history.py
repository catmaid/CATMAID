
import functools
import re
import dateutil.parser
import logging

from django.db import connection
from django.db.transaction import TransactionManagementError

from catmaid import locks
from catmaid.util import ask_to_continue

transaction_label_pattern = re.compile(r'^\w+\.\w+$')

logger = logging.getLogger(__name__)


def fail_on_wrong_format_label(label) -> None:
    """Check the passed in label if it matches the expected format and raise an
    error if not."""
    if not transaction_label_pattern.match(label):
        raise ValueError(f'Label "{label}" does not follow convention "<resources>.<action>"')

def add_log_entry(user_id, label, project_id=None) -> None:
    """Give a label to the current transaction and time, executed by a
    particular user. This information is recorded only once per transaction,
    and subsequent calls will be ignored silently. Labels are expected to
    follow the pattern <resource>.<action> with <resource> being a plural
    identifier (e.g. treenodes), just like URI endpoints.
    """
    fail_on_wrong_format_label(label)

    cursor = connection.cursor()
    # Only try to insert log record if current transaction is still valid
    if not cursor.db.needs_rollback:
        cursor.execute("""
            INSERT INTO catmaid_transaction_info (user_id, change_type, label,
                project_id)
            VALUES (%s, 'Backend', %s, %s)
            ON CONFLICT DO NOTHING
        """, (user_id, label, project_id))


def record_request_action(label, method=None):
    """Give a label to the current transaction and time, executed by a Django
    user as provided by the wrapped function's request parameter. This
    parameter is first looked up in the function's keyword arguments and if not
    found, the request is expected to be provided as the first argument. If
    <method> is set to a particular HTTP method (i.e. GET or POST), only these
    requests are recorded.
    """
    fail_on_wrong_format_label(label)
    if method and not method.isupper():
        raise ValueError("Method name must be upper case")

    def decorator(f):
        @functools.wraps(f)
        def wrapped_f(*args, **kwargs):
            if 'request' in kwargs:
                request = kwargs['request']
            elif len(args) > 0:
                request = args[0]
            else:
                raise ValueError("Couldn't find request to record action for")

            project_id = kwargs.get('project_id', None)

            # Add transaction information first, so that trigger functions in
            # the database can use this information.
            user_id = request.user.id
            if not method or request.method == method:
                add_log_entry(user_id, label, project_id)

            result = f(*args, **kwargs)

            return result
        return wrapped_f
    return decorator


def record_action(user_id, label, project_id=None):
    """Give a label to the current transaction and time, executed by a
    particular user.
    """
    fail_on_wrong_format_label(label)

    def decorator(f):
        @functools.wraps(f)
        def wrapped_f(*args, **kwargs):
            result = f(*args, **kwargs)
            add_log_entry(user_id, label, project_id)
            return result
        return wrapped_f

    return decorator


def enable_history_tracking(ignore_missing_fn=False) -> bool:
    """Enable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT 1 FROM pg_class
            WHERE relname='catmaid_history_table');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("""
        -- Obtain an advisory lock so that this function works also in a parallel
        -- context.
        SELECT pg_advisory_xact_lock(%(lock_id)s::bigint);
        SELECT enable_history_tracking();
    """, {
        'lock_id':  locks.history_update_event_lock
    })
    return True


def disable_history_tracking(ignore_missing_fn=False) -> bool:
    """Disable history tracking globally.
    """
    cursor = connection.cursor()
    if ignore_missing_fn:
        cursor.execute("""
            SELECT EXISTS(SELECT * FROM pg_proc
            WHERE proname = 'disable_history_tracking');""")
        result = cursor.fetchone()
        if not result[0]:
            # If the function does not exist, return silently if the missing
            # function shouldn't be reported
            return False
    cursor.execute("""
        -- Obtain an advisory lock so that this function works also in a parallel
        -- context.
        SELECT pg_advisory_xact_lock(%(lock_id)s::bigint);
        SELECT disable_history_tracking();
    """, {
        'lock_id':  locks.history_update_event_lock
    })
    return True


class Transaction:

    def __init__(self, transaction_id, transaction_time):
        self.id = transaction_id
        self.time = transaction_time
        self.date = dateutil.parser.parse(self.time)

    def __str__(self):
        return "TX {} @ {}".format(self.id, self.time)


def get_historic_row_count_affected_by_tx(tx):
    """Counts how many historic rows reference the passed in transaction.
    Returned is a list of tuples (table_name, count).
    """
    cursor = connection.cursor()
    cursor.execute("""
        DO $$
        DECLARE

            row record;

        BEGIN

            CREATE TEMPORARY TABLE tx_history_matches (
              history_table text,
              n_matches int
            );

            FOR row in SELECT format(
                    'INSERT INTO tx_history_matches '
                    'SELECT ''%%2$s'', COUNT(*) FROM ONLY %%1$s ht '
                    'WHERE exec_transaction_id = %(tx_id)s '
                    'AND upper(sys_period) = '%(tx_time)s'',
                    cht.history_table, cht.history_table::text) as query
                FROM catmaid_history_table cht
            LOOP
              EXECUTE row.query;
            END LOOP;

        END
        $$;

        SELECT * FROM tx_history_matches
        WHERE n_matches > 0;
    """, {
        'tx_id': tx.id,
        'tx_time': tx.time,
    })

    tx_matches = cursor.fetchall()

    cursor.execute('DROP TABLE tx_history_matches')

    return tx_matches


def get_dependent_historic_tx(tx, target_list=None):
    """Find all historic transactions that happened after all passed in
    transactions that affected rows touched by the passed in transaction. These
    transactions can't be guaranteed to be valid after the passed in
    transactions have been undone. Therefore, they need to be rolled back as
    well, including their dependen transactions.
    """
    if target_list is None:
        target_list = []

    cursor = connection.cursor()
    cursor.execute("""
        DO $$
        DECLARE

            row record;

        BEGIN

            CREATE TEMPORARY TABLE dependent_tx (
                tx_id bigint,
                execution_time text,
                user_id int,
                label text
            );

            FOR row in SELECT format(
                    'INSERT INTO dependent_tx '
                    'SELECT DISTINCT ht2.exec_transaction_id, upper(ht2.sys_period), '
                    '    cti.user_id, cti.label '
                    'FROM ( '
                    '    SELECT DISTINCT %%3$s as id'
                    '    FROM ONLY %%1$s ht '
                    '    WHERE ht.exec_transaction_id = %(tx_id)s '
                    '    AND upper(ht.sys_period) = '%(tx_time)s''
                    ') touched_data(id) '
                    'JOIN %%1$s ht2 ON ht2.%%3$s = touched_data.id '
                    'LEFT JOIN catmaid_transaction_info cti '
                    'ON cti.transaction_id = ht2.exec_transaction_id '
                    'AND cti.execution_time = upper(ht2.sys_period) '
                    'WHERE ht2.exec_transaction_id <> %(tx_id)s '
                    'AND ht2.sys_period IS NOT NULL '
                    'AND upper(ht2.sys_period) >= '%(tx_time)s'',
                    cht.history_table, cht.history_table::text, cht.live_table_pkey_column) as query
                FROM catmaid_history_table cht
            LOOP
                EXECUTE row.query;
            END LOOP;

        END
        $$;

        SELECT * FROM dependent_tx;
    """, {
        'tx_id': tx.id,
        'tx_time': tx.time,
    })

    tx_dependent_tx = list(cursor.fetchall())
    target_list.extend(tx_dependent_tx)

    cursor.execute('DROP TABLE dependent_tx')

    # Add dependent historic transactions of the transactions we just found
    for (id, exec_time, _, _) in tx_dependent_tx:
        get_dependent_historic_tx(Transaction(id, exec_time), target_list)

    return target_list


def undelete_neuron(tx, interactive=False):
    """Recreates a neuron and its connections. This simply restores everything
    from a delete.neuron transaction. Some materialized views as
    treenode_connector_edge or treenode_edge need to be recreated selectively
    for the resurrected neuron. Therefore, an update of these views is done for
    all skeleton IDs encountered.
    """
    tx_matches = get_historic_row_count_affected_by_tx(tx)

    if interactive:
        if tx_matches:
            logger.info('The following historic entries have been found for transaction {}'.format(tx))
            for row in tx_matches:
                logger.info('  table {}: {} rows'.format(row[0], row[1]))
        else:
            logger.info('No historic entries found for transaction: {}'.format(tx))

    cursor = connection.cursor()
    nr_notices = len(cursor.connection.notices)
    cursor.execute("""
        DO $$
        DECLARE

            row record;

        BEGIN

            CREATE TEMPORARY TABLE seen_skeleton (
                id bigint
            );

            INSERT INTO seen_skeleton
            SELECT DISTINCT skeleton_id
            FROM treenode__history th
            WHERE th.exec_transaction_id = %(tx_id)s
            AND upper(th.sys_period) >= %(tx_time)s;

            FOR row IN SELECT format('INSERT INTO %%1$s (', cht.live_table) ||
                    array_to_string(array_agg(column_name::text order by pos), ',') ||
                    ') SELECT ' ||
                    array_to_string(array_agg(column_name::text order by pos), ',') ||
                    format(
                    ' FROM ONLY %%1$s ht '
                    ' WHERE ht.exec_transaction_id = %(tx_id)s '
                    ' AND upper(ht.sys_period) >= '%(tx_time)s''
                    ' ON CONFLICT DO NOTHING',
                    cht.history_table, cht.history_table::text,
                    cht.live_table_pkey_column, cht.live_table,
                    cht.live_table::text) as query
                FROM catmaid_history_table cht
                JOIN catmaid_table_info cti
                    ON cti.rel_oid = cht.live_table
                WHERE column_name::text NOT IN ('txid', 'edition_time')
                GROUP BY cht.history_table, cht.live_table
            LOOP
                RAISE NOTICE '%%', row.query;
                EXECUTE row.query;
            END LOOP;

        END
        $$;

        SELECT id FROM seen_skeleton;
    """, {
        'tx_id': tx.id,
        'tx_time': tx.time,
    })

    skeleton_ids = [r[0] for r in cursor.fetchall()]

    cursor.execute('DROP TABLE seen_skeleton')

    for notice in cursor.connection.notices:
        logger.debug(f'NOTICE: {notice}')

    from catmaid.control.edge import rebuild_edges_selectively
    logger.info(f'Rebuilding edges for skeletons {skeleton_ids}')
    rebuild_edges_selectively(skeleton_ids, log=lambda msg: logger.info(msg))

    return skeleton_ids
