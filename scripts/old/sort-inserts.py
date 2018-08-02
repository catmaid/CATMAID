#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import re

if len(sys.argv) != 1:
    print >> sys.stderr, "Usage: %s" % (sys.argv[0],)

class TableName:
    def __init__(self, table_name):
        self.table_name = table_name
    TABLE_ORDER = [
        'settings',
        '"user"',
        'class',
        'project',
        'stack',
        'project_stack',
        'project_user',
        'relation',
        'class_instance',
        'class_instance_class_instance',
        'connector',
        'connector_class_instance',
        'treenode',
        'treenode_class_instance',
        'treenode_connector' ]
    def sort_key(self):
        try:
            n = 1 + TableName.TABLE_ORDER.index(self.table_name)
        except ValueError:
            n = 0
        return '%03d %s' % (n, self.table_name)
    def __cmp__(self, other):
        return cmp(self.sort_key(), other.sort_key())

def line_to_tuple(s):
    m = re.search('INSERT INTO ([\w"]+) VALUES \((\d+)', s)
    if m:
        return (TableName(m.group(1)), int(m.group(2), 10))
    else:
        return ""

for line in sorted(sys.stdin.readlines(), key=line_to_tuple):
    sys.stdout.write(line)
