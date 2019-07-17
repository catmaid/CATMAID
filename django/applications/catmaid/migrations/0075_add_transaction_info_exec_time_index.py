from django.db import migrations


class Migration(migrations.Migration):
    """Add a BRIN index on the execution_time column of the
    catmaid_transaction_info table. Since this table keeps track of all
    transactions to provide additional semantics, it is rather large on big
    instances. The execution time column is constantly increasing and typically
    part of queries. A BRIN index is therefore a good choice: it is very small
    and fast to update, if the data it works on is sequential.
    """

    dependencies = [
        ('catmaid', '0074_update_nblast_fields'),
    ]

    operations = [
            migrations.RunSQL("""
                CREATE INDEX catmaid_transaction_info_execution_time_idx
                ON catmaid_transaction_info USING brin (execution_time);
            """, """
                DROP INDEX catmaid_transaction_info_execution_time_idx;
            """)
    ]
