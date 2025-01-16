(function (CATMAID) {

  'use strict';

  CATMAID.CoalescingPromiseDeduplicator = class CoalescingPromiseDeduplicator {
    constructor() {
      this._pending = new Map();
    }

    dedup(key, request) {
      if (!this._pending.has(key)) {
        let promise = request();
        this._pending.set(key, promise);
        promise.finally(() => this._pending.delete(key));
        return promise;
      } else {
        return this._pending.get(key);
      }
    }

    /**
     * If many keys are promised by the same request, they can be deduplicated
     * at once.
     */
    dedup_many(keys, request, extract) {
      let loadingPromises = [];
      let toRequest = [];

      for (const key of keys) {
        if (this._pending.has(key)) {
          loadingPromises.push(this._pending.get(key));
        } else {
          toRequest.push(key);
        }
      }

      if (toRequest.length > 0) {
        let promise = request(toRequest);

        for (const key of toRequest) {
          let keyPromise = Promise.all([promise, key]).then(results => {
            let [blockData, blockKey] = results;
            return extract(blockData, blockKey);
          });
          this._pending.set(key, keyPromise);
          loadingPromises.push(keyPromise);
        }

        promise.finally(() => {
          for (const key in toRequest) {
            this._pending.delete(key);
          }
        });
      }

      return Promise.all(loadingPromises);
    }

    expire(key) {
      this._pending.delete(key);
    }

    clear() {
      this._pending.clear();
    }

    pending() {
      return this._pending.size;
    }
  };

})(CATMAID);
