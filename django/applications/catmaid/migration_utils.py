# -*- coding: utf-8 -*-

def get_public_indexes(db):
    """
    Return a list of (index_name, table_name) tuples for indices in the public schema
    """

    return db.execute("""SELECT c.relname, c2.relname
                             FROM pg_class c
                             JOIN pg_namespace n on n.oid = c.relnamespace
                             JOIN pg_index i ON c.oid = i.indexrelid
                             JOIN pg_class c2 ON i.indrelid = c2.oid
                                 WHERE n.nspname = 'public' AND c.relkind = 'i'""")
