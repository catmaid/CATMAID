importScripts('ngpre_wasm.js');
// // The worker can be directly initialized like this, but prefer to
// // use the WebAssembly.Module already loaded in CATMAID and passed
// // in the initialization method.
// let promiseReady = wasm_bindgen('ngpre_wasm_bg.wasm').then(() => wasm_bindgen);

// // Cannot do this yet because browsers do not support `{type: 'module'}`
// // workers.
// let promiseReady = import('ngpre_wasm.js')
//   .then(ngprewasm => ngprewasm
//     .default('ngpre_wasm_bg.wasm')
//     .then(() => ngprewasm));

let promiseReady;
let promiseReader;

onmessage = function(e) {
  let [messageId, message] = e.data;

  if (message.length == 2) {
    // Initialization
    let [wasmModule, rootPath] = message;
    promiseReady = wasm_bindgen({ module_or_path: wasmModule[0] }).then(() => wasm_bindgen);
    promiseReader = promiseReady
      .then(ngprewasm => ngprewasm.NgPreHTTPFetch.open(rootPath));
    promiseReader.then(r => postMessage([messageId, r]));
  } else if (message.length == 4) {
    let [path, dataAttrsPtr, grid_coords, use_cache] = message;
    let dataAttrs = wasm_bindgen.DatasetAttributes.from_json(dataAttrsPtr);

    promiseReader.then(r => {
      r.read_blocks_with_etag(path, dataAttrs, grid_coords)
        .then(blocks => {
          if (blocks) {
            const loadedBlocks = [];
            for (let i=0; i<blocks.length; ++i) {
              let block = blocks[i];
              if (block) {
                // Must destructure the block here so that the data buffer is
                // transferrable and therefore zero-copy.
                loadedBlocks.push({
                  etag: block.get_etag(),
                  size: block.get_size(),
                  gridPosition: block.get_grid_position(),
                  // Needs to be last, due to the block being consumed (into)
                  data: block.into_data(),
                });
              }
            }
            postMessage([messageId, loadedBlocks], loadedBlocks.map(b => b ? b.data.buffer : b));
          } else {
            postMessage([messageId, blocks]);
          }
        });
    });
  } else if (message.length == 5) {
    let [path, dataAttrsPtr, grid_coords, use_cache, _] = message;

    // This does not work because:
    // - This wasm instance does not share memory with the sender instance.
    // - Even when it does, this requires custom rustc parameters. See the
    //   wasm_bindgen parallel raytracer example for details.
    // let dataAttrs = wasm_bindgen.DatasetAttributes.__wrap(dataAttrsPtr.ptr);
    // Instead, use JSON serialization.
    let dataAttrs = wasm_bindgen.DatasetAttributes.from_json(dataAttrsPtr);

    promiseReader.then(r => {
      r.get_optimized_request_bundles(path, dataAttrs, grid_coords)
        .then(raw_bundles => {
          // Bundles are returned in a flattened version of a nested array, so
          // we must recreate the nested array manually.
          let bundles = raw_bundles.reduce((o, c) => {
            if (o.count === 0) {
              // Add new bundle
              o.count = Number(c);
              o.target.push([]);
            } else if (o.coord) {
              // Add BigInt dimension to current coordinate
              o.coord.push(c);
              if (o.coord.length == 3) {
                // Is already added to bundle below
                o.coord = null;
                o.count -= 1;
              }
            } else {
              // Add new coordinate array to current bundle and add first BigInt
              // dimension.
              o.coord = [c];
              o.target[o.target.length - 1].push(o.coord);
            }
            return o;
          }, {
            target: [],
            coord: null,
            count: 0,
          }).target;

          postMessage([messageId, bundles]);
        });
    });

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
