let wasm_bindgen;
(function() {
    const __exports = {};
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }
    let wasm = undefined;

    const heap = new Array(128).fill(undefined);

    heap.push(undefined, null, true, false);

    function getObject(idx) { return heap[idx]; }

    let heap_next = heap.length;

    function addHeapObject(obj) {
        if (heap_next === heap.length) heap.push(heap.length + 1);
        const idx = heap_next;
        heap_next = heap[idx];

        heap[idx] = obj;
        return idx;
    }

    function handleError(f, args) {
        try {
            return f.apply(this, args);
        } catch (e) {
            wasm.__wbindgen_exn_store(addHeapObject(e));
        }
    }

    const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

    if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

    let cachedUint8ArrayMemory0 = null;

    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    let WASM_VECTOR_LEN = 0;

    const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

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
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

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
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = encodeString(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    let cachedDataViewMemory0 = null;

    function getDataViewMemory0() {
        if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
            cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
        }
        return cachedDataViewMemory0;
    }

    function dropObject(idx) {
        if (idx < 132) return;
        heap[idx] = heap_next;
        heap_next = idx;
    }

    function takeObject(idx) {
        const ret = getObject(idx);
        dropObject(idx);
        return ret;
    }

    const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(state => {
        wasm.__wbindgen_export_3.get(state.dtor)(state.a, state.b)
    });

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
                    wasm.__wbindgen_export_3.get(state.dtor)(a, state.b);
                    CLOSURE_DTORS.unregister(state);
                } else {
                    state.a = a;
                }
            }
        };
        real.original = state;
        CLOSURE_DTORS.register(real, state, state);
        return real;
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
        if (builtInMatches && builtInMatches.length > 1) {
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

    function _assertClass(instance, klass) {
        if (!(instance instanceof klass)) {
            throw new Error(`expected instance of ${klass.name}`);
        }
    }

    let cachedBigUint64ArrayMemory0 = null;

    function getBigUint64ArrayMemory0() {
        if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
            cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
        }
        return cachedBigUint64ArrayMemory0;
    }

    function passArray64ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 8, 8) >>> 0;
        getBigUint64ArrayMemory0().set(arg, ptr / 8);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    let cachedUint32ArrayMemory0 = null;

    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    function getArrayU32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    function getArrayU64FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getBigUint64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    let cachedUint16ArrayMemory0 = null;

    function getUint16ArrayMemory0() {
        if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
            cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
        }
        return cachedUint16ArrayMemory0;
    }

    function getArrayU16FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
    }

    let cachedInt8ArrayMemory0 = null;

    function getInt8ArrayMemory0() {
        if (cachedInt8ArrayMemory0 === null || cachedInt8ArrayMemory0.byteLength === 0) {
            cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer);
        }
        return cachedInt8ArrayMemory0;
    }

    function getArrayI8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getInt8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    let cachedInt16ArrayMemory0 = null;

    function getInt16ArrayMemory0() {
        if (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.byteLength === 0) {
            cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer);
        }
        return cachedInt16ArrayMemory0;
    }

    function getArrayI16FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getInt16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
    }

    let cachedInt32ArrayMemory0 = null;

    function getInt32ArrayMemory0() {
        if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
            cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
        }
        return cachedInt32ArrayMemory0;
    }

    function getArrayI32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    let cachedBigInt64ArrayMemory0 = null;

    function getBigInt64ArrayMemory0() {
        if (cachedBigInt64ArrayMemory0 === null || cachedBigInt64ArrayMemory0.byteLength === 0) {
            cachedBigInt64ArrayMemory0 = new BigInt64Array(wasm.memory.buffer);
        }
        return cachedBigInt64ArrayMemory0;
    }

    function getArrayI64FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getBigInt64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
    }

    let cachedFloat32ArrayMemory0 = null;

    function getFloat32ArrayMemory0() {
        if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
            cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
        }
        return cachedFloat32ArrayMemory0;
    }

    function getArrayF32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    let cachedFloat64ArrayMemory0 = null;

    function getFloat64ArrayMemory0() {
        if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
            cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
        }
        return cachedFloat64ArrayMemory0;
    }

    function getArrayF64FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
    }

    let stack_pointer = 128;

    function addBorrowedObject(obj) {
        if (stack_pointer == 1) throw new Error('out of js stack');
        heap[--stack_pointer] = obj;
        return stack_pointer;
    }
    function __wbg_adapter_54(arg0, arg1, arg2) {
        wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hba9c4d05d94bb2f6(arg0, arg1, addHeapObject(arg2));
    }

    function __wbg_adapter_253(arg0, arg1, arg2, arg3) {
        wasm.wasm_bindgen__convert__closures__invoke2_mut__ha4add01b7784d4e4(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
    }

    const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];

    const DatasetAttributesFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_datasetattributes_free(ptr >>> 0, 1));

    class DatasetAttributes {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(DatasetAttributes.prototype);
            obj.__wbg_ptr = ptr;
            DatasetAttributesFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            DatasetAttributesFinalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_datasetattributes_free(ptr, 0);
        }
        /**
         * @param {number} zoom_level
         * @returns {BigUint64Array}
         */
        get_dimensions(zoom_level) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.datasetattributes_get_dimensions(retptr, this.__wbg_ptr, zoom_level);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @param {number} zoom_level
         * @returns {Uint32Array}
         */
        get_block_size(zoom_level) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.datasetattributes_get_block_size(retptr, this.__wbg_ptr, zoom_level);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @param {number} zoom_level
         * @returns {Int32Array}
         */
        get_voxel_offset(zoom_level) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.datasetattributes_get_voxel_offset(retptr, this.__wbg_ptr, zoom_level);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {string}
         */
        get_data_type() {
            let deferred1_0;
            let deferred1_1;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.datasetattributes_get_data_type(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                deferred1_0 = r0;
                deferred1_1 = r1;
                return getStringFromWasm0(r0, r1);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }
        /**
         * @param {number} zoom_level
         * @returns {string}
         */
        get_compression(zoom_level) {
            let deferred1_0;
            let deferred1_1;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.datasetattributes_get_compression(retptr, this.__wbg_ptr, zoom_level);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                deferred1_0 = r0;
                deferred1_1 = r1;
                return getStringFromWasm0(r0, r1);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }
        /**
         * @param {number} zoom_level
         * @returns {number}
         */
        get_ndim(zoom_level) {
            const ret = wasm.datasetattributes_get_ndim(this.__wbg_ptr, zoom_level);
            return ret >>> 0;
        }
        /**
         * Get the total number of elements possible given the dimensions.
         * @param {number} zoom_level
         * @returns {number}
         */
        get_num_elements(zoom_level) {
            const ret = wasm.datasetattributes_get_num_elements(this.__wbg_ptr, zoom_level);
            return ret >>> 0;
        }
        /**
         * Get the total number of elements possible in a block.
         * @param {number} zoom_level
         * @returns {number}
         */
        get_block_num_elements(zoom_level) {
            const ret = wasm.datasetattributes_get_block_num_elements(this.__wbg_ptr, zoom_level);
            return ret >>> 0;
        }
        /**
         * Find out if this dataset is sharded. Currently this is assumed for
         * all scale level if scale zero is sharded.
         * @param {number} zoom_level
         * @returns {boolean}
         */
        is_sharded(zoom_level) {
            const ret = wasm.datasetattributes_is_sharded(this.__wbg_ptr, zoom_level);
            return ret !== 0;
        }
        /**
         * @returns {any}
         */
        to_json() {
            const ret = wasm.datasetattributes_to_json(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @param {any} js
         * @returns {DatasetAttributes}
         */
        static from_json(js) {
            try {
                const ret = wasm.datasetattributes_from_json(addBorrowedObject(js));
                return DatasetAttributes.__wrap(ret);
            } finally {
                heap[stack_pointer++] = undefined;
            }
        }
    }
    __exports.DatasetAttributes = DatasetAttributes;

    const NgPreHTTPFetchFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_ngprehttpfetch_free(ptr >>> 0, 1));

    class NgPreHTTPFetch {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(NgPreHTTPFetch.prototype);
            obj.__wbg_ptr = ptr;
            NgPreHTTPFetchFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            NgPreHTTPFetchFinalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_ngprehttpfetch_free(ptr, 0);
        }
        /**
         * @param {string} base_path
         * @returns {Promise<any>}
         */
        static open(base_path) {
            const ptr0 = passStringToWasm0(base_path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_open(ptr0, len0);
            return takeObject(ret);
        }
        /**
         * @returns {Promise<any>}
         */
        get_version() {
            const ret = wasm.ngprehttpfetch_get_version(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @returns {Promise<any>}
         */
        get_dataset_attributes(path_name) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_get_dataset_attributes(this.__wbg_ptr, ptr0, len0);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @returns {Promise<boolean>}
         */
        exists(path_name) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_exists(this.__wbg_ptr, ptr0, len0);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @returns {Promise<boolean>}
         */
        dataset_exists(path_name) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_dataset_exists(this.__wbg_ptr, ptr0, len0);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @param {DatasetAttributes} data_attrs
         * @param {BigInt64Array} grid_position
         * @returns {Promise<any>}
         */
        read_block(path_name, data_attrs, grid_position) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(data_attrs, DatasetAttributes);
            const ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_read_block(this.__wbg_ptr, ptr0, len0, data_attrs.__wbg_ptr, ptr1, len1);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @returns {Promise<any>}
         */
        list_attributes(path_name) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_list_attributes(this.__wbg_ptr, ptr0, len0);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @param {DatasetAttributes} data_attrs
         * @param {BigInt64Array} grid_position
         * @returns {Promise<any>}
         */
        block_etag(path_name, data_attrs, grid_position) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(data_attrs, DatasetAttributes);
            const ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_block_etag(this.__wbg_ptr, ptr0, len0, data_attrs.__wbg_ptr, ptr1, len1);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @param {DatasetAttributes} data_attrs
         * @param {BigInt64Array} grid_position
         * @returns {Promise<any>}
         */
        read_block_with_etag(path_name, data_attrs, grid_position) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(data_attrs, DatasetAttributes);
            const ptr1 = passArray64ToWasm0(grid_position, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_read_block_with_etag(this.__wbg_ptr, ptr0, len0, data_attrs.__wbg_ptr, ptr1, len1);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @param {DatasetAttributes} data_attrs
         * @param {BigInt64Array} flattened_grid_coords
         * @returns {Promise<any[]>}
         */
        read_blocks_with_etag(path_name, data_attrs, flattened_grid_coords) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(data_attrs, DatasetAttributes);
            const ptr1 = passArray64ToWasm0(flattened_grid_coords, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_read_blocks_with_etag(this.__wbg_ptr, ptr0, len0, data_attrs.__wbg_ptr, ptr1, len1);
            return takeObject(ret);
        }
        /**
         * @param {string} path_name
         * @param {DatasetAttributes} data_attrs
         * @param {BigInt64Array} flattened_grid_coords
         * @returns {Promise<any[]>}
         */
        get_optimized_request_bundles(path_name, data_attrs, flattened_grid_coords) {
            const ptr0 = passStringToWasm0(path_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            _assertClass(data_attrs, DatasetAttributes);
            const ptr1 = passArray64ToWasm0(flattened_grid_coords, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.ngprehttpfetch_get_optimized_request_bundles(this.__wbg_ptr, ptr0, len0, data_attrs.__wbg_ptr, ptr1, len1);
            return takeObject(ret);
        }
    }
    __exports.NgPreHTTPFetch = NgPreHTTPFetch;

    const VecDataBlockFLOAT32Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockfloat32_free(ptr >>> 0, 1));

    class VecDataBlockFLOAT32 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockFLOAT32.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockFLOAT32Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockFLOAT32Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockfloat32_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Float32Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayF32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Float32Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayF32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockfloat32_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockFLOAT32 = VecDataBlockFLOAT32;

    const VecDataBlockFLOAT64Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockfloat64_free(ptr >>> 0, 1));

    class VecDataBlockFLOAT64 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockFLOAT64.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockFLOAT64Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockFLOAT64Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockfloat64_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Float64Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayF64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Float64Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayF64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockfloat64_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockFLOAT64 = VecDataBlockFLOAT64;

    const VecDataBlockINT16Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockint16_free(ptr >>> 0, 1));

    class VecDataBlockINT16 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockINT16.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockINT16Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockINT16Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockint16_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int16Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI16FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 2, 2);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int16Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI16FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 2, 2);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockint16_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockINT16 = VecDataBlockINT16;

    const VecDataBlockINT32Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockint32_free(ptr >>> 0, 1));

    class VecDataBlockINT32 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockINT32.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockINT32Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockINT32Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockint32_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint32_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint32_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int32Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint32_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int32Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockint32_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint32_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockINT32 = VecDataBlockINT32;

    const VecDataBlockINT64Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockint64_free(ptr >>> 0, 1));

    class VecDataBlockINT64 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockINT64.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockINT64Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockINT64Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockint64_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint64_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint64_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigInt64Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint64_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigInt64Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockint64_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint64_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockINT64 = VecDataBlockINT64;

    const VecDataBlockINT8Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockint8_free(ptr >>> 0, 1));

    class VecDataBlockINT8 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockINT8.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockINT8Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockINT8Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockint8_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int8Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1, 1);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Int8Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayI8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1, 1);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockint8_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockINT8 = VecDataBlockINT8;

    const VecDataBlockUINT16Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockuint16_free(ptr >>> 0, 1));

    class VecDataBlockUINT16 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockUINT16.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockUINT16Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockUINT16Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockuint16_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint16_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint16_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint16Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint16_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU16FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 2, 2);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint16Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint16_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU16FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 2, 2);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockuint16_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint16_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockUINT16 = VecDataBlockUINT16;

    const VecDataBlockUINT32Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockuint32_free(ptr >>> 0, 1));

    class VecDataBlockUINT32 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockUINT32.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockUINT32Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockUINT32Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockuint32_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint32_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint32_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint32Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint32_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint32Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat32_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockuint32_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint32_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockUINT32 = VecDataBlockUINT32;

    const VecDataBlockUINT64Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockuint64_free(ptr >>> 0, 1));

    class VecDataBlockUINT64 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockUINT64.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockUINT64Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockUINT64Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockuint64_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint64_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint64_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint64_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockfloat64_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockuint64_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint64_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockUINT64 = VecDataBlockUINT64;

    const VecDataBlockUINT8Finalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_vecdatablockuint8_free(ptr >>> 0, 1));

    class VecDataBlockUINT8 {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(VecDataBlockUINT8.prototype);
            obj.__wbg_ptr = ptr;
            VecDataBlockUINT8Finalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VecDataBlockUINT8Finalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_vecdatablockuint8_free(ptr, 0);
        }
        /**
         * @returns {Uint32Array}
         */
        get_size() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint8_get_size(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU32FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {BigUint64Array}
         */
        get_grid_position() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint8_get_grid_position(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU64FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 8, 8);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint8Array}
         */
        get_data() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint8_get_data(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1, 1);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {Uint8Array}
         */
        into_data() {
            try {
                const ptr = this.__destroy_into_raw();
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockint8_into_data(retptr, ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_free(r0, r1 * 1, 1);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {number}
         */
        get_num_elements() {
            const ret = wasm.vecdatablockuint8_get_num_elements(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {string | undefined}
         */
        get_etag() {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.vecdatablockuint8_get_etag(retptr, this.__wbg_ptr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_free(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    __exports.VecDataBlockUINT8 = VecDataBlockUINT8;

    const VersionFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_version_free(ptr >>> 0, 1));

    class Version {

        static __wrap(ptr) {
            ptr = ptr >>> 0;
            const obj = Object.create(Version.prototype);
            obj.__wbg_ptr = ptr;
            VersionFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }

        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            VersionFinalization.unregister(this);
            return ptr;
        }

        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_version_free(ptr, 0);
        }
    }
    __exports.Version = Version;

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);

                } catch (e) {
                    if (module.headers.get('Content-Type') != 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

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

    function __wbg_get_imports() {
        const imports = {};
        imports.wbg = {};
        imports.wbg.__wbg_arrayBuffer_d0ca2ad8bda0039b = function() { return handleError(function (arg0) {
            const ret = getObject(arg0).arrayBuffer();
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_buffer_61b7ce01341d7f88 = function(arg0) {
            const ret = getObject(arg0).buffer;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_call_500db948e69c7330 = function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_call_b0d8e36992d9900d = function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_datasetattributes_new = function(arg0) {
            const ret = DatasetAttributes.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_done_f22c1561fa919baa = function(arg0) {
            const ret = getObject(arg0).done;
            return ret;
        };
        imports.wbg.__wbg_entries_4f2bb9b0d701c0f6 = function(arg0) {
            const ret = Object.entries(getObject(arg0));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_eval_cd0c386c3899dd07 = function() { return handleError(function (arg0, arg1) {
            const ret = eval(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_fetch_229368eecee9d217 = function(arg0, arg1) {
            const ret = getObject(arg0).fetch(getObject(arg1));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_fetch_e26fdd92ea39f634 = function(arg0, arg1) {
            const ret = getObject(arg0).fetch(getObject(arg1));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_get_9aa3dff3f0266054 = function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_get_ae7344ec6091c6c5 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg1).get(getStringFromWasm0(arg2, arg3));
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments) };
        imports.wbg.__wbg_get_bbccf8970793c087 = function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_getwithrefkey_1dc361bd10053bfe = function(arg0, arg1) {
            const ret = getObject(arg0)[getObject(arg1)];
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_headers_24e3e19fe3f187c0 = function(arg0) {
            const ret = getObject(arg0).headers;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_headers_786276f5fbbdb28a = function(arg0) {
            const ret = getObject(arg0).headers;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_instanceof_ArrayBuffer_670ddde44cdb2602 = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_instanceof_Map_98ecb30afec5acdb = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_instanceof_Response_d3453657e10c4300 = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_instanceof_Uint8Array_28af5bc19d6acad8 = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_instanceof_Window_d2514c6a7ee7ba60 = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_instanceof_WorkerGlobalScope_b32c94246142a6a7 = function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof WorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        };
        imports.wbg.__wbg_isArray_1ba11a930108ec51 = function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        };
        imports.wbg.__wbg_isSafeInteger_12f5549b2fca23f4 = function(arg0) {
            const ret = Number.isSafeInteger(getObject(arg0));
            return ret;
        };
        imports.wbg.__wbg_iterator_23604bb983791576 = function() {
            const ret = Symbol.iterator;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_json_2c755d0be3f5cc5c = function() { return handleError(function (arg0) {
            const ret = getObject(arg0).json();
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_length_65d1cd11729ced11 = function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        };
        imports.wbg.__wbg_length_d65cf0786bfc5739 = function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        };
        imports.wbg.__wbg_log_464d1b2190ca1e04 = function(arg0) {
            console.log(getObject(arg0));
        };
        imports.wbg.__wbg_new_254fa9eac11932ae = function() {
            const ret = new Array();
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_new_3d446df9155128ef = function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wbg_adapter_253(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return addHeapObject(ret);
            } finally {
                state0.a = state0.b = 0;
            }
        };
        imports.wbg.__wbg_new_3ff5b33b1ce712df = function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_new_688846f374351c92 = function() {
            const ret = new Object();
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_new_bc96c6a1c0786643 = function() {
            const ret = new Map();
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_newnoargs_fd9e4bf8be2bc16d = function(arg0, arg1) {
            const ret = new Function(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_newwithstrandinit_a1f6583f20e4faff = function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_next_01dd9234a5bf6d05 = function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments) };
        imports.wbg.__wbg_next_137428deb98342b0 = function(arg0) {
            const ret = getObject(arg0).next;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_ngprehttpfetch_new = function(arg0) {
            const ret = NgPreHTTPFetch.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_now_62a101fe35b60230 = function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        };
        imports.wbg.__wbg_ok_4cacdb33ce54895f = function(arg0) {
            const ret = getObject(arg0).ok;
            return ret;
        };
        imports.wbg.__wbg_performance_2e69ce813a883f21 = function(arg0) {
            const ret = getObject(arg0).performance;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_performance_33af593be9d2f2bb = function(arg0) {
            const ret = getObject(arg0).performance;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_queueMicrotask_2181040e064c0dc8 = function(arg0) {
            queueMicrotask(getObject(arg0));
        };
        imports.wbg.__wbg_queueMicrotask_ef9ac43769cbcc4f = function(arg0) {
            const ret = getObject(arg0).queueMicrotask;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_resolve_0bf7c44d641804f9 = function(arg0) {
            const ret = Promise.resolve(getObject(arg0));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_set_1d80752d0d5f0b21 = function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        };
        imports.wbg.__wbg_set_23d69db4e5c66a6e = function(arg0, arg1, arg2) {
            getObject(arg0).set(getObject(arg1), arg2 >>> 0);
        };
        imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        };
        imports.wbg.__wbg_set_76818dc3c59a63d5 = function(arg0, arg1, arg2) {
            const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_set_aa8f7a765a0a2e5f = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments) };
        imports.wbg.__wbg_setmethod_cfc7f688ba46a6be = function(arg0, arg1, arg2) {
            getObject(arg0).method = getStringFromWasm0(arg1, arg2);
        };
        imports.wbg.__wbg_setmode_cd03637eb7da01e0 = function(arg0, arg1) {
            getObject(arg0).mode = __wbindgen_enum_RequestMode[arg1];
        };
        imports.wbg.__wbg_static_accessor_GLOBAL_0be7472e492ad3e3 = function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_static_accessor_GLOBAL_THIS_1a6eb482d12c9bfb = function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_static_accessor_SELF_1dc398a895c82351 = function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_static_accessor_WINDOW_ae1c80c7eea8d64a = function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        };
        imports.wbg.__wbg_statusText_613aac5c001080c1 = function(arg0, arg1) {
            const ret = getObject(arg1).statusText;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        };
        imports.wbg.__wbg_then_0438fad860fe38e1 = function(arg0, arg1) {
            const ret = getObject(arg0).then(getObject(arg1));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_then_0ffafeddf0e182a4 = function(arg0, arg1, arg2) {
            const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_value_4c32fd138a88eee2 = function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockfloat32_new = function(arg0) {
            const ret = VecDataBlockFLOAT32.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockfloat64_new = function(arg0) {
            const ret = VecDataBlockFLOAT64.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockint16_new = function(arg0) {
            const ret = VecDataBlockINT16.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockint32_new = function(arg0) {
            const ret = VecDataBlockINT32.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockint64_new = function(arg0) {
            const ret = VecDataBlockINT64.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockint8_new = function(arg0) {
            const ret = VecDataBlockINT8.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockuint16_new = function(arg0) {
            const ret = VecDataBlockUINT16.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockuint32_new = function(arg0) {
            const ret = VecDataBlockUINT32.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockuint64_new = function(arg0) {
            const ret = VecDataBlockUINT64.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_vecdatablockuint8_new = function(arg0) {
            const ret = VecDataBlockUINT8.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbg_version_new = function(arg0) {
            const ret = Version.__wrap(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_array_new = function() {
            const ret = [];
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_array_push = function(arg0, arg1) {
            getObject(arg0).push(takeObject(arg1));
        };
        imports.wbg.__wbindgen_as_number = function(arg0) {
            const ret = +getObject(arg0);
            return ret;
        };
        imports.wbg.__wbindgen_bigint_from_i64 = function(arg0) {
            const ret = arg0;
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_bigint_get_as_i64 = function(arg0, arg1) {
            const v = getObject(arg1);
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        };
        imports.wbg.__wbindgen_boolean_get = function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
            return ret;
        };
        imports.wbg.__wbindgen_cb_drop = function(arg0) {
            const obj = takeObject(arg0).original;
            if (obj.cnt-- == 1) {
                obj.a = 0;
                return true;
            }
            const ret = false;
            return ret;
        };
        imports.wbg.__wbindgen_closure_wrapper1315 = function(arg0, arg1, arg2) {
            const ret = makeMutClosure(arg0, arg1, 263, __wbg_adapter_54);
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        };
        imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_in = function(arg0, arg1) {
            const ret = getObject(arg0) in getObject(arg1);
            return ret;
        };
        imports.wbg.__wbindgen_is_bigint = function(arg0) {
            const ret = typeof(getObject(arg0)) === 'bigint';
            return ret;
        };
        imports.wbg.__wbindgen_is_function = function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        };
        imports.wbg.__wbindgen_is_object = function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        };
        imports.wbg.__wbindgen_is_string = function(arg0) {
            const ret = typeof(getObject(arg0)) === 'string';
            return ret;
        };
        imports.wbg.__wbindgen_is_undefined = function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        };
        imports.wbg.__wbindgen_jsval_eq = function(arg0, arg1) {
            const ret = getObject(arg0) === getObject(arg1);
            return ret;
        };
        imports.wbg.__wbindgen_jsval_loose_eq = function(arg0, arg1) {
            const ret = getObject(arg0) == getObject(arg1);
            return ret;
        };
        imports.wbg.__wbindgen_memory = function() {
            const ret = wasm.memory;
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        };
        imports.wbg.__wbindgen_number_new = function(arg0) {
            const ret = arg0;
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
            takeObject(arg0);
        };
        imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        };
        imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        };
        imports.wbg.__wbindgen_throw = function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        };

        return imports;
    }

    function __wbg_init_memory(imports, memory) {

    }

    function __wbg_finalize_init(instance, module) {
        wasm = instance.exports;
        __wbg_init.__wbindgen_wasm_module = module;
        cachedBigInt64ArrayMemory0 = null;
        cachedBigUint64ArrayMemory0 = null;
        cachedDataViewMemory0 = null;
        cachedFloat32ArrayMemory0 = null;
        cachedFloat64ArrayMemory0 = null;
        cachedInt16ArrayMemory0 = null;
        cachedInt32ArrayMemory0 = null;
        cachedInt8ArrayMemory0 = null;
        cachedUint16ArrayMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;



        return wasm;
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (typeof module !== 'undefined') {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();

        __wbg_init_memory(imports);

        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }

        const instance = new WebAssembly.Instance(module, imports);

        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (typeof module_or_path !== 'undefined') {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (typeof module_or_path === 'undefined' && typeof script_src !== 'undefined') {
            module_or_path = script_src.replace(/\.js$/, '_bg.wasm');
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        __wbg_init_memory(imports);

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    wasm_bindgen = Object.assign(__wbg_init, { initSync }, __exports);

})();
self.ngpre_wasm = wasm_bindgen;
