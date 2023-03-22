importScripts('nblast_js.js');
// // The worker can be directly initialized like this, but prefer to
// // use the WebAssembly.Module already loaded in CATMAID and passed
// // in the initialization method.
// let nblastWasmPromise = wasm_bindgen('ngpre_wasm_bg.wasm').then(() => wasm_bindgen);

// // Cannot do this yet because browsers do not support `{type: 'module'}`
// // workers.
// let nblastWasmPromise = import('ngpre_wasm.js')
//   .then(ngprewasm => ngprewasm
//     .default('ngpre_wasm_bg.wasm')
//     .then(() => ngprewasm));

let nblastWasmPromise;
let arenaPromise;

const { NblastArena, makeFlatPointsTangentsAlphas } = wasm_bindgen;

let arena;

/**
 * Return a Float64Array, which may contain the contents of (flattened) arr,
 * or an array with a particular length and fill value.
 *
 * @param {(number[]|number[][]|Float64Array)} [arr]
 * @param {number} [lengthIfNull]
 * @param {number} [fillIfNull]
 * @returns {Float64Array}
 */
function flatArray64(arr, lengthIfNull, fillIfNull) {
  if (arr == null) {
    return new Float64Array(lengthIfNull).fill(fillIfNull);
  }
  if (arr instanceof Float64Array) {
    return arr;
  }
  if (Array.isArray(arr[0])) {
    return new Float64Array(arr.flat());
  } else {
    return new Float64Array(arr);
  }
}

function sanitizeSymmetry(sym) {
  return sym ? sym.toString() : undefined;
}

function sanitizeMaxCentroidDist(mcd) {
    return Number(mcd) > 0 ? Number(mcd) : undefined;
}

onmessage = async function(e) {
  let [messageId, message] = e.data;

  await wasm_bindgen();

  let [methodName, args] = message;
  let r;

  switch (methodName) {
    case "new":
      // return whether an old arena was overwritten
      r = arena !== undefined;
      arena = new NblastArena(
        flatArray64(args.distThresholds),
        flatArray64(args.dotTresholds),
        flatArray64(args.cells),
        Math.round(args.k)
      );
      break;
    case "addNeuron":
      let pointsFlat = flatArray64(args.points);

      if (args.tangents == null) {
        return this.arena.addPoints(pointsFlat);
      }
      let tangentsFlat = flatArray64(args.tangents);
      let alphasFlat = flatArray64(args.alphas, points.length, 1);

      r = this.arena.addPointsTangentsAlphas(
        pointsFlat,
        tangentsFlat,
        alphasFlat
      );
      break;
    case "queryTarget":
      r = arena.queryTarget(
        Math.round(args.queryIdx),
        Math.round(args.targetIdx),
        !!args.normalize,
        sanitizeSymmetry(args.symmetry),
        !!args.useAlpha
      );
      break;
    case "queriesTargets":
      r = arena.queriesTargets(
        new BigUint64Array(args.queryIdxs),
        new BigUint64Array(args.targetIdxs),
        !!args.normalize,
        sanitizeSymmetry(args.symmetry),
        !!args.useAlpha,
        sanitizeMaxCentroidDist(args.maxCentroidDist)
      );
      break;
    case "allVAll":
      r = arena.allVAll(
        !!args.normalize,
        sanitizeSymmetry(args.symmetry),
        !!args.useAlpha,
        sanitizeMaxCentroidDist(args.maxCentroidDist)
      );
      break;
    default:
      r = new Error("Unknown method " + methodName);
  }

  postMessage([messageId, r])

  // if (message.length == 2) {
  //   // Initialization
  //   let [wasmModule, rootPath] = message;
  //   nblastWasmPromise = wasm_bindgen(...wasmModule).then(() => wasm_bindgen);
  //   arenaPromise = nblastWasmPromise
  //     .then(ngprewasm => ngprewasm.NgPreHTTPFetch.open(rootPath));
  //   arenaPromise.then(r => postMessage([messageId, r]));
  // } else {
  //   let [path, dataAttrsPtr, blockCoord] = message;

  //   // This does not work because:
  //   // - This wasm instance does not share memory with the sender instance.
  //   // - Even when it does, this requires custom rustc parameters. See the
  //   //   wasm_bindgen parallel raytracer example for details.
  //   // let dataAttrs = wasm_bindgen.DatasetAttributes.__wrap(dataAttrsPtr.ptr);
  //   // Instead, use JSON serialization.
  //   let dataAttrs = wasm_bindgen.DatasetAttributes.from_json(dataAttrsPtr);

  //   arenaPromise.then(r => {
  //     r.read_block_with_etag(path, dataAttrs, blockCoord)
  //       .then(block => {
  //         if (block) {
  //           // Must destructure the block here so that the data buffer is
  //           // transferrable and therefore zero-copy.
  //           let desBlock = {
  //             etag: block.get_etag(),
  //             size: block.get_size(),
  //             data: block.into_data(),
  //           };
  //           postMessage([messageId, desBlock], [desBlock.data.buffer]);
  //         } else {
  //           postMessage([messageId, block]);
  //         }
  //       });
  //   });
  // }
};
