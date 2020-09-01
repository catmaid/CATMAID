let wasm_bindgen;
(function() {
    const __exports = {};
    let wasm;

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

    const heap = new Array(32).fill(undefined);

    heap.push(undefined, null, true, false);

    let heap_next = heap.length;

    function addHeapObject(obj) {
        if (heap_next === heap.length) heap.push(heap.length + 1);
        const idx = heap_next;
        heap_next = heap[idx];

        if (typeof(heap_next) !== 'number') throw new Error('corrupt heap');

        heap[idx] = obj;
        return idx;
    }

function getObject(idx) { return heap[idx]; }

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

    if (typeof(arg) !== 'string') throw new Error('expected a string argument');

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
        if (ret.read !== arg.length) throw new Error('failed to pass whole string');
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

function _assertBoolean(n) {
    if (typeof(n) !== 'boolean') {
        throw new Error('expected a boolean argument');
    }
}

function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error('expected a number argument');
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

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);

            } else {
                state.a = a;
            }
        }
    };
    real.original = state;

    return real;
}

function logError(f) {
    return function () {
        try {
            return f.apply(this, arguments);

        } catch (e) {
            let error = (function () {
                try {
                    return e instanceof Error ? `${e.message}\n\nStack:\n${e.stack}` : e.toString();
                } catch(_) {
                    return "<failed to stringify thrown value>";
                }
            }());
            console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
            throw e;
        }
    };
}
function __wbg_adapter_24(arg0, arg1, arg2) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h05799ff7d5ff6804(arg0, arg1, addHeapObject(arg2));
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

function getArrayI32FromWasm0(ptr, len) {
    return getInt32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

let stack_pointer = 32;

function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error('out of js stack');
    heap[--stack_pointer] = obj;
    return stack_pointer;
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

function handleError(f) {
    return function () {
        try {
            return f.apply(this, arguments);

        } catch (e) {
            wasm.__wbindgen_exn_store(addHeapObject(e));
        }
    };
}

function isLikeNone(x) {
    return x === undefined || x === null;
}
function __wbg_adapter_173(arg0, arg1, arg2, arg3) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.wasm_bindgen__convert__closures__invoke2_mut__hc658c5341ee0f4ec(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

/**
*/
class DatasetAttributes {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.datasetattributes_get_dimensions(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint32Array}
    */
    get_block_size() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.datasetattributes_get_block_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int32Array}
    */
    get_voxel_offset() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.datasetattributes_get_voxel_offset(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {string}
    */
    get_data_type() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.datasetattributes_get_data_type(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_export_4.value += 16;
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    get_compression() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.datasetattributes_get_compression(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_export_4.value += 16;
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {number}
    */
    get_ndim() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.datasetattributes_get_ndim(this.ptr);
        return ret >>> 0;
    }
    /**
    * Get the total number of elements possible given the dimensions.
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.datasetattributes_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * Get the total number of elements possible in a block.
    * @returns {number}
    */
    get_block_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.datasetattributes_get_block_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {any}
    */
    to_json() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.datasetattributes_to_json(this.ptr);
        return takeObject(ret);
    }
    /**
    * @param {any} js
    * @returns {DatasetAttributes}
    */
    static from_json(js) {
        try {
            var ret = wasm.datasetattributes_from_json(addBorrowedObject(js));
            return DatasetAttributes.__wrap(ret);
        } finally {
            heap[stack_pointer++] = undefined;
        }
    }
}
__exports.DatasetAttributes = DatasetAttributes;
/**
*/
class NgPreHTTPFetch {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        const obj = Object.create(NgPreHTTPFetch.prototype);
        obj.ptr = ptr;

        return obj;
    }

    free() {
        const ptr = this.ptr;
        this.ptr = 0;

        wasm.__wbg_ngprehttpfetch_free(ptr);
    }
    /**
    * @param {string} base_path
    * @returns {Promise<any>}
    */
    static open(base_path) {
        var ptr0 = passStringToWasm0(base_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_open(ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @returns {Promise<any>}
    */
    get_version() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.ngprehttpfetch_get_version(this.ptr);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {Promise<any>}
    */
    get_dataset_attributes(path_name) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_get_dataset_attributes(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {Promise<any>}
    */
    exists(path_name) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_exists(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {Promise<any>}
    */
    dataset_exists(path_name) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_dataset_exists(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {Promise<any>}
    */
    read_block(path_name, data_attrs, grid_position) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        if (data_attrs.ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_read_block(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @returns {Promise<any>}
    */
    list_attributes(path_name) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_list_attributes(this.ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {Promise<any>}
    */
    block_etag(path_name, data_attrs, grid_position) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        if (data_attrs.ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_block_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigUint64Array} grid_position
    * @returns {Promise<any>}
    */
    read_block_with_etag(path_name, data_attrs, grid_position) {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        _assertClass(data_attrs, DatasetAttributes);
        if (data_attrs.ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        var ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        var ret = wasm.ngprehttpfetch_read_block_with_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr1, len1);
        return takeObject(ret);
    }
}
__exports.NgPreHTTPFetch = NgPreHTTPFetch;
/**
*/
class VecDataBlockFLOAT32 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat32_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat32_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Float32Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat32_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Float32Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockfloat32_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockfloat32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat32_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockFLOAT32 = VecDataBlockFLOAT32;
/**
*/
class VecDataBlockFLOAT64 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat64_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat64_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Float64Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat64_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Float64Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockfloat64_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockfloat64_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockfloat64_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockFLOAT64 = VecDataBlockFLOAT64;
/**
*/
class VecDataBlockINT16 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint16_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint16_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int16Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint16_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI16FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 2);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int16Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockint16_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI16FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 2);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockint16_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint16_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockINT16 = VecDataBlockINT16;
/**
*/
class VecDataBlockINT32 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint32_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint32_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int32Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint32_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int32Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockint32_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockint32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint32_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockINT32 = VecDataBlockINT32;
/**
*/
class VecDataBlockINT64 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint64_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint64_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigInt64Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint64_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigInt64Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockint64_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockint64_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint64_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockINT64 = VecDataBlockINT64;
/**
*/
class VecDataBlockINT8 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint8_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint8_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int8Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint8_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Int8Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockint8_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayI8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockint8_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockint8_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockINT8 = VecDataBlockINT8;
/**
*/
class VecDataBlockUINT16 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint16_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint16_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint16Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint16_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU16FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 2);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint16Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockuint16_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU16FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 2);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockuint16_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint16_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockUINT16 = VecDataBlockUINT16;
/**
*/
class VecDataBlockUINT32 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint32_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint32_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint32Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint32_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint32Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockuint32_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockuint32_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint32_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockUINT32 = VecDataBlockUINT32;
/**
*/
class VecDataBlockUINT64 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint64_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint64_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint64_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockuint64_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockuint64_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint64_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockUINT64 = VecDataBlockUINT64;
/**
*/
class VecDataBlockUINT8 {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint8_get_size(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {BigUint64Array}
    */
    get_grid_position() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint8_get_grid_position(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 8);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint8Array}
    */
    get_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint8_get_data(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {Uint8Array}
    */
    into_data() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            var ptr = this.ptr;
            this.ptr = 0;
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(ptr);
            wasm.vecdatablockuint8_into_data(retptr, ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 1);
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
    /**
    * @returns {number}
    */
    get_num_elements() {
        if (this.ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.ptr);
        var ret = wasm.vecdatablockuint8_get_num_elements(this.ptr);
        return ret >>> 0;
    }
    /**
    * @returns {string | undefined}
    */
    get_etag() {
        try {
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.vecdatablockuint8_get_etag(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            let v0;
            if (r0 !== 0) {
                v0 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1);
            }
            return v0;
        } finally {
            wasm.__wbindgen_export_4.value += 16;
        }
    }
}
__exports.VecDataBlockUINT8 = VecDataBlockUINT8;
/**
*/
class Version {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

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
            if (this.ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_export_4.value - 16;
            wasm.__wbindgen_export_4.value = retptr;
            _assertNum(this.ptr);
            wasm.version_to_string(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_export_4.value += 16;
            wasm.__wbindgen_free(r0, r1);
        }
    }
}
__exports.Version = Version;

async function load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {

        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

async function init(input) {
    if (typeof input === 'undefined') {
        let src;
        if (typeof document === 'undefined') {
            src = location.href;
        } else {
            src = document.currentScript.src;
        }
        input = src.replace(/\.js$/, '_bg.wasm');
    }
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        var ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_ngprehttpfetch_new = logError(function(arg0) {
        var ret = NgPreHTTPFetch.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_version_new = logError(function(arg0) {
        var ret = Version.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_datasetattributes_new = logError(function(arg0) {
        var ret = DatasetAttributes.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockuint8_new = logError(function(arg0) {
        var ret = VecDataBlockUINT8.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockuint16_new = logError(function(arg0) {
        var ret = VecDataBlockUINT16.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockuint32_new = logError(function(arg0) {
        var ret = VecDataBlockUINT32.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockuint64_new = logError(function(arg0) {
        var ret = VecDataBlockUINT64.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockint8_new = logError(function(arg0) {
        var ret = VecDataBlockINT8.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockint16_new = logError(function(arg0) {
        var ret = VecDataBlockINT16.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockint32_new = logError(function(arg0) {
        var ret = VecDataBlockINT32.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockint64_new = logError(function(arg0) {
        var ret = VecDataBlockINT64.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockfloat32_new = logError(function(arg0) {
        var ret = VecDataBlockFLOAT32.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_vecdatablockfloat64_new = logError(function(arg0) {
        var ret = VecDataBlockFLOAT64.__wrap(arg0);
        return addHeapObject(ret);
    });
    imports.wbg.__wbindgen_json_parse = function(arg0, arg1) {
        var ret = JSON.parse(getStringFromWasm0(arg0, arg1));
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
    imports.wbg.__wbg_error_4bb6c2a97407129a = logError(function(arg0, arg1) {
        try {
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(arg0, arg1);
        }
    });
    imports.wbg.__wbg_new_59cb74e423758ede = logError(function() {
        var ret = new Error();
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_stack_558ba5917b466edd = logError(function(arg0, arg1) {
        var ret = getObject(arg1).stack;
        var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len0;
        getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    });
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbg_instanceof_Window_49f532f06a9786ee = logError(function(arg0) {
        var ret = getObject(arg0) instanceof Window;
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbg_fetch_f532e04b8fe49aa0 = logError(function(arg0, arg1) {
        var ret = getObject(arg0).fetch(getObject(arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        var ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_instanceof_WorkerGlobalScope_fa8ee4d4a987fc47 = logError(function(arg0) {
        var ret = getObject(arg0) instanceof WorkerGlobalScope;
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbg_fetch_f26b740013c0eb32 = logError(function(arg0, arg1) {
        var ret = getObject(arg0).fetch(getObject(arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_instanceof_Response_f52c65c389890639 = logError(function(arg0) {
        var ret = getObject(arg0) instanceof Response;
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbg_ok_c20643e0a45dc5a0 = logError(function(arg0) {
        var ret = getObject(arg0).ok;
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbg_headers_6fafb2c7669a8ac5 = logError(function(arg0) {
        var ret = getObject(arg0).headers;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_arrayBuffer_0ba17dfaad804b6f = handleError(function(arg0) {
        var ret = getObject(arg0).arrayBuffer();
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_json_012a7a84489a5ec5 = handleError(function(arg0) {
        var ret = getObject(arg0).json();
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_newwithstrandinit_11debb554792e043 = handleError(function(arg0, arg1, arg2) {
        var ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_get_f7c7868f719f98ec = handleError(function(arg0, arg1, arg2, arg3) {
        var ret = getObject(arg1).get(getStringFromWasm0(arg2, arg3));
        var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        getInt32Memory0()[arg0 / 4 + 1] = len0;
        getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    });
    imports.wbg.__wbindgen_cb_drop = function(arg0) {
        const obj = takeObject(arg0).original;
        if (obj.cnt-- == 1) {
            obj.a = 0;
            return true;
        }
        var ret = false;
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_eval_394e553abe29dbfd = handleError(function(arg0, arg1) {
        var ret = eval(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_instanceof_ArrayBuffer_3a0fa134e6809d57 = logError(function(arg0) {
        var ret = getObject(arg0) instanceof ArrayBuffer;
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbg_new_94a7dfa9529ec6e8 = logError(function(arg0, arg1) {
        var ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_newnoargs_7c6bd521992b4022 = logError(function(arg0, arg1) {
        var ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_call_951bd0c6d815d6f1 = handleError(function(arg0, arg1) {
        var ret = getObject(arg0).call(getObject(arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_call_bf745b1758bb6693 = handleError(function(arg0, arg1, arg2) {
        var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_new_ba07d0daa0e4677e = logError(function() {
        var ret = new Object();
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_new_bb4e44ef089e45b4 = logError(function(arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return __wbg_adapter_173(a, state0.b, arg0, arg1);
                } finally {
                    state0.a = a;
                }
            };
            var ret = new Promise(cb0);
            return addHeapObject(ret);
        } finally {
            state0.a = state0.b = 0;
        }
    });
    imports.wbg.__wbg_resolve_6e61e640925a0db9 = logError(function(arg0) {
        var ret = Promise.resolve(getObject(arg0));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_then_dd3785597974798a = logError(function(arg0, arg1) {
        var ret = getObject(arg0).then(getObject(arg1));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_then_0f957e0f4c3e537a = logError(function(arg0, arg1, arg2) {
        var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_globalThis_513fb247e8e4e6d2 = handleError(function() {
        var ret = globalThis.globalThis;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_self_6baf3a3aa7b63415 = handleError(function() {
        var ret = self.self;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_window_63fc4027b66c265b = handleError(function() {
        var ret = window.window;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_global_b87245cd886d7113 = handleError(function() {
        var ret = global.global;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_new_c6c0228e6d22a2f9 = logError(function(arg0) {
        var ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_length_c645e7c02233b440 = logError(function(arg0) {
        var ret = getObject(arg0).length;
        _assertNum(ret);
        return ret;
    });
    imports.wbg.__wbg_set_b91afac9fd216d99 = logError(function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    });
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        var ret = getObject(arg0) === undefined;
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_buffer_3f12a1c608c6d04e = logError(function(arg0) {
        var ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    });
    imports.wbg.__wbg_set_9bdd413385146137 = handleError(function(arg0, arg1, arg2) {
        var ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
        _assertBoolean(ret);
        return ret;
    });
    imports.wbg.__wbindgen_boolean_get = function(arg0) {
        const v = getObject(arg0);
        var ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
        _assertNum(ret);
        return ret;
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
    imports.wbg.__wbindgen_memory = function() {
        var ret = wasm.memory;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_closure_wrapper6309 = logError(function(arg0, arg1, arg2) {
        var ret = makeMutClosure(arg0, arg1, 231, __wbg_adapter_24);
        return addHeapObject(ret);
    });

    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }

    const { instance, module } = await load(await input, imports);

    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;

    return wasm;
}

wasm_bindgen = Object.assign(init, __exports);

})();
self.ngpre_wasm = wasm_bindgen;
