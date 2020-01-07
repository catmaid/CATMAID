(function (CATMAID) {

'use strict';

CATMAID.PromiseWorker = class PromiseWorker {
  constructor(worker) {
    this._worker = worker;
    this._nextMessageId = 0;
    this._callbacks = {};

    if (this._worker instanceof SharedWorker) {
      this._worker.port.onmessage = (e) => this.onMessage(e);
    } else {
      this._worker.onmessage = (e) => this.onMessage(e);
    }
    // this._worker.onerror = (error) => this.onError(error);
  }

  postMessage(message) {
    let messageId = this._nextMessageId++;

    return new Promise((resolve, reject) => {
      this._callbacks[messageId] = [resolve, reject];

      if (this._worker instanceof SharedWorker) {
        this._worker.port.postMessage([messageId, message]);
      } else {
        this._worker.postMessage([messageId, message]);
      }
    });
  }

  onMessage(e) {
    let [messageId, message] = e.data;
    let callback = this._callbacks[messageId];
    delete this._callbacks[messageId];
    callback[0](message);
  }

  terminate() {
    this._worker.terminate();
    for (let [, callback] of Object.entries(this._callbacks)) {
      callback[1]();
    }
    this._callbacks = {};
  }
};

})(CATMAID);
