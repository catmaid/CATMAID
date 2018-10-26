#!/usr/bin/env python

# Author: Jonathan Meyer
# Simplified from logic developed by Alexey Vasiliev
# https://github.com/le0pard/pgtune/blob/master/source/javascripts/pgtune.coffee

from collections import OrderedDict
from distutils.util import strtobool
from os import getenv

import math
import shutil

INSTANCE_MEMORY = int(float(getenv('INSTANCE_MEMORY', '512')))
CONNECTIONS = int(getenv('CONNECTIONS', '200'))
STATISTICS_TARGET = int(getenv('STATISTICS_TARGET', '1000'))
CONF_FILE = getenv('CONF_FILE', '%s/postgresql.conf' % getenv('PGDATA', '/var/lib/postgresql/data'))
OUTPUT_FILE = getenv('OUTPUT_FILE', CONF_FILE)
FORCE_PGTUNE = bool(strtobool(getenv('FORCE_PGTUNE', 'False')))
PGTUNED_STRING = '# pgtuned = \'true\''

# Constants for computation
KB = 1024
MB = 1048576
GB = 1073741824
TB = 1099511627776

KB_PER_GB = 1048576
KB_PER_MB = 1024


# Initial configuration.  Uses #pgtuned = True to check for previously tuned configuration
CONFIGS = OrderedDict()


def line_starts_with_config(configs, line):
    """Test whether any of the configuration keys begin on the given line

    :param configs: dictionary of configuration key, value pairs
    :param line: string to compare against the configuration dictionary
    :return: True if line starts with any dictionary key, False otherwise
    """
    for conf in configs:
        if str(line).startswith(conf):
            return True

    return False


def set_config(input_file, output_file_name, configs):
    """Takes an input file and replaces configuration values

    :param input_file: input stream containing configuration input
    :param output_file_name: file name to place updating configuration
    :param configs: dictionary of configuration values
    :return:
    """
    with open('%s_tmp' % output_file_name, 'w') as output_file:
        configuration_values = ['%s = %s\n' % (x, configs[x]) for x in configs]
        configuration_values.append('%s\n' % PGTUNED_STRING)
        line_value = input_file.readline()
        while len(line_value):
            if line_starts_with_config(configs, line_value):
                output_file.write('#%s' % line_value)
            else:
                output_file.write(line_value)
            line_value = input_file.readline()

        output_file.writelines(configuration_values)

    # Replace temp file with original name
    shutil.move('%s_tmp' % output_file_name, output_file_name)

memory_in_kb = INSTANCE_MEMORY * KB_PER_MB

# Keys that must be updated with units
NEED_UNITS = ['shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem',
              'min_wal_size', 'max_wal_size', 'wal_buffers']

CONFIGS['max_connections'] = CONNECTIONS

# shared_buffers
CONFIGS['shared_buffers'] = math.floor(memory_in_kb / 4)

# effective_cache_size
CONFIGS['effective_cache_size'] = math.floor(memory_in_kb * 3 / 4)

# work_mem is assigned any time a query calls for a sort, or a hash, or any other structure that needs a space
# allocation, which can happen multiple times per query. So you're better off assuming max_connections * 2 or
# max_connections * 3 is the amount of RAM that will actually use in reality. At the very least, you need to subtract
# shared_buffers from the amount you're distributing to connections in work_mem.
# The other thing to consider is that there's no reason to run on the edge of available memory. If you do that, there's
# a very high risk the out-of-memory killer will come along and start killing PostgreSQL backends. Always leave a buffer
# of some kind in case of spikes in memory usage. So your maximum amount of memory available in work_mem should be
# ((RAM - shared_buffers) / 2 / (max_connections * 3)).
work_mem = (memory_in_kb - CONFIGS['shared_buffers']) / (CONFIGS['max_connections'] * 3)
CONFIGS['work_mem'] = math.floor(work_mem)

# maintenance_work_mem
CONFIGS['maintenance_work_mem'] = math.floor(memory_in_kb / 16)

# Cap maintenance RAM at 2GB on servers with lots of memory
if CONFIGS['maintenance_work_mem'] > (2 * GB / KB):
    CONFIGS['maintenance_work_mem'] = math.floor(2 * GB / KB)

CONFIGS['min_wal_size'] = 1024 * MB / KB
CONFIGS['max_wal_size'] = 2048 * MB / KB
# checkpoint_completion_target
CONFIGS['checkpoint_completion_target'] = 0.7

# wal_buffers
# Follow auto-tuning guideline for wal_buffers added in 9.1, where it's
# set to 3% of shared_buffers up to a maximum of 16MB.
CONFIGS['wal_buffers'] = math.floor(3 * CONFIGS['shared_buffers'] / 100)
if CONFIGS['wal_buffers'] > (16 * MB / KB):
    CONFIGS['wal_buffers'] = math.floor(16 * MB / KB)

# default_statistics_target
CONFIGS['default_statistics_target'] = STATISTICS_TARGET

# Add in needed units to config values
for conf_needing_units in NEED_UNITS:
    if CONFIGS[conf_needing_units] % MB == 0:
        CONFIGS[conf_needing_units] = '%sGB' % int(round(CONFIGS[conf_needing_units] / MB))
    elif CONFIGS[conf_needing_units] % KB == 0:
        CONFIGS[conf_needing_units] = '%sMB' % int(round(CONFIGS[conf_needing_units] / KB))
    else:
        CONFIGS[conf_needing_units] = '%skB' % int(round(CONFIGS[conf_needing_units]))

# Update config file
with open(CONF_FILE) as conf_file:
    if FORCE_PGTUNE:
        set_config(conf_file, OUTPUT_FILE, CONFIGS)
    else:
        full_config = conf_file.read()
        if PGTUNED_STRING in full_config:
            print('Configuration has already been tuned.')
        else:
            conf_file.seek(0)
            set_config(conf_file, OUTPUT_FILE, CONFIGS)
