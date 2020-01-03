(function (CATMAID) {

'use strict';

CATMAID.PromiseWorkerPool = class PromiseWorkerPool {
  constructor(factory, minWorkers=2, maxWorkers=8, idleTime=300000) {
    this._factory = factory;
    this._idle = new Set();
    this._busy = new Set();
    this._messageQueue = [];
    this.minWorkers = minWorkers;
    this.maxWorkers = maxWorkers;
    this.idleTime = idleTime;
    this._idleTimeout = null;

    Array(this.minWorkers).fill().map(() => this.spawn());
  }

  size() {
    return this._busy.size + this._idle.size;
  }

  pruneIdle() {
    let skipped = this._busy.size;
    for (let worker of this._idle) {
      if (skipped < this.minWorkers) {
        skipped++;
        continue;
      }

      this._idle.delete(worker);
      worker.terminate();
    }
  }

  spawn() {
    let {worker, init} = this._factory();
    this._busy.add(worker);
    return init(worker).then(() => this.complete(worker));
  }

  complete(worker) {
    if (this._messageQueue.length) {
      this.dispatch(worker);
    } else {
      this._idle.add(worker);
      this._busy.delete(worker);
      window.clearTimeout(this._idleTimeout);
      this._idleTimeout = window.setTimeout(() => this.pruneIdle(), this.idleTime);
    }

    return worker;
  }

  dispatch(worker) {
    if (this._messageQueue.length) {
      if (this._idle.has(worker)) {
        this._idle.delete(worker);
        this._busy.add(worker);
      }

      let [message, resolve, reject] = this._messageQueue.shift();
      worker.postMessage(message)
        .then(result => resolve(result))
        .catch(error => reject(error))
        .finally(() => this.complete(worker));
    }
  }

  postMessage(message) {
    return new Promise((resolve, reject) => {
      this._messageQueue.push([message, resolve, reject]);

      if (this._idle.size) {
        this.dispatch(this._idle.values().next().value);
      } else if (this.size() < this.maxWorkers) {
        this.spawn().then(worker => this.dispatch(worker));
      }
    });
  }

  terminate() {
    this._worker.terminate();
    for (let worker of this._busy) {
      worker.terminate();
    }
    for (let worker of this._idle) {
      worker.terminate();
    }
    for (let [, , reject] of this._messageQueue) {
      reject();
    }
    this._idle.clear();
    this._busy.clear();
    this._messageQueue = [];
  }
};

})(CATMAID);
