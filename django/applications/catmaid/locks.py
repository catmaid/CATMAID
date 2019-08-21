# The base lock is formed from the multiplication of all characters of "catmaid"
# as ASCII: 99 * 97 * 116 * 109 * 97 * 105 * 100.
base_lock_id = 123666608142000

# Postgres advisory lock ID to update spatial update even handling
spatial_update_event_lock = base_lock_id + 1
# Postgres advisory lock ID to update history update even handling
history_update_event_lock = base_lock_id + 2
