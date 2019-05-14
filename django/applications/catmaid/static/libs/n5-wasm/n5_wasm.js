
const __exports = {};
let wasm;

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

let cachegetUint32Memory = null;
function getUint32Memory() {
    if (cachegetUint32Memory === null || cachegetUint32Memory.buffer !== wasm.memory.buffer) {
        cachegetUint32Memory = new Uint32Array(wasm.memory.buffer);
    }
    return cachegetUint32Memory;
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

let cachegetUint8Memory = null;
function getUint8Memory() {
    if (cachegetUint8Memory === null || cachegetUint8Memory.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory;
}

function getArrayU8FromWasm(ptr, len) {
    return getUint8Memory().subarray(ptr / 1, ptr / 1 + len);
}

let cachedTextDecoder = new TextDecoder('utf-8');

function getStringFromWasm(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory().subarray(ptr, ptr + len));
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

const heap = new Array(32);

heap.fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let WASM_VECTOR_LEN = 0;

let cachedTextEncoder = new TextEncoder('utf-8');

let passStringToWasm;
if (typeof cachedTextEncoder.encodeInto === 'function') {
    passStringToWasm = function(arg) {

        let size = arg.length;
        let ptr = wasm.__wbindgen_malloc(size);
        let writeOffset = 0;
        while (true) {
            const view = getUint8Memory().subarray(ptr + writeOffset, ptr + size);
            const { read, written } = cachedTextEncoder.encodeInto(arg, view);
            writeOffset += written;
            if (read === arg.length) {
                break;
            }
            arg = arg.substring(read);
            ptr = wasm.__wbindgen_realloc(ptr, size, size += arg.length * 3);
        }
        WASM_VECTOR_LEN = writeOffset;
        return ptr;
    };
} else {
    passStringToWasm = function(arg) {

        const buf = cachedTextEncoder.encode(arg);
        const ptr = wasm.__wbindgen_malloc(buf.length);
        getUint8Memory().set(buf, ptr);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    };
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

function handleError(exnptr, e) {
    const view = getUint32Memory();
    view[exnptr / 4] = 1;
    view[exnptr / 4 + 1] = addHeapObject(e);
}

function __widl_f_get_Headers(ret, arg0, arg1, arg2, exnptr) {
    let varg1 = getStringFromWasm(arg1, arg2);
    try {
        const val = getObject(arg0).get(varg1);
        const retptr = isLikeNone(val) ? [0, 0] : passStringToWasm(val);
        const retlen = WASM_VECTOR_LEN;
        const mem = getUint32Memory();
        mem[ret / 4] = retptr;
        mem[ret / 4 + 1] = retlen;

    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__widl_f_get_Headers = __widl_f_get_Headers;

function __widl_f_new_with_str_and_init_Request(arg0, arg1, arg2, exnptr) {
    let varg0 = getStringFromWasm(arg0, arg1);
    try {
        return addHeapObject(new Request(varg0, getObject(arg2)));
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__widl_f_new_with_str_and_init_Request = __widl_f_new_with_str_and_init_Request;

function __widl_instanceof_Response(idx) { return getObject(idx) instanceof Response ? 1 : 0; }

__exports.__widl_instanceof_Response = __widl_instanceof_Response;

function __widl_f_ok_Response(arg0) {
    return getObject(arg0).ok;
}

__exports.__widl_f_ok_Response = __widl_f_ok_Response;

function __widl_f_headers_Response(arg0) {
    return addHeapObject(getObject(arg0).headers);
}

__exports.__widl_f_headers_Response = __widl_f_headers_Response;

function __widl_f_array_buffer_Response(arg0, exnptr) {
    try {
        return addHeapObject(getObject(arg0).arrayBuffer());
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__widl_f_array_buffer_Response = __widl_f_array_buffer_Response;

function __widl_f_json_Response(arg0, exnptr) {
    try {
        return addHeapObject(getObject(arg0).json());
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__widl_f_json_Response = __widl_f_json_Response;

function __widl_instanceof_Window(idx) { return getObject(idx) instanceof Window ? 1 : 0; }

__exports.__widl_instanceof_Window = __widl_instanceof_Window;

function __widl_f_fetch_with_request_Window(arg0, arg1) {
    return addHeapObject(getObject(arg0).fetch(getObject(arg1)));
}

__exports.__widl_f_fetch_with_request_Window = __widl_f_fetch_with_request_Window;

function __wbg_instanceof_ArrayBuffer_3d6b4293ffaf7aa6(idx) { return getObject(idx) instanceof ArrayBuffer ? 1 : 0; }

__exports.__wbg_instanceof_ArrayBuffer_3d6b4293ffaf7aa6 = __wbg_instanceof_ArrayBuffer_3d6b4293ffaf7aa6;

function __wbg_new_098793756709d10a(arg0, arg1) {
    let varg0 = getStringFromWasm(arg0, arg1);
    return addHeapObject(new Error(varg0));
}

__exports.__wbg_new_098793756709d10a = __wbg_new_098793756709d10a;

function __wbg_newnoargs_9fab447a311888a5(arg0, arg1) {
    let varg0 = getStringFromWasm(arg0, arg1);
    return addHeapObject(new Function(varg0));
}

__exports.__wbg_newnoargs_9fab447a311888a5 = __wbg_newnoargs_9fab447a311888a5;

function __wbg_call_001e26aeb2fdef67(arg0, arg1, exnptr) {
    try {
        return addHeapObject(getObject(arg0).call(getObject(arg1)));
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__wbg_call_001e26aeb2fdef67 = __wbg_call_001e26aeb2fdef67;

function __wbg_call_32cfc8705e333e03(arg0, arg1, arg2, exnptr) {
    try {
        return addHeapObject(getObject(arg0).call(getObject(arg1), getObject(arg2)));
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__wbg_call_32cfc8705e333e03 = __wbg_call_32cfc8705e333e03;

function __wbg_new_3c2b6ca34902aebb() {
    return addHeapObject(new Object());
}

__exports.__wbg_new_3c2b6ca34902aebb = __wbg_new_3c2b6ca34902aebb;

function __wbg_new_b2ae0eb8a50f5a8d(arg0, arg1) {
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

__exports.__wbg_new_b2ae0eb8a50f5a8d = __wbg_new_b2ae0eb8a50f5a8d;

function __wbg_resolve_13a0331c403143fa(arg0) {
    return addHeapObject(Promise.resolve(getObject(arg0)));
}

__exports.__wbg_resolve_13a0331c403143fa = __wbg_resolve_13a0331c403143fa;

function __wbg_then_19e0dd10f4df0a30(arg0, arg1) {
    return addHeapObject(getObject(arg0).then(getObject(arg1)));
}

__exports.__wbg_then_19e0dd10f4df0a30 = __wbg_then_19e0dd10f4df0a30;

function __wbg_then_b324e05c8e37044e(arg0, arg1, arg2) {
    return addHeapObject(getObject(arg0).then(getObject(arg1), getObject(arg2)));
}

__exports.__wbg_then_b324e05c8e37044e = __wbg_then_b324e05c8e37044e;

function __wbg_new_6b3ab5e2fe312112(arg0) {
    return addHeapObject(new Uint8Array(getObject(arg0)));
}

__exports.__wbg_new_6b3ab5e2fe312112 = __wbg_new_6b3ab5e2fe312112;

function __wbg_length_d64a6433b03c9a9b(arg0) {
    return getObject(arg0).length;
}

__exports.__wbg_length_d64a6433b03c9a9b = __wbg_length_d64a6433b03c9a9b;

function __wbg_set_cfded41e0819224d(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
}

__exports.__wbg_set_cfded41e0819224d = __wbg_set_cfded41e0819224d;

function __wbg_set_34c130f3bc2d6809(arg0, arg1, arg2, exnptr) {
    try {
        return Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
    } catch (e) {
        handleError(exnptr, e);
    }
}

__exports.__wbg_set_34c130f3bc2d6809 = __wbg_set_34c130f3bc2d6809;

function __wbg_buffer_85e60d809f6cd4e8(arg0) {
    return addHeapObject(getObject(arg0).buffer);
}

__exports.__wbg_buffer_85e60d809f6cd4e8 = __wbg_buffer_85e60d809f6cd4e8;

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

function __wbindgen_string_new(p, l) { return addHeapObject(getStringFromWasm(p, l)); }

__exports.__wbindgen_string_new = __wbindgen_string_new;

function __wbindgen_debug_string(i, len_ptr) {
    const debug_str =
    val => {
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
                debug += debug_str(val[0]);
            }
            for(let i = 1; i < length; i++) {
                debug += ', ' + debug_str(val[i]);
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
        return `${val.name}: ${val.message}
        ${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}
;
const toString = Object.prototype.toString;
const val = getObject(i);
const debug = debug_str(val);
const ptr = passStringToWasm(debug);
getUint32Memory()[len_ptr / 4] = WASM_VECTOR_LEN;
return ptr;
}

__exports.__wbindgen_debug_string = __wbindgen_debug_string;

function __wbindgen_cb_drop(i) {
    const obj = takeObject(i).original;
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return 1;
    }
    return 0;
}

__exports.__wbindgen_cb_drop = __wbindgen_cb_drop;

function __wbindgen_json_parse(ptr, len) { return addHeapObject(JSON.parse(getStringFromWasm(ptr, len))); }

__exports.__wbindgen_json_parse = __wbindgen_json_parse;

function __wbindgen_json_serialize(idx, ptrptr) {
    const ptr = passStringToWasm(JSON.stringify(getObject(idx)));
    getUint32Memory()[ptrptr / 4] = ptr;
    return WASM_VECTOR_LEN;
}

__exports.__wbindgen_json_serialize = __wbindgen_json_serialize;

function __wbindgen_memory() { return addHeapObject(wasm.memory); }

__exports.__wbindgen_memory = __wbindgen_memory;

function __wbindgen_throw(ptr, len) {
    throw new Error(getStringFromWasm(ptr, len));
}

__exports.__wbindgen_throw = __wbindgen_throw;

function __wbindgen_closure_wrapper143(a, b, _ignored) {
    const f = wasm.__wbg_function_table.get(8);
    const d = wasm.__wbg_function_table.get(9);
    const cb = function(arg0) {
        this.cnt++;
        let a = this.a;
        this.a = 0;
        try {
            return f(a, b, addHeapObject(arg0));

        } finally {
            if (--this.cnt === 0) d(a, b);
            else this.a = a;

        }

    };
    cb.a = a;
    cb.cnt = 1;
    let real = cb.bind(cb);
    real.original = cb;
    return addHeapObject(real);
}

__exports.__wbindgen_closure_wrapper143 = __wbindgen_closure_wrapper143;

function __wbg_datasetattributes_new(ptr) { return addHeapObject(DatasetAttributes.__wrap(ptr)); }

__exports.__wbg_datasetattributes_new = __wbg_datasetattributes_new;

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
        return wasm.datasetattributes_get_ndim(this.ptr) >>> 0;
    }
    /**
    * Get the total number of elements possible given the dimensions.
    * @returns {number}
    */
    get_num_elements() {
        return wasm.datasetattributes_get_num_elements(this.ptr) >>> 0;
    }
    /**
    * Get the total number of elements possible in a block.
    * @returns {number}
    */
    get_block_num_elements() {
        return wasm.datasetattributes_get_block_num_elements(this.ptr) >>> 0;
    }
}

__exports.DatasetAttributes = DatasetAttributes;

function __wbg_n5httpfetch_new(ptr) { return addHeapObject(N5HTTPFetch.__wrap(ptr)); }

__exports.__wbg_n5httpfetch_new = __wbg_n5httpfetch_new;

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
    * @param {string} base_path
    * @returns {any}
    */
    static open(base_path) {
        const ptr0 = passStringToWasm(base_path);
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
    * @param {string} path_name
    * @returns {any}
    */
    get_dataset_attributes(path_name) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_get_dataset_attributes(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    exists(path_name) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_exists(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    dataset_exists(path_name) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_dataset_exists(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigInt64Array} grid_position
    * @returns {any}
    */
    read_block(path_name, data_attrs, grid_position) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(grid_position);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_read_block(this.ptr, ptr0, len0, data_attrs.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @returns {any}
    */
    list_attributes(path_name) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_list_attributes(this.ptr, ptr0, len0));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigInt64Array} grid_position
    * @returns {any}
    */
    block_etag(path_name, data_attrs, grid_position) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(grid_position);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_block_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
    /**
    * @param {string} path_name
    * @param {DatasetAttributes} data_attrs
    * @param {BigInt64Array} grid_position
    * @returns {any}
    */
    read_block_with_etag(path_name, data_attrs, grid_position) {
        const ptr0 = passStringToWasm(path_name);
        const len0 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm(grid_position);
        const len2 = WASM_VECTOR_LEN;
        try {
            return takeObject(wasm.n5httpfetch_read_block_with_etag(this.ptr, ptr0, len0, data_attrs.ptr, ptr2, len2));

        } finally {
            wasm.__wbindgen_free(ptr0, len0 * 1);

        }

    }
}

__exports.N5HTTPFetch = N5HTTPFetch;

function __wbg_vecdatablockfloat32_new(ptr) { return addHeapObject(VecDataBlockFLOAT32.__wrap(ptr)); }

__exports.__wbg_vecdatablockfloat32_new = __wbg_vecdatablockfloat32_new;

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

__exports.VecDataBlockFLOAT32 = VecDataBlockFLOAT32;

function __wbg_vecdatablockfloat64_new(ptr) { return addHeapObject(VecDataBlockFLOAT64.__wrap(ptr)); }

__exports.__wbg_vecdatablockfloat64_new = __wbg_vecdatablockfloat64_new;

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

__exports.VecDataBlockFLOAT64 = VecDataBlockFLOAT64;

function __wbg_vecdatablockint16_new(ptr) { return addHeapObject(VecDataBlockINT16.__wrap(ptr)); }

__exports.__wbg_vecdatablockint16_new = __wbg_vecdatablockint16_new;

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

__exports.VecDataBlockINT16 = VecDataBlockINT16;

function __wbg_vecdatablockint32_new(ptr) { return addHeapObject(VecDataBlockINT32.__wrap(ptr)); }

__exports.__wbg_vecdatablockint32_new = __wbg_vecdatablockint32_new;

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

__exports.VecDataBlockINT32 = VecDataBlockINT32;

function __wbg_vecdatablockint64_new(ptr) { return addHeapObject(VecDataBlockINT64.__wrap(ptr)); }

__exports.__wbg_vecdatablockint64_new = __wbg_vecdatablockint64_new;

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

__exports.VecDataBlockINT64 = VecDataBlockINT64;

function __wbg_vecdatablockint8_new(ptr) { return addHeapObject(VecDataBlockINT8.__wrap(ptr)); }

__exports.__wbg_vecdatablockint8_new = __wbg_vecdatablockint8_new;

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

__exports.VecDataBlockINT8 = VecDataBlockINT8;

function __wbg_vecdatablockuint16_new(ptr) { return addHeapObject(VecDataBlockUINT16.__wrap(ptr)); }

__exports.__wbg_vecdatablockuint16_new = __wbg_vecdatablockuint16_new;

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

__exports.VecDataBlockUINT16 = VecDataBlockUINT16;

function __wbg_vecdatablockuint32_new(ptr) { return addHeapObject(VecDataBlockUINT32.__wrap(ptr)); }

__exports.__wbg_vecdatablockuint32_new = __wbg_vecdatablockuint32_new;

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

__exports.VecDataBlockUINT32 = VecDataBlockUINT32;

function __wbg_vecdatablockuint64_new(ptr) { return addHeapObject(VecDataBlockUINT64.__wrap(ptr)); }

__exports.__wbg_vecdatablockuint64_new = __wbg_vecdatablockuint64_new;

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

__exports.VecDataBlockUINT64 = VecDataBlockUINT64;

function __wbg_vecdatablockuint8_new(ptr) { return addHeapObject(VecDataBlockUINT8.__wrap(ptr)); }

__exports.__wbg_vecdatablockuint8_new = __wbg_vecdatablockuint8_new;

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

__exports.VecDataBlockUINT8 = VecDataBlockUINT8;

function __wbg_version_new(ptr) { return addHeapObject(Version.__wrap(ptr)); }

__exports.__wbg_version_new = __wbg_version_new;

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

__exports.Version = Version;

function __wbindgen_object_clone_ref(idx) {
    return addHeapObject(getObject(idx));
}

__exports.__wbindgen_object_clone_ref = __wbindgen_object_clone_ref;

function __wbindgen_object_drop_ref(i) { dropObject(i); }

__exports.__wbindgen_object_drop_ref = __wbindgen_object_drop_ref;

function init(module) {
    let result;
    const imports = { './n5_wasm': __exports };
    if (module instanceof URL || typeof module === 'string' || module instanceof Request) {

        const response = fetch(module);
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            result = WebAssembly.instantiateStreaming(response, imports)
            .catch(e => {
                console.warn("`WebAssembly.instantiateStreaming` failed. Assuming this is because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
                return response
                .then(r => r.arrayBuffer())
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

