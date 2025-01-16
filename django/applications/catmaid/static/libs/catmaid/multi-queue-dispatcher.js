(function (CATMAID) {

  'use strict';

  /**
   * Given a parallel promise task executor of a certain capacity, dispatch
   * arguments to that executor from a set of named queues.
   *
   * @param _allowSetDispatch bool If true a dispatch call will call the
   *                             dispatcher function with all queued elements.
   * @param _setDispatchFilterFn Function If set dispatch is enabled, this
   *                                      filter function can be used to only
   *                                      include some of the queue entries in a
   *                                      batch.
   */
  CATMAID.MultiQueueDispatcher = class MultiQueueDispatcher {
    constructor(dispatcher, capacity = 16, _estimatedOccuped = undefined, _allowSetDispatch = false, _setDispatchFilterFn = undefined) {
      this._queues = new Map();
      this._dispatched = new Map();
      this._estimatedOccuped = _estimatedOccuped || (() => this._dispatched.size);
      this._allowSetDispatch = _allowSetDispatch;
      this._setDispatchFilterFn = _setDispatchFilterFn;
      this._id = 0;
      this.capacity = capacity;
      this.dispatcher = dispatcher;
    }

    get(key) {
      let queue = this._queues.get(key);

      if (!queue) {
        queue = [];
        this._queues.set(key, queue);
      }

      return queue;
    }

    availableCapacity() {
      return this.capacity - this._estimatedOccuped();
    }

    dispatch() {
      if (this.availableCapacity()) {
        if (this._allowSetDispatch) {
          let toDispatch = this._getAllQueued();
          if (!toDispatch) return;

          let id = this._id++;
          this._dispatched.set(id, this.dispatcher(toDispatch)
            .finally(() => {
              this._dispatched.delete(id);
              this.dispatch();
            }));
        } else {
          let toDispatch = this._getQueued();
          if (!toDispatch) return;

          let id = this._id++;
          this._dispatched.set(id, this.dispatcher(toDispatch)
            .finally(() => {
              this._dispatched.delete(id);
              this.dispatch();
            }));
        }
      }
    }

    _getQueued() {
      let qs = Array.from(this._queues.values()).filter((q) => q.length > 0);
      if (!qs.length) return;
      let queue = qs[Math.floor(Math.random() * qs.length)];
      return queue.pop();
    }

    _getAllQueued() {
      let qs = Array.from(this._queues.values()).filter((q) => q.length > 0);
      if (!qs.length) return;

      let queue = qs[Math.floor(Math.random() * qs.length)];

      if (this._setDispatchFilterFn) {
        let batch = queue.filter(this._setDispatchFilterFn);
        let remaining = queue.filter((x, i, a) => !this._setDispatchFilterFn(x, i, a));

        // Reset queue to remaining elements
        queue.length = 0;
        for (let e of remaining) {
          queue.push(e);
        }

        return batch;
      } else {
        let allQueued = Array.from(queue);
        queue.length = 0;
        return allQueued;
      }
    }
  };

})(CATMAID);
