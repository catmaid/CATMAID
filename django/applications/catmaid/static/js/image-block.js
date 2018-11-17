(function (CATMAID) {

  "use strict";

  var ImageBlock = {};

  ImageBlock.CacheManager = class CacheManager {
    constructor() {
      this.caches = new Map();
    }

    get(source, capacity) {
      let cache = this.caches.get(source.id);

      if (!cache) {
        cache = new ImageBlock.Cache(source, capacity);
        this.caches.set(source.id, cache);
      }

      return cache;
    }
  };

  ImageBlock.GlobalCacheManager = new ImageBlock.CacheManager();

  ImageBlock.Cache = class Cache {
    constructor(source, capacity = 256) {
      this.source = source;
      this._cache = new CATMAID.LRUCache(capacity);
      this._deduper = new CATMAID.CoalescingPromiseDeduplicator();
      this._stateIDs = new Map();
      this._dirty = new Set();

      this._cache.on(CATMAID.LRUCache.EVENT_EVICTED, this._onBlockEviction, this);
      CATMAID.asEventSource(this);
    }

    readBlock(...zoomBlockCoord) {
      let blockKey = zoomBlockCoord.join('/');
      let block = this._cache.get(blockKey);

      if (block) {
        return Promise.resolve(block);
      }

      let blockPromise = this._deduper.dedup(
          blockKey,
          () => this.source.readBlock(...zoomBlockCoord));

      return blockPromise
          .then(({block, etag}) => {
            this._stateIDs.set(blockKey, etag);
            this._cache.set(blockKey, block);
            return block;
          });
    }

    setBlock(zoomLevel, x, y, z, block) {
      let blockKey = [zoomLevel, x, y, z].join('/');

      this._dirty.add(blockKey);
      this._cache.set(blockKey, block);

      this.trigger(
          ImageBlock.Cache.EVENT_BLOCK_CHANGED,
          {zoomLevel, x, y, z, block});
    }

    evictAll() {
      this._cache.evictAll();
    }

    _onBlockEviction(key, block) {
      let stateID = this._stateIDs.get(key);
      this._stateIDs.delete(key);

      if (this._dirty.delete(key)) {
        let [zoomLevel, x, y, z] = key.split('/');
        this.trigger(
            ImageBlock.Cache.EVENT_DIRTY_BLOCK_EVICTED,
            {zoomLevel, x, y, z, stateID, block});
      }
    }
  };

  ImageBlock.Cache.EVENT_BLOCK_CHANGED = 'imageblock_cache_event_block_changed';
  ImageBlock.Cache.EVENT_DIRTY_BLOCK_EVICTED = 'imageblock_cache_event_dirty_block_evicted';

  CATMAID.ImageBlock = ImageBlock;

})(CATMAID);
