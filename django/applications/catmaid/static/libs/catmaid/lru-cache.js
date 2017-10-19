/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function (CATMAID) {

  "use strict";

  /**
   * A least-recently used, limited lifetime cache of key-value pairs.
   *
   * This cache is designed to be simple and generic. Consequently it prefers
   * clarity over performance and is not suitable for use in tight loops or
   * with large capacities.
   *
   * @param {number}  capacity Size of the cache.
   * @param {number=} lifetime Lifetime for cache entries in ms (optional).
   */
  function LRUCache(capacity, lifetime) {
    this.capacity = capacity;
    this.lifetime = lifetime ? lifetime : Infinity;
    this.resetLifetimeOnHit = false;
    this._store = [];
  }

  /**
   * Get a cached value from the cache by its key.
   *
   * @param  {Object} key
   * @return {Object}     Value if a valid hit was in the cache, else undefined.
   */
  LRUCache.prototype.get = function (key) {
    var now = Date.now();
    for (var i = 0; i < this._store.length; ++i) {
      var entry = this._store[i];

      if (entry && entry.key === key) {
        this._store.splice(i, 1);

        if (now - entry.timestamp <= this.lifetime) {
          // Value is valid. Move it to top of the cache.
          if (this.resetLifetimeOnHit) entry.timestamp = now;
          this._store.unshift(entry);
          return entry.value;
        } else {
          // Value is expired. Leave it out of the cache and return undefined.
          return;
        }
      }
    }
  };

  /**
   * Check whether the cache contains a key without updating its usage.
   *
   * @param  {Object}  key
   * @return {boolean}     Whether the query key is a hit.
   */
  LRUCache.prototype.has = function (key) {
    var now = Date.now();
    for (var i = 0; i < this._store.length; ++i) {
      var entry = this._store[i];

      if (entry && entry.key === key) {
        return now - entry.timestamp <= this.lifetime;
      }
    }

    return false;
  };

  /**
   * Set a cached value in the cache by its key.
   *
   * @param {Object} key
   * @param {Object} value
   */
  LRUCache.prototype.set = function (key, value) {
    this.delete(key);
    var entry = {
      key: key,
      value: value,
      timestamp: Date.now()
    };
    this._store.unshift(entry);
    if (this._store.length > this.capacity) this._store.length = this.capacity;
  };

  /**
   * Delete a cache entry. If it does not exist, do nothing.
   *
   * @param  {Object} key
   */
  LRUCache.prototype.delete = function (key) {
   for (var i = 0; i < this._store.length; ++i) {
      var entry = this._store[i];

      if (entry && entry.key === key) {
        this._store.splice(i, 1);
        return;
      }
    }
  };

  /**
   * Clear all entries from the cache.
   */
  LRUCache.prototype.clear = function () {
    this._store.length = 0;
  };

  /**
   * Execue <fn> for each entry without marking it as accessed.
   */
  LRUCache.prototype.forEachEntry = function(fn) {
    var now = Date.now();
    for (var i = 0; i < this._store.length; ++i) {
      var entry = this._store[i];
      if (entry && (now - entry.timestamp <= this.lifetime)) {
        fn(entry);
      }
    }
  };

  CATMAID.LRUCache = LRUCache;

})(CATMAID);
