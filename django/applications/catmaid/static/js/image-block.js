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
    constructor(source, capacity = ImageBlock.Cache.DEFAULT_CAPACITY) {
      this.source = source;
      this._cache = new CATMAID.LRUCache(capacity);
      this._deduper = new CATMAID.CoalescingPromiseDeduplicator();
      this._stateIDs = new Map();
      this._dirty = new Set();

      this._cache.on(CATMAID.LRUCache.EVENT_EVICTED, this._onBlockEviction, this);
      CATMAID.asEventSource(this);

      this.queue = new CATMAID.MultiQueueDispatcher(
        coord => this.readBlock(...coord),
        4,
        () => this._deduper.pending()
      );
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
            this.queue.dispatch();
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

  ImageBlock.Cache.DEFAULT_CAPACITY = 256;

  ImageBlock.Cache.EVENT_BLOCK_CHANGED = 'imageblock_cache_event_block_changed';
  ImageBlock.Cache.EVENT_DIRTY_BLOCK_EVICTED = 'imageblock_cache_event_dirty_block_evicted';

  CATMAID.BlockCoordBounds = class BlockCoordBounds {
    constructor(min, max) {
      // Inclusive.
      this.min = min;
      // Inclusive.
      this.max = max;
    }

    list() {
      let current = this.min.slice();
      let coords = [];

      if (this.min.some((m, i) => m > this.max[i])) return coords;

      while (!CATMAID.tools.arraysEqual(current, this.max)) {
        coords.push(current.slice());
        for (var ind = 0; ind < current.length; ind++) {
          current[ind] += 1;
          if (current[ind] > this.max[ind]) {
            current[ind] = this.min[ind];
          } else {
            break;
          }
        }
      }

      coords.push(current);

      return coords;
    }

    contains(coord) {
      return coord.every((c, i) => this.min[i] <= c && c <= this.max[i]);
    }

    intersect(other) {
      this.min = this.min.map((m, i) => Math.max(m, other.min[i]));
      this.max = this.max.map((m, i) => Math.min(m, other.max[i]));
    }

    clampToSource(source) {
      let zoomLevel = this.min[0];
      let sourceBounds = source.blockCoordBounds(zoomLevel);
      if (!sourceBounds) {
        // Make this an empty interval.
        this.max = this.min.map(i => i - 1);
        return;
      }
      sourceBounds.min.unshift(zoomLevel);
      sourceBounds.max.unshift(zoomLevel);
      this.intersect(sourceBounds);
    }
  };

  ImageBlock.Prefetch = {Policies: {}};

  ImageBlock.Prefetch.PrefetchPolicy = class PrefetchPolicy {
    static coordinatesFor(imageBlockLayer, scaledStackPosition) {
      throw new CATMAID.NotImplementedError();
    }

    static description() {
      throw new CATMAID.NotImplementedError();
    }
  };

  /**
   * Prefetch slabs neighboring the current slab along the viewer's z-axis.
   */
  ImageBlock.Prefetch.Policies.NormalNeighboringSlabs = class NormalNeighboringSlabs {
    static coordinatesFor(imageBlockLayer, scaledStackPosition) {
      let prefetchBounds = [];
      [imageBlockLayer.blockCoordsForLocation(scaledStackPosition)]
        .map(bounds => [bounds.min, bounds.max]
          .map(([s, ...c]) => [s, ...CATMAID.tools.permute(c, imageBlockLayer.dimPerm)]))
        .forEach(([[mins, minx, miny, minz], [maxs, maxx, maxy, maxz]]) => {
          prefetchBounds.push([[mins, minx, miny, minz + 1], [maxs, maxx, maxy, maxz + 1]]);
          prefetchBounds.push([[mins, minx, miny, minz - 1], [maxs, maxx, maxy, maxz - 1]]);
        });
      let prefetch = prefetchBounds
        .map(bounds => bounds
          .map(([s, ...c]) => [s, ...CATMAID.tools.permute(c, imageBlockLayer.recipDimPerm)]))
        .map(([min, max]) => {
          let bounds = new CATMAID.BlockCoordBounds(min, max);
          bounds.clampToSource(imageBlockLayer.tileSource);
          return bounds;
        })
        .reduce((prefetch, bounds) => {prefetch.push(...bounds.list()); return prefetch;}, []);

      return prefetch;
    }

    static description() {
      return 'Prefetch blocks along the orthogonal axis';
    }
  };

  /**
   * Prefetch the current view zoomed in to the next level.
   */
  ImageBlock.Prefetch.Policies.ZoomIn = class ZoomIn {
    static coordinatesFor(imageBlockLayer, scaledStackPosition) {
      let nextZoom = scaledStackPosition.s - 1;
      if (nextZoom < 0) return [];

      let sv = imageBlockLayer.stackViewer;
      let pc = sv.projectCoordinates();
      let stack = imageBlockLayer.stack;
      let ps = stack.stackToProjectSMP(nextZoom);
      let ssp = {
        xc: Math.floor(stack.projectToUnclampedStackX(pc.z, pc.y, pc.x)
          / Math.pow(2, stack.projectToStackSX(ps)) - sv.viewWidth / 2),
        yc: Math.floor(stack.projectToUnclampedStackY(pc.z, pc.y, pc.x)
          / Math.pow(2, stack.projectToStackSY(ps)) - sv.viewHeight / 2),
        z: stack.projectToUnclampedStackZ(pc.z, pc.y, pc.x),
        s: stack.projectToStackSMP(ps)
      };
      let viewBounds = imageBlockLayer.blockCoordsForLocation(ssp);
      viewBounds.clampToSource(imageBlockLayer.tileSource);

      let prefetch = viewBounds.list();
      return prefetch;
    }

    static description() {
      return 'Prefetch the current view zoomed in to the next level';
    }
  };

  /**
   * Prefetch blocks on the plane neighboring the view.
   */
  ImageBlock.Prefetch.Policies.PlanarNeighboringBorder = class PlanarNeighboringBorder {
    static coordinatesFor(imageBlockLayer, scaledStackPosition) {
      let prefetch = [];
      let bounds = imageBlockLayer.blockCoordsForLocation(scaledStackPosition);
      let [min, max] = [bounds.min, bounds.max]
        .map(([s, ...c]) => [s, ...CATMAID.tools.permute(c, imageBlockLayer.dimPerm)]);

      for (var x = min[1] - 1; x <= max[1] + 1; x++) {
        prefetch.push([min[0], x, min[2] - 1, min[3]]);
        prefetch.push([max[0], x, max[2] + 1, max[3]]);
      }
      for (var y = min[2] - 1; y <= max[2] + 1; y++) {
        prefetch.push([min[0], min[1] - 1, y, min[3]]);
        prefetch.push([max[0], max[1] + 1, y, max[3]]);
      }

      let zoomLevel = bounds.min[0];
      let sourceBounds = imageBlockLayer.tileSource.blockCoordBounds(zoomLevel);
      if (!sourceBounds) return [];
      sourceBounds.min.unshift(zoomLevel);
      sourceBounds.max.unshift(zoomLevel);

      prefetch = prefetch
        .map(([s, ...c]) => [s, ...CATMAID.tools.permute(c, imageBlockLayer.recipDimPerm)])
        .filter(coord => sourceBounds.contains(coord));

      console.log(bounds.min, bounds.max);
      console.log(prefetch);
      return prefetch;
    }

    static description() {
      return 'Prefetch blocks on the plane neighboring the view';
    }
  };

  CATMAID.ImageBlock = ImageBlock;

})(CATMAID);
