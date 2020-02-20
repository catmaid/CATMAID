(function (CATMAID) {

  'use strict';

  /**
   * Given a parallel promise task executor of a certain capacity, dispatch
   * arguments to that executor from a set of named queues.
   */
  CATMAID.MultiQueueDispatcher = class MultiQueueDispatcher {
    constructor(dispatcher, capacity = 16, _estimatedOccuped = undefined) {
      this._queues = new Map();
      this._dispatched = new Map();
      this._estimatedOccuped = _estimatedOccuped || (() => this._dispatched.size);
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

    _getQueued() {
      let qs = Array.from(this._queues.values()).filter((q) => q.length > 0);
      if (!qs.length) return;
      let queue = qs[Math.floor(Math.random() * qs.length)];
      return queue.pop();
    }
  };

})(CATMAID);
