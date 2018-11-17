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

    expire(key) {
      this._pending.delete(key);
    }

    clear() {
      this._pending.clear();
    }
  };

})(CATMAID);
