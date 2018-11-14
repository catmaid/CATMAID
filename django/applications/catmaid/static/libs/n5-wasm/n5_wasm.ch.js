/* tslint:disable */
let wasm;
export const booted = fetch(CATMAID.makeStaticURL('libs/n5-wasm/n5_wasm_bg.wasm'))
    .then(res => res.arrayBuffer())
    .then(bytes => {
        return WebAssembly.instantiate(bytes, import_obj)
            .then(obj => {
            wasm = obj.instance.exports;
        });
    });

const heap = new Array(32);

heap.fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let cachedTextDecoder = new TextDecoder('utf-8');

let cachegetUint8Memory = null;
function getUint8Memory() {
    if (cachegetUint8Memory === null || cachegetUint8Memory.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory;
}

function getStringFromWasm(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory().subarray(ptr, ptr + len));
}

let cachedTextEncoder = new TextEncoder('utf-8');

let WASM_VECTOR_LEN = 0;

function passStringToWasm(arg) {

    const buf = cachedTextEncoder.encode(arg);
    const ptr = wasm.__wbindgen_malloc(buf.length);
    getUint8Memory().set(buf, ptr);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
}

let cachegetUint32Memory = null;
function getUint32Memory() {
    if (cachegetUint32Memory === null || cachegetUint32Memory.buffer !== wasm.memory.buffer) {
        cachegetUint32Memory = new Uint32Array(wasm.memory.buffer);
    }
    return cachegetUint32Memory;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

export function __widl_f_get_Headers(ret, arg0, arg1, arg2, exnptr) {
    let varg1 = getStringFromWasm(arg1, arg2);
    try {
        const val = getObject(arg0).get(varg1);
        const retptr = isLikeNone(val) ? [0, 0] : passStringToWasm(val);
        const retlen = WASM_VECTOR_LEN;
        const mem = getUint32Memory();
        mem[ret / 4] = retptr;
        mem[ret / 4 + 1] = retlen;

    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __widl_f_new_with_str_and_init_Request(arg0, arg1, arg2, exnptr) {
    let varg0 = getStringFromWasm(arg0, arg1);
    try {
        return addHeapObject(new Request(varg0, getObject(arg2)));
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __widl_instanceof_Response(idx) {
    return getObject(idx) instanceof Response ? 1 : 0;
}

export function __widl_f_ok_Response(arg0) {
    return getObject(arg0).ok;
}

export function __widl_f_headers_Response(arg0) {
    return addHeapObject(getObject(arg0).headers);
}

export function __widl_f_array_buffer_Response(arg0, exnptr) {
    try {
        return addHeapObject(getObject(arg0).arrayBuffer());
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __widl_f_json_Response(arg0, exnptr) {
    try {
        return addHeapObject(getObject(arg0).json());
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __widl_instanceof_Window(idx) {
    return getObject(idx) instanceof Window ? 1 : 0;
}

export function __widl_f_fetch_with_request_Window(arg0, arg1) {
    return addHeapObject(getObject(arg0).fetch(getObject(arg1)));
}

export function __wbg_instanceof_ArrayBuffer_4c1748a7b3cc029e(idx) {
    return getObject(idx) instanceof ArrayBuffer ? 1 : 0;
}

export function __wbg_new_1476c5ece1db5a44(arg0, arg1) {
    let varg0 = getStringFromWasm(arg0, arg1);
    return addHeapObject(new Error(varg0));
}

export function __wbg_newnoargs_a6ad1b52f5989ea9(arg0, arg1) {
    let varg0 = getStringFromWasm(arg0, arg1);
    return addHeapObject(new Function(varg0));
}

export function __wbg_call_720151a19a4c6808(arg0, arg1, exnptr) {
    try {
        return addHeapObject(getObject(arg0).call(getObject(arg1)));
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __wbg_call_7aced47e67a8c62d(arg0, arg1, arg2, exnptr) {
    try {
        return addHeapObject(getObject(arg0).call(getObject(arg1), getObject(arg2)));
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __wbg_new_0b9640534b8a1f8a() {
    return addHeapObject(new Object());
}

export function __wbg_set_f45b1a9b8c0a9789(arg0, arg1, arg2, exnptr) {
    try {
        return Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
    } catch (e) {
        const view = getUint32Memory();
        view[exnptr / 4] = 1;
        view[exnptr / 4 + 1] = addHeapObject(e);

    }
}

export function __wbg_new_d90640b4228ff695(arg0) {
    return addHeapObject(new Uint8Array(getObject(arg0)));
}

export function __wbg_length_cece07c643f59431(arg0) {
    return getObject(arg0).length;
}

export function __wbg_set_17d4223f7634d1e7(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2);
}

export function __wbg_new_bdd94b8735e4f66d(arg0, arg1) {
    let cbarg0 = function(arg0, arg1) {
        let a = this.a;
        this.a = 0;
        try {
            return this.f(a, this.b, addHeapObject(arg0), addHeapObject(arg1));

        } finally {
            this.a = a;

        }

    };
    cbarg0.f = wasm.__wbg_function_table.get(43);
    cbarg0.a = arg0;
    cbarg0.b = arg1;
    try {
        return addHeapObject(new Promise(cbarg0.bind(cbarg0)));
    } finally {
        cbarg0.a = cbarg0.b = 0;

    }
}

export function __wbg_resolve_b2d9398056dbfe64(arg0) {
    return addHeapObject(Promise.resolve(getObject(arg0)));
}

export function __wbg_then_c75e723ffb976395(arg0, arg1) {
    return addHeapObject(getObject(arg0).then(getObject(arg1)));
}

export function __wbg_then_045256cb8c6a8ceb(arg0, arg1, arg2) {
    return addHeapObject(getObject(arg0).then(getObject(arg1), getObject(arg2)));
}

export function __wbg_buffer_0346d756c794d630(arg0) {
    return addHeapObject(getObject(arg0).buffer);
}

let cachegetInt32Memory = null;
function getInt32Memory() {
    if (cachegetInt32Memory === null || cachegetInt32Memory.buffer !== wasm.memory.buffer) {
        cachegetInt32Memory = new Int32Array(wasm.memory.buffer);
    }
    return cachegetInt32Memory;
}

function getArrayI32FromWasm(ptr, len) {
    return getInt32Memory().subarray(ptr / 4, ptr / 4 + len);
}

let cachedGlobalArgumentPtr = null;
function globalArgumentPtr() {
    if (cachedGlobalArgumentPtr === null) {
        cachedGlobalArgumentPtr = wasm.__wbindgen_global_argument_ptr();
    }
    return cachedGlobalArgumentPtr;
}

let cachegetInt64Memory = null;
function getInt64Memory() {
    if (cachegetInt64Memory === null || cachegetInt64Memory.buffer !== wasm.memory.buffer) {
        cachegetInt64Memory = new BigInt64Array(wasm.memory.buffer);
    }
    return cachegetInt64Memory;
}

function getArrayI64FromWasm(ptr, len) {
    return getInt64Memory().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm(ptr, len) {
    return getUint8Memory().subarray(ptr / 1, ptr / 1 + len);
}

let cachegetUint16Memory = null;
function getUint16Memory() {
    if (cachegetUint16Memory === null || cachegetUint16Memory.buffer !== wasm.memory.buffer) {
        cachegetUint16Memory = new Uint16Array(wasm.memory.buffer);
    }
    return cachegetUint16Memory;
}

function getArrayU16FromWasm(ptr, len) {
    return getUint16Memory().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU32FromWasm(ptr, len) {
    return getUint32Memory().subarray(ptr / 4, ptr / 4 + len);
}

let cachegetUint64Memory = null;
function getUint64Memory() {
    if (cachegetUint64Memory === null || cachegetUint64Memory.buffer !== wasm.memory.buffer) {
        cachegetUint64Memory = new BigUint64Array(wasm.memory.buffer);
    }
    return cachegetUint64Memory;
}

function getArrayU64FromWasm(ptr, len) {
    return getUint64Memory().subarray(ptr / 8, ptr / 8 + len);
}

let cachegetInt8Memory = null;
function getInt8Memory() {
    if (cachegetInt8Memory === null || cachegetInt8Memory.buffer !== wasm.memory.buffer) {
        cachegetInt8Memory = new Int8Array(wasm.memory.buffer);
    }
    return cachegetInt8Memory;
}

function getArrayI8FromWasm(ptr, len) {
    return getInt8Memory().subarray(ptr / 1, ptr / 1 + len);
}

let cachegetInt16Memory = null;
function getInt16Memory() {
    if (cachegetInt16Memory === null || cachegetInt16Memory.buffer !== wasm.memory.buffer) {
        cachegetInt16Memory = new Int16Array(wasm.memory.buffer);
    }
    return cachegetInt16Memory;
}

function getArrayI16FromWasm(ptr, len) {
    return getInt16Memory().subarray(ptr / 2, ptr / 2 + len);
}

let cachegetFloat32Memory = null;
function getFloat32Memory() {
    if (cachegetFloat32Memory === null || cachegetFloat32Memory.buffer !== wasm.memory.buffer) {
        cachegetFloat32Memory = new Float32Array(wasm.memory.buffer);
    }
    return cachegetFloat32Memory;
}

function getArrayF32FromWasm(ptr, len) {
    return getFloat32Memory().subarray(ptr / 4, ptr / 4 + len);
}

let cachegetFloat64Memory = null;
function getFloat64Memory() {
    if (cachegetFloat64Memory === null || cachegetFloat64Memory.buffer !== wasm.memory.buffer) {
        cachegetFloat64Memory = new Float64Array(wasm.memory.buffer);
    }
    return cachegetFloat64Memory;
}

function getArrayF64FromWasm(ptr, len) {
    return getFloat64Memory().subarray(ptr / 8, ptr / 8 + len);
}

function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

function passArray64ToWasm(arg) {
    const ptr = wasm.__wbindgen_malloc(arg.length * 8);
    getUint64Memory().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

export function __wbg_datasetattributes_new(ptr) {
    return addHeapObject(DatasetAttributes.__wrap(ptr));
}

function freeDatasetAttributes(ptr) {

    wasm.__wbg_datasetattributes_free(ptr);
}
/**
*/
export class DatasetAttributes {

    static __wrap(ptr) {
        const obj = Object.create(DatasetAttributes.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeDatasetAttributes(ptr);
    }

    /**
    * @returns {BigInt64Array}
    */
    get_dimensions() {
        const retptr = globalArgumentPtr();
        wasm.datasetattributes_get_dimensions(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Int32Array}
    */
    get_block_size() {
        const retptr = globalArgumentPtr();
        wasm.datasetattributes_get_block_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {string}
    */
    get_data_type() {
        const retptr = globalArgumentPtr();
        wasm.datasetattributes_get_data_type(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {string}
    */
    get_compression() {
        const retptr = globalArgumentPtr();
        wasm.datasetattributes_get_compression(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_ndim() {
        return wasm.datasetattributes_get_ndim(this.ptr);
    }
    /**
    * Get the total number of elements possible given the dimensions.
    * @returns {number}
    */
    get_num_elements() {
        return wasm.datasetattributes_get_num_elements(this.ptr);
    }
    /**
    * Get the total number of elements possible in a block.
    * @returns {number}
    */
    get_block_num_elements() {
        return wasm.datasetattributes_get_block_num_elements(this.ptr);
    }
}

export function __wbg_vecdatablockfloat64_new(ptr) {
    return addHeapObject(VecDataBlockFLOAT64.__wrap(ptr));
}

function freeVecDataBlockFLOAT64(ptr) {

    wasm.__wbg_vecdatablockfloat64_free(ptr);
}
/**
*/
export class VecDataBlockFLOAT64 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockFLOAT64.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockFLOAT64(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat64_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat64_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Float64Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat64_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayF64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Float64Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat64_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayF64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockfloat64_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat64_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_n5httpfetch_new(ptr) {
    return addHeapObject(N5HTTPFetch.__wrap(ptr));
}

function freeN5HTTPFetch(ptr) {

    wasm.__wbg_n5httpfetch_free(ptr);
}
/**
*/
export class N5HTTPFetch {

    static __wrap(ptr) {
        const obj = Object.create(N5HTTPFetch.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeN5HTTPFetch(ptr);
    }

    /**
    * @param {string} arg0
    * @returns {any}
    */
    static open(arg0) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_open(ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @returns {any}
    */
    get_version() {
        return takeObject(wasm.n5httpfetch_get_version(this.ptr));
    }
    /**
    * @param {string} arg0
    * @returns {any}
    */
    get_dataset_attributes(arg0) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_get_dataset_attributes(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @returns {any}
    */
    exists(arg0) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_exists(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @returns {any}
    */
    dataset_exists(arg0) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_dataset_exists(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @param {DatasetAttributes} arg1
    * @param {BigInt64Array} arg2
    * @returns {any}
    */
    read_block(arg0, arg1, arg2) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(arg2);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_read_block(this.ptr, ptr0, len0, arg1.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @returns {any}
    */
    list_attributes(arg0) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_list_attributes(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @param {DatasetAttributes} arg1
    * @param {BigInt64Array} arg2
    * @returns {any}
    */
    block_etag(arg0, arg1, arg2) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(arg2);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_block_etag(this.ptr, ptr0, len0, arg1.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} arg0
    * @param {DatasetAttributes} arg1
    * @param {BigInt64Array} arg2
    * @returns {any}
    */
    read_block_with_etag(arg0, arg1, arg2) {
        const ptr0 = passStringToWasm(arg0);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(arg2);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_read_block_with_etag(this.ptr, ptr0, len0, arg1.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
}

export function __wbg_vecdatablockuint64_new(ptr) {
    return addHeapObject(VecDataBlockUINT64.__wrap(ptr));
}

function freeVecDataBlockUINT64(ptr) {

    wasm.__wbg_vecdatablockuint64_free(ptr);
}
/**
*/
export class VecDataBlockUINT64 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockUINT64.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockUINT64(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint64_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint64_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {BigUint64Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint64_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {BigUint64Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint64_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockuint64_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint64_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockuint8_new(ptr) {
    return addHeapObject(VecDataBlockUINT8.__wrap(ptr));
}

function freeVecDataBlockUINT8(ptr) {

    wasm.__wbg_vecdatablockuint8_free(ptr);
}
/**
*/
export class VecDataBlockUINT8 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockUINT8.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockUINT8(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint8_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint8_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Uint8Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint8_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU8FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {Uint8Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint8_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU8FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockuint8_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint8_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockuint32_new(ptr) {
    return addHeapObject(VecDataBlockUINT32.__wrap(ptr));
}

function freeVecDataBlockUINT32(ptr) {

    wasm.__wbg_vecdatablockuint32_free(ptr);
}
/**
*/
export class VecDataBlockUINT32 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockUINT32.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockUINT32(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint32_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint32_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Uint32Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint32_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {Uint32Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint32_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockuint32_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint32_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockint64_new(ptr) {
    return addHeapObject(VecDataBlockINT64.__wrap(ptr));
}

function freeVecDataBlockINT64(ptr) {

    wasm.__wbg_vecdatablockint64_free(ptr);
}
/**
*/
export class VecDataBlockINT64 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockINT64.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockINT64(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint64_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint64_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint64_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint64_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockint64_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint64_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockuint16_new(ptr) {
    return addHeapObject(VecDataBlockUINT16.__wrap(ptr));
}

function freeVecDataBlockUINT16(ptr) {

    wasm.__wbg_vecdatablockuint16_free(ptr);
}
/**
*/
export class VecDataBlockUINT16 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockUINT16.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockUINT16(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint16_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint16_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Uint16Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint16_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU16FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 2);
        return realRet;

    }
    /**
    * @returns {Uint16Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint16_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayU16FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 2);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockuint16_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockuint16_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockfloat32_new(ptr) {
    return addHeapObject(VecDataBlockFLOAT32.__wrap(ptr));
}

function freeVecDataBlockFLOAT32(ptr) {

    wasm.__wbg_vecdatablockfloat32_free(ptr);
}
/**
*/
export class VecDataBlockFLOAT32 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockFLOAT32.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockFLOAT32(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat32_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat32_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Float32Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat32_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayF32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {Float32Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat32_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayF32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockfloat32_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockfloat32_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockint8_new(ptr) {
    return addHeapObject(VecDataBlockINT8.__wrap(ptr));
}

function freeVecDataBlockINT8(ptr) {

    wasm.__wbg_vecdatablockint8_free(ptr);
}
/**
*/
export class VecDataBlockINT8 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockINT8.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockINT8(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint8_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint8_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Int8Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint8_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI8FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {Int8Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint8_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI8FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockint8_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint8_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_version_new(ptr) {
    return addHeapObject(Version.__wrap(ptr));
}

function freeVersion(ptr) {

    wasm.__wbg_version_free(ptr);
}
/**
*/
export class Version {

    static __wrap(ptr) {
        const obj = Object.create(Version.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVersion(ptr);
    }

    /**
    * @returns {string}
    */
    to_string() {
        const retptr = globalArgumentPtr();
        wasm.version_to_string(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockint32_new(ptr) {
    return addHeapObject(VecDataBlockINT32.__wrap(ptr));
}

function freeVecDataBlockINT32(ptr) {

    wasm.__wbg_vecdatablockint32_free(ptr);
}
/**
*/
export class VecDataBlockINT32 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockINT32.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockINT32(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint32_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint32_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Int32Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint32_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {Int32Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint32_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockint32_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint32_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbg_vecdatablockint16_new(ptr) {
    return addHeapObject(VecDataBlockINT16.__wrap(ptr));
}

function freeVecDataBlockINT16(ptr) {

    wasm.__wbg_vecdatablockint16_free(ptr);
}
/**
*/
export class VecDataBlockINT16 {

    static __wrap(ptr) {
        const obj = Object.create(VecDataBlockINT16.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        freeVecDataBlockINT16(ptr);
    }

    /**
    * @returns {Int32Array}
    */
    get_size() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint16_get_size(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI32FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 4);
        return realRet;

    }
    /**
    * @returns {BigInt64Array}
    */
    get_grid_position() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint16_get_grid_position(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI64FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 8);
        return realRet;

    }
    /**
    * @returns {Int16Array}
    */
    get_data() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint16_get_data(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI16FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 2);
        return realRet;

    }
    /**
    * @returns {Int16Array}
    */
    into_data() {
        const ptr = this.ptr;
        this.ptr = 0;
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint16_into_data(retptr, ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];

        const realRet = getArrayI16FromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 2);
        return realRet;

    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        return wasm.vecdatablockint16_get_num_elements(this.ptr);
    }
    /**
    * @returns {string}
    */
    get_etag() {
        const retptr = globalArgumentPtr();
        wasm.vecdatablockint16_get_etag(retptr, this.ptr);
        const mem = getUint32Memory();
        const rustptr = mem[retptr / 4];
        const rustlen = mem[retptr / 4 + 1];
        if (rustptr === 0) return;
        const realRet = getStringFromWasm(rustptr, rustlen).slice();
        wasm.__wbindgen_free(rustptr, rustlen * 1);
        return realRet;

    }
}

export function __wbindgen_object_clone_ref(idx) {
    return addHeapObject(getObject(idx));
}

export function __wbindgen_object_drop_ref(i) { dropObject(i); }

export function __wbindgen_string_new(p, l) {
    return addHeapObject(getStringFromWasm(p, l));
}

export function __wbindgen_number_get(n, invalid) {
    let obj = getObject(n);
    if (typeof(obj) === 'number') return obj;
    getUint8Memory()[invalid] = 1;
    return 0;
}

export function __wbindgen_is_null(idx) {
    return getObject(idx) === null ? 1 : 0;
}

export function __wbindgen_is_undefined(idx) {
    return getObject(idx) === undefined ? 1 : 0;
}

export function __wbindgen_boolean_get(i) {
    let v = getObject(i);
    if (typeof(v) === 'boolean') {
        return v ? 1 : 0;
    } else {
        return 2;
    }
}

export function __wbindgen_is_symbol(i) {
    return typeof(getObject(i)) === 'symbol' ? 1 : 0;
}

export function __wbindgen_string_get(i, len_ptr) {
    let obj = getObject(i);
    if (typeof(obj) !== 'string') return 0;
    const ptr = passStringToWasm(obj);
    getUint32Memory()[len_ptr / 4] = WASM_VECTOR_LEN;
    return ptr;
}

export function __wbindgen_cb_drop(i) {
    const obj = getObject(i).original;
    dropObject(i);
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return 1;
    }
    return 0;
}

export function __wbindgen_json_parse(ptr, len) {
    return addHeapObject(JSON.parse(getStringFromWasm(ptr, len)));
}

export function __wbindgen_json_serialize(idx, ptrptr) {
    const ptr = passStringToWasm(JSON.stringify(getObject(idx)));
    getUint32Memory()[ptrptr / 4] = ptr;
    return WASM_VECTOR_LEN;
}

export function __wbindgen_memory() { return addHeapObject(wasm.memory); }

export function __wbindgen_closure_wrapper65(a, b, _ignored) {
    const f = wasm.__wbg_function_table.get(6);
    const d = wasm.__wbg_function_table.get(7);
    const cb = function(arg0) {
        this.cnt++;
        let a = this.a;
        this.a = 0;
        try {
            return f(a, b, addHeapObject(arg0));

        } finally {
            this.a = a;
            if (this.cnt-- == 1) d(this.a, b);

        }

    };
    cb.a = a;
    cb.cnt = 1;
    let real = cb.bind(cb);
    real.original = cb;
    return addHeapObject(real);
}

export function __wbindgen_throw(ptr, len) {
    throw new Error(getStringFromWasm(ptr, len));
}

let import_obj = {
    './n5_wasm': {
        __widl_f_get_Headers: __widl_f_get_Headers,
                __widl_f_new_with_str_and_init_Request: __widl_f_new_with_str_and_init_Request,
                __widl_instanceof_Response: __widl_instanceof_Response,
                __widl_f_ok_Response: __widl_f_ok_Response,
                __widl_f_headers_Response: __widl_f_headers_Response,
                __widl_f_array_buffer_Response: __widl_f_array_buffer_Response,
                __widl_f_json_Response: __widl_f_json_Response,
                __widl_instanceof_Window: __widl_instanceof_Window,
                __widl_f_fetch_with_request_Window: __widl_f_fetch_with_request_Window,
                __wbg_instanceof_ArrayBuffer_4c1748a7b3cc029e: __wbg_instanceof_ArrayBuffer_4c1748a7b3cc029e,
                __wbg_new_1476c5ece1db5a44: __wbg_new_1476c5ece1db5a44,
                __wbg_newnoargs_a6ad1b52f5989ea9: __wbg_newnoargs_a6ad1b52f5989ea9,
                __wbg_call_720151a19a4c6808: __wbg_call_720151a19a4c6808,
                __wbg_call_7aced47e67a8c62d: __wbg_call_7aced47e67a8c62d,
                __wbg_new_0b9640534b8a1f8a: __wbg_new_0b9640534b8a1f8a,
                __wbg_set_f45b1a9b8c0a9789: __wbg_set_f45b1a9b8c0a9789,
                __wbg_new_d90640b4228ff695: __wbg_new_d90640b4228ff695,
                __wbg_length_cece07c643f59431: __wbg_length_cece07c643f59431,
                __wbg_set_17d4223f7634d1e7: __wbg_set_17d4223f7634d1e7,
                __wbg_new_bdd94b8735e4f66d: __wbg_new_bdd94b8735e4f66d,
                __wbg_resolve_b2d9398056dbfe64: __wbg_resolve_b2d9398056dbfe64,
                __wbg_then_c75e723ffb976395: __wbg_then_c75e723ffb976395,
                __wbg_then_045256cb8c6a8ceb: __wbg_then_045256cb8c6a8ceb,
                __wbg_buffer_0346d756c794d630: __wbg_buffer_0346d756c794d630,
                __wbg_datasetattributes_new: __wbg_datasetattributes_new,
                DatasetAttributes: DatasetAttributes,
                __wbg_vecdatablockfloat64_new: __wbg_vecdatablockfloat64_new,
                VecDataBlockFLOAT64: VecDataBlockFLOAT64,
                __wbg_n5httpfetch_new: __wbg_n5httpfetch_new,
                N5HTTPFetch: N5HTTPFetch,
                __wbg_vecdatablockuint64_new: __wbg_vecdatablockuint64_new,
                VecDataBlockUINT64: VecDataBlockUINT64,
                __wbg_vecdatablockuint8_new: __wbg_vecdatablockuint8_new,
                VecDataBlockUINT8: VecDataBlockUINT8,
                __wbg_vecdatablockuint32_new: __wbg_vecdatablockuint32_new,
                VecDataBlockUINT32: VecDataBlockUINT32,
                __wbg_vecdatablockint64_new: __wbg_vecdatablockint64_new,
                VecDataBlockINT64: VecDataBlockINT64,
                __wbg_vecdatablockuint16_new: __wbg_vecdatablockuint16_new,
                VecDataBlockUINT16: VecDataBlockUINT16,
                __wbg_vecdatablockfloat32_new: __wbg_vecdatablockfloat32_new,
                VecDataBlockFLOAT32: VecDataBlockFLOAT32,
                __wbg_vecdatablockint8_new: __wbg_vecdatablockint8_new,
                VecDataBlockINT8: VecDataBlockINT8,
                __wbg_version_new: __wbg_version_new,
                Version: Version,
                __wbg_vecdatablockint32_new: __wbg_vecdatablockint32_new,
                VecDataBlockINT32: VecDataBlockINT32,
                __wbg_vecdatablockint16_new: __wbg_vecdatablockint16_new,
                VecDataBlockINT16: VecDataBlockINT16,
                __wbindgen_object_clone_ref: __wbindgen_object_clone_ref,
                __wbindgen_object_drop_ref: __wbindgen_object_drop_ref,
                __wbindgen_string_new: __wbindgen_string_new,
                __wbindgen_number_get: __wbindgen_number_get,
                __wbindgen_is_null: __wbindgen_is_null,
                __wbindgen_is_undefined: __wbindgen_is_undefined,
                __wbindgen_boolean_get: __wbindgen_boolean_get,
                __wbindgen_is_symbol: __wbindgen_is_symbol,
                __wbindgen_string_get: __wbindgen_string_get,
                __wbindgen_cb_drop: __wbindgen_cb_drop,
                __wbindgen_json_parse: __wbindgen_json_parse,
                __wbindgen_json_serialize: __wbindgen_json_serialize,
                __wbindgen_memory: __wbindgen_memory,
                __wbindgen_closure_wrapper65: __wbindgen_closure_wrapper65,
                __wbindgen_throw: __wbindgen_throw,
            },
    __wbindgen_placeholder__: {
        __widl_f_get_Headers: function() { },
        __widl_f_new_with_str_and_init_Request: function() { },
        __widl_instanceof_Response: function() { },
        __widl_f_ok_Response: function() { },
        __widl_f_headers_Response: function() { },
        __widl_f_array_buffer_Response: function() { },
        __widl_f_json_Response: function() { },
        __widl_instanceof_Window: function() { },
        __widl_f_fetch_with_request_Window: function() { },
        __wbg_instanceof_ArrayBuffer_4c1748a7b3cc029e: function() { },
        __wbg_new_1476c5ece1db5a44: function() { },
        __wbg_newnoargs_a6ad1b52f5989ea9: function() { },
        __wbg_call_720151a19a4c6808: function() { },
        __wbg_call_7aced47e67a8c62d: function() { },
        __wbg_new_0b9640534b8a1f8a: function() { },
        __wbg_set_f45b1a9b8c0a9789: function() { },
        __wbg_new_d90640b4228ff695: function() { },
        __wbg_length_cece07c643f59431: function() { },
        __wbg_set_17d4223f7634d1e7: function() { },
        __wbg_new_bdd94b8735e4f66d: function() { },
        __wbg_resolve_b2d9398056dbfe64: function() { },
        __wbg_then_c75e723ffb976395: function() { },
        __wbg_then_045256cb8c6a8ceb: function() { },
        __wbg_buffer_0346d756c794d630: function() { },
        __wbg_datasetattributes_new: function() { },
        DatasetAttributes: {},
        __wbg_vecdatablockfloat64_new: function() { },
        VecDataBlockFLOAT64: {},
        __wbg_n5httpfetch_new: function() { },
        N5HTTPFetch: {},
        __wbg_vecdatablockuint64_new: function() { },
        VecDataBlockUINT64: {},
        __wbg_vecdatablockuint8_new: function() { },
        VecDataBlockUINT8: {},
        __wbg_vecdatablockuint32_new: function() { },
        VecDataBlockUINT32: {},
        __wbg_vecdatablockint64_new: function() { },
        VecDataBlockINT64: {},
        __wbg_vecdatablockuint16_new: function() { },
        VecDataBlockUINT16: {},
        __wbg_vecdatablockfloat32_new: function() { },
        VecDataBlockFLOAT32: {},
        __wbg_vecdatablockint8_new: function() { },
        VecDataBlockINT8: {},
        __wbg_version_new: function() { },
        Version: {},
        __wbg_vecdatablockint32_new: function() { },
        VecDataBlockINT32: {},
        __wbg_vecdatablockint16_new: function() { },
        VecDataBlockINT16: {},
        __wbindgen_object_clone_ref: function() { },
        __wbindgen_object_drop_ref: function() { },
        __wbindgen_string_new: function() { },
        __wbindgen_number_get: function() { },
        __wbindgen_is_null: function() { },
        __wbindgen_is_undefined: function() { },
        __wbindgen_boolean_get: function() { },
        __wbindgen_is_symbol: function() { },
        __wbindgen_string_get: function() { },
        __wbindgen_cb_drop: function() { },
        __wbindgen_json_parse: function() { },
        __wbindgen_json_serialize: function() { },
        __wbindgen_memory: function() { },
        __wbindgen_closure_wrapper65: function() { },
        __wbindgen_throw: function() { },
    },
};
