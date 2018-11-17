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

    CATMAID.asEventSource(this);
  }

  LRUCache.EVENT_EVICTED = 'lrucache_event_evicted';

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
          this.trigger(LRUCache.EVENT_EVICTED, key, entry.value);
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
    this.removeExcessItems();
  };

  /**
   * Remove all items that don't fit in anymore.
   */
  LRUCache.prototype.removeExcessItems = function() {
    if (this._store.length > this.capacity) {
      this._removeFrom(this.capacity);
    }
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
        // Note that eviction events *must not* be fired on explicit deletion.
        this._store.splice(i, 1);
        return;
      }
    }
  };

  /**
   * Evict all entries from the cache.
   */
  LRUCache.prototype.evictAll = function () {
    this._removeFrom(0);
  };

  LRUCache.prototype._removeFrom = function (index) {
    // If there are no eviction listeners, the removal can be done more quickly.
    if (this.hasListeners()) {
      let removed = this._store.splice(index);
      removed.forEach(({key, value}) => this.trigger(LRUCache.EVENT_EVICTED, key, value));
    } else {
      this._store.length = index;
    }
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

  /**
   * A memory aware variant of the LRU cache. It allows a maximum memory fill
   * rate to be set. If a new item is added to the cache it is checked if adding
   * this items would result in a higher memory fill rate than allowed. If this
   * is the case, older items are removed until there is enough memory.
   *
   * @param {number}  capacity           Size of the cache.
   * @param {number}  lifetime           Lifetime for cache entries in ms (optional).
   * @param {number}  maxMemoryFillRatee Maximum allowed ratio of used memory
   *                                     after a new items is added. If new
   *                                     value would supass this, old values are
   *                                     removed, even if the capacity setting
   *                                     would allow them.
   */
  function MemoryAwareLRUCache(capacity, lifetime, maxMemoryFillRate) {
    if (!window.performance.memory) {
      throw new CATMAID.PreConditionError("Need window.performance.memory " +
          "extension, available e.g. in Chrome/Chromium");
    }
    LRUCache.call(this, capacity, lifetime);
    this.maxMemoryFillRate = CATMAID.tools.getDefined(maxMemoryFillRate, 1.0);
  }

  MemoryAwareLRUCache.prototype = Object.create(LRUCache.prototype);
  MemoryAwareLRUCache.prototype.constructor = MemoryAwareLRUCache;

  /**
   * Override prototype implementation with a memory test, performed before the
   * orginal set() is called. If the test suggests nothing should be allocated
   * because of too little memory, skip adding this item. If <valueSize> is
   * provided, this value is taken into consideration whether or not to cache
   * this data.
   */
  MemoryAwareLRUCache.prototype.set = function(key, value, valueSize) {
    let memory = window.performance.memory;
    let heapFillRate = memory.usedJSHeapSize / memory.totalJSHeapSize;
    // If the free space in the heap is too small, adding a new item to the
    // cache is prevented to reduce the risk of running out of memory, which is
    // otherwise hard to catch in JavaScript.
    var dontCache = heapFillRate > this.maxMemoryFillRate;

    // And don't cache if a size estimate for the data is given that is larger
    // than 25% of the available heap memory. The passed in data is of course
    // alrady available in memory, but we check the effects of an additional
    // object of that kind.
    if (valueSize) {
      var availableSpaceInHeap = memory.totalJSHeapSize - memory.usedJSHeapSize;
      dontCache = dontCache || (valueSize / availableSpaceInHeap > 0.25);
    }

    if (!dontCache) {
      LRUCache.prototype.set.call(this, key, value);
    }
  };

  /**
   * Create cache instances with fallback options.
   */
  CATMAID.CacheBuilder = {
    makeMemoryAwareLRUCache: function(capacity, lifetime, maxMemoryFillRate, fallback) {
      let cache;
      try {
        return new MemoryAwareLRUCache(capacity, lifetime, maxMemoryFillRate);
      } catch(error) {
        if (fallback && error instanceof CATMAID.PreConditionError) {
          return new LRUCache(capacity, lifetime);
        }
        throw error;
      }
    }
  };


  CATMAID.LRUCache = LRUCache;
  CATMAID.MemoryAwareLRUCache = MemoryAwareLRUCache;

})(CATMAID);
