
let wasm;

const heap = new Array(32);

heap.fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

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

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachegetUint8Memory0 = null;
function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let cachedTextEncoder = new TextEncoder('utf-8');

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length);
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len);

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3);
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachegetInt32Memory0 = null;
function getInt32Memory0() {
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachegetInt32Memory0;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}
function __wbg_adapter_22(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures__invoke1_mut__h8a583b1c3a09752e(arg0, arg1, addHeapObject(arg2));
}

let cachegetUint32Memory0 = null;
function getUint32Memory0() {
    if (cachegetUint32Memory0 === null || cachegetUint32Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachegetUint32Memory0;
}

function getArrayU32FromWasm0(ptr, len) {
    return getUint32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachegetUint64Memory0 = null;
function getUint64Memory0() {
    if (cachegetUint64Memory0 === null || cachegetUint64Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint64Memory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachegetUint64Memory0;
}

function getArrayU64FromWasm0(ptr, len) {
    return getUint64Memory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachegetUint16Memory0 = null;
function getUint16Memory0() {
    if (cachegetUint16Memory0 === null || cachegetUint16Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint16Memory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachegetUint16Memory0;
}

function getArrayU16FromWasm0(ptr, len) {
    return getUint16Memory0().subarray(ptr / 2, ptr / 2 + len);
}

let cachegetInt8Memory0 = null;
function getInt8Memory0() {
    if (cachegetInt8Memory0 === null || cachegetInt8Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt8Memory0 = new Int8Array(wasm.memory.buffer);
    }
    return cachegetInt8Memory0;
}

function getArrayI8FromWasm0(ptr, len) {
    return getInt8Memory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachegetInt16Memory0 = null;
function getInt16Memory0() {
    if (cachegetInt16Memory0 === null || cachegetInt16Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt16Memory0 = new Int16Array(wasm.memory.buffer);
    }
    return cachegetInt16Memory0;
}

function getArrayI16FromWasm0(ptr, len) {
    return getInt16Memory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    return getInt32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachegetInt64Memory0 = null;
function getInt64Memory0() {
    if (cachegetInt64Memory0 === null || cachegetInt64Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt64Memory0 = new BigInt64Array(wasm.memory.buffer);
    }
    return cachegetInt64Memory0;
}

function getArrayI64FromWasm0(ptr, len) {
    return getInt64Memory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachegetFloat32Memory0 = null;
function getFloat32Memory0() {
    if (cachegetFloat32Memory0 === null || cachegetFloat32Memory0.buffer !== wasm.memory.buffer) {
        cachegetFloat32Memory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachegetFloat32Memory0;
}

function getArrayF32FromWasm0(ptr, len) {
    return getFloat32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachegetFloat64Memory0 = null;
function getFloat64Memory0() {
    if (cachegetFloat64Memory0 === null || cachegetFloat64Memory0.buffer !== wasm.memory.buffer) {
        cachegetFloat64Memory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachegetFloat64Memory0;
}

function getArrayF64FromWasm0(ptr, len) {
    return getFloat64Memory0().subarray(ptr / 8, ptr / 8 + len);
}

function handleError(e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
}
function __wbg_adapter_115(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures__invoke2_mut__h0903106463517c12(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}

function passArray64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8);
    getUint64Memory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function isLikeNone(x) {
    return x === undefined || x === null;
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

        wasm.__wbg_datasetattributes_free(ptr);
    }
    /**
    * @returns {BigUint64Array}
    */
    get_dimensions() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Uint32Array}
    */
    get_block_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {string}
    */
    get_data_type() {
        try {
            wasm.datasetattributes_get_data_type(8, this.ptr);
            var r0 = getInt32Memory0()[8 / 4 + 0];
            var r1 = getInt32Memory0()[8 / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    get_compression() {
        try {
            wasm.datasetattributes_get_compression(8, this.ptr);
            var r0 = getInt32Memory0()[8 / 4 + 0];
            var r1 = getInt32Memory0()[8 / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {number}
    */
    get_ndim() {
        var ret = wasm.datasetattributes_get_ndim(this.ptr);
        return ret >>> 0;
    }
    /**
    * Get the total number of elements possible given the dimensions.
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.datasetattributes_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * Get the total number of elements possible in a block.
    * @returns {number}
    */
    get_block_num_elements() {
        var ret = wasm.datasetattributes_get_block_num_elements(this.ptr);
        return ret >>> 0;
    }
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

        wasm.__wbg_n5httpfetch_free(ptr);
    }
    /**
    * @param {string} base_path
    * @returns {any}
    */
    static open(base_path) {
        var ptr0 = passStringToWasm0(base_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_open(ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @returns {any}
    */
    get_version() {
        var ret = wasm.n5httpfetch_get_version(this.ptr);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    get_dataset_attributes(path_name) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_get_dataset_attributes(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    exists(path_name) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_exists(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    dataset_exists(path_name) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_dataset_exists(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {any}
    */
    read_block(path_name, data_attrs, grid_position) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_read_block(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    list_attributes(path_name) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_list_attributes(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {any}
    */
    block_etag(path_name, data_attrs, grid_position) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_block_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {any}
    */
    read_block_with_etag(path_name, data_attrs, grid_position) {
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.n5httpfetch_read_block_with_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
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

        wasm.__wbg_vecdatablockfloat32_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Float32Array}
    */
    get_data() {
        wasm.vecdatablockfloat32_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {Float32Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockfloat32_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockfloat64_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Float64Array}
    */
    get_data() {
        wasm.vecdatablockfloat64_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Float64Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockfloat64_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockint16_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Int16Array}
    */
    get_data() {
        wasm.vecdatablockint16_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI16FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 2);
        return v0;
    }
    /**
    * @returns {Int16Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint16_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI16FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 2);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockint32_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Int32Array}
    */
    get_data() {
        wasm.vecdatablockint32_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {Int32Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint32_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockint64_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {BigInt64Array}
    */
    get_data() {
        wasm.vecdatablockfloat64_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {BigInt64Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockfloat64_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockint8_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Int8Array}
    */
    get_data() {
        wasm.vecdatablockint8_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v0;
    }
    /**
    * @returns {Int8Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint8_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayI8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockuint16_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Uint16Array}
    */
    get_data() {
        wasm.vecdatablockint16_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU16FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 2);
        return v0;
    }
    /**
    * @returns {Uint16Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint16_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU16FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 2);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockuint32_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Uint32Array}
    */
    get_data() {
        wasm.vecdatablockuint32_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {Uint32Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint32_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockuint64_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_data() {
        wasm.vecdatablockuint64_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockfloat64_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_vecdatablockuint8_free(ptr);
    }
    /**
    * @returns {Uint32Array}
    */
    get_size() {
        wasm.datasetattributes_get_block_size(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 4);
        return v0;
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        wasm.datasetattributes_get_dimensions(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 8);
        return v0;
    }
    /**
    * @returns {Uint8Array}
    */
    get_data() {
        wasm.vecdatablockuint8_get_data(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v0;
    }
    /**
    * @returns {Uint8Array}
    */
    into_data() {
        var ptr = this.ptr;
        this.ptr = 0;
        wasm.vecdatablockint8_into_data(8, ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        var v0 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v0;
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string}
    */
    get_etag() {
        wasm.vecdatablockfloat32_get_etag(8, this.ptr);
        var r0 = getInt32Memory0()[8 / 4 + 0];
        var r1 = getInt32Memory0()[8 / 4 + 1];
        let v0;
        if (r0 !== 0) {
            v0 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
        }
        return v0;
    }
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

        wasm.__wbg_version_free(ptr);
    }
    /**
    * @returns {string}
    */
    to_string() {
        try {
            wasm.version_to_string(8, this.ptr);
            var r0 = getInt32Memory0()[8 / 4 + 0];
            var r1 = getInt32Memory0()[8 / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_free(r0, r1);
        }
    }
}

function init(module) {
    if (typeof module === 'undefined') {
        module = import.meta.url.replace(/\.js$/, '_bg.wasm');
    }
    let result;
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbg_length_60a719ff58c1bd42 = function(arg0) {
        var ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        var ret = wasm.memory;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_buffer_89a8560ab6a3d9c6 = function(arg0) {
        var ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_bd2e1d010adb8a1a = function(arg0) {
        var ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_05a3afda446930ee = function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__widl_instanceof_Response = function(arg0) {
        var ret = getObject(arg0) instanceof Response;
        return ret;
    };
    imports.wbg.__widl_f_ok_Response = function(arg0) {
        var ret = getObject(arg0).ok;
        return ret;
    };
    imports.wbg.__widl_f_headers_Response = function(arg0) {
        var ret = getObject(arg0).headers;
        return addHeapObject(ret);
    };
    imports.wbg.__widl_f_get_Headers = function(arg0, arg1, arg2, arg3) {
        try {
            var ret = getObject(arg1).get(getStringFromWasm0(arg2, arg3));
            var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len0 = WASM_VECTOR_LEN;
            getInt32Memory0()[arg0 / 4 + 1] = len0;
            getInt32Memory0()[arg0 / 4 + 0] = ptr0;
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__widl_f_array_buffer_Response = function(arg0) {
        try {
            var ret = getObject(arg0).arrayBuffer();
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbg_instanceof_ArrayBuffer_3df027e750cad6cd = function(arg0) {
        var ret = getObject(arg0) instanceof ArrayBuffer;
        return ret;
    };
    imports.wbg.__wbg_vecdatablockfloat32_new = function(arg0) {
        var ret = VecDataBlockFLOAT32.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_b43fc449db38d3bd = function(arg0, arg1) {
        var ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockuint32_new = function(arg0) {
        var ret = VecDataBlockUINT32.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockint16_new = function(arg0) {
        var ret = VecDataBlockINT16.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_datasetattributes_new = function(arg0) {
        var ret = DatasetAttributes.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockint32_new = function(arg0) {
        var ret = VecDataBlockINT32.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        var ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockuint16_new = function(arg0) {
        var ret = VecDataBlockUINT16.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_json_serialize = function(arg0, arg1) {
        const obj = getObject(arg1);
        var ret = JSON.stringify(obj === undefined ? null : obj);
        var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len0;
        getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };
    imports.wbg.__wbg_vecdatablockint8_new = function(arg0) {
        var ret = VecDataBlockINT8.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockint64_new = function(arg0) {
        var ret = VecDataBlockINT64.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockuint64_new = function(arg0) {
        var ret = VecDataBlockUINT64.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_n5httpfetch_new = function(arg0) {
        var ret = N5HTTPFetch.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockuint8_new = function(arg0) {
        var ret = VecDataBlockUINT8.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_vecdatablockfloat64_new = function(arg0) {
        var ret = VecDataBlockFLOAT64.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_version_new = function(arg0) {
        var ret = Version.__wrap(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_json_parse = function(arg0, arg1) {
        var ret = JSON.parse(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_8b3eec454ca71e88 = function(arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return __wbg_adapter_115(a, state0.b, arg0, arg1);
                } finally {
                    state0.a = a;
                }
            };
            var ret = new Promise(cb0);
            return addHeapObject(ret);
        } finally {
            state0.a = state0.b = 0;
        }
    };
    imports.wbg.__wbg_new_66e20d51c3e33b63 = function() {
        var ret = new Object();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_c3a2ba27703a6186 = function(arg0, arg1, arg2) {
        try {
            var ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
            return ret;
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__widl_f_new_with_str_and_init_Request = function(arg0, arg1, arg2) {
        try {
            var ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__widl_f_fetch_with_request_Window = function(arg0, arg1) {
        var ret = getObject(arg0).fetch(getObject(arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__widl_f_json_Response = function(arg0) {
        try {
            var ret = getObject(arg0).json();
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
        var ret = debugString(getObject(arg1));
        var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len0;
        getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_call_6c4ea719458624eb = function(arg0, arg1, arg2) {
        try {
            var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbindgen_cb_drop = function(arg0) {
        const obj = takeObject(arg0).original;
        if (obj.cnt-- == 1) {
            obj.a = 0;
            return true;
        }
        var ret = false;
        return ret;
    };
    imports.wbg.__wbg_then_5a9068d7b674caf9 = function(arg0, arg1, arg2) {
        var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_resolve_4e9c46f7e8321315 = function(arg0) {
        var ret = Promise.resolve(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_then_79de0b6809569306 = function(arg0, arg1) {
        var ret = getObject(arg0).then(getObject(arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_globalThis_1c2aa6db3ecb073e = function() {
        try {
            var ret = globalThis.globalThis;
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbg_self_e5cdcdef79894248 = function() {
        try {
            var ret = self.self;
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbg_window_44ec8ac43884a4cf = function() {
        try {
            var ret = window.window;
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbg_global_c9abcb94a14733fe = function() {
        try {
            var ret = global.global;
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        var ret = getObject(arg0) === undefined;
        return ret;
    };
    imports.wbg.__wbg_newnoargs_a9cd98b36c38f53e = function(arg0, arg1) {
        var ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_call_222be890f6f564bb = function(arg0, arg1) {
        try {
            var ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        } catch (e) {
            handleError(e)
        }
    };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        var ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__widl_instanceof_Window = function(arg0) {
        var ret = getObject(arg0) instanceof Window;
        return ret;
    };
    imports.wbg.__wbindgen_closure_wrapper624 = function(arg0, arg1, arg2) {

        const state = { a: arg0, b: arg1, cnt: 1 };
        const real = (arg0) => {
            state.cnt++;
            const a = state.a;
            state.a = 0;
            try {
                return __wbg_adapter_22(a, state.b, arg0);
            } finally {
                if (--state.cnt === 0) wasm.__wbindgen_export_2.get(48)(a, state.b);
                else state.a = a;
            }
        }
        ;
        real.original = state;
        var ret = real;
        return addHeapObject(ret);
    };

    if ((typeof URL === 'function' && module instanceof URL) || typeof module === 'string' || (typeof Request === 'function' && module instanceof Request)) {

        const response = fetch(module);
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            result = WebAssembly.instantiateStreaming(response, imports)
            .catch(e => {
                return response
                .then(r => {
                    if (r.headers.get('Content-Type') != 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
                        return r.arrayBuffer();
                    } else {
                        throw e;
                    }
                })
                .then(bytes => WebAssembly.instantiate(bytes, imports));
            });
        } else {
            result = response
            .then(r => r.arrayBuffer())
            .then(bytes => WebAssembly.instantiate(bytes, imports));
        }
    } else {

        result = WebAssembly.instantiate(module, imports)
        .then(result => {
            if (result instanceof WebAssembly.Instance) {
                return { instance: result, module };
            } else {
                return result;
            }
        });
    }
    return result.then(({instance, module}) => {
        wasm = instance.exports;
        init.__wbindgen_wasm_module = module;

        return wasm;
    });
}

export default init;

