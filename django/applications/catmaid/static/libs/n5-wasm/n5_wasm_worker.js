importScripts('n5_wasm.js');
// // The worker can be directly initialized like this, but prefer to
// // use the WebAssembly.Module already loaded in CATMAID and passed
// // in the initialization method.
// let promiseReady = wasm_bindgen('n5_wasm_bg.wasm').then(() => wasm_bindgen);

// // Cannot do this yet because browsers do not support `{type: 'module'}`
// // workers.
// let promiseReady = import('n5_wasm.js')
//   .then(n5wasm => n5wasm
//     .default('n5_wasm_bg.wasm')
//     .then(() => n5wasm));

let promiseReady;
let promiseReader;

onmessage = function(e) {
  let [messageId, message] = e.data;

  if (message.length == 2) {
    // Initialization
    let [wasmModule, rootPath] = message;
    promiseReady = wasm_bindgen(...wasmModule).then(() => wasm_bindgen);
    promiseReader = promiseReady
      .then(n5wasm => n5wasm.N5HTTPFetch.open(rootPath));
    promiseReader.then(r => postMessage([messageId, r]));
  } else {
    let [path, dataAttrsPtr, blockCoord] = message;

    // This does not work because:
    // - This wasm instance does not share memory with the sender instance.
    // - Even when it does, this requires custom rustc parameters. See the
    //   wasm_bindgen parallel raytracer example for details.
    // let dataAttrs = wasm_bindgen.DatasetAttributes.__wrap(dataAttrsPtr.ptr);
    // Instead, use JSON serialization.
    let dataAttrs = wasm_bindgen.DatasetAttributes.from_json(dataAttrsPtr);

    promiseReader.then(r => {
      r.read_block_with_etag(path, dataAttrs, blockCoord)
        .then(block => {
          if (block) {
            // Must destructure the block here so that the data buffer is
            // transferrable and therefore zero-copy.
            let desBlock = {
              etag: block.get_etag(),
              size: block.get_size(),
              data: block.into_data(),
            };
            postMessage([messageId, desBlock], [desBlock.data.buffer]);
          } else {
            postMessage([messageId, block]);
          }
        });
    });
  }
};
