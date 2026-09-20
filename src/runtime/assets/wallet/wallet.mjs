//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region wallet-host/storage-host.mjs
var storage_host_exports = __exportAll({
	RC: () => RC,
	attach: () => attach,
	attachBackend: () => attachBackend,
	attachMemory: () => attachMemory,
	entropy: () => entropy,
	file_access: () => file_access,
	file_close: () => file_close,
	file_delete: () => file_delete,
	file_lock: () => file_lock,
	file_open: () => file_open,
	file_read: () => file_read,
	file_reserved: () => file_reserved,
	file_size: () => file_size,
	file_sync: () => file_sync,
	file_truncate: () => file_truncate,
	file_unlock: () => file_unlock,
	file_write: () => file_write,
	host_error: () => host_error,
	mapError: () => mapError,
	sleep: () => sleep,
	state: () => state,
	utc_ms: () => utc_ms,
	withBackend: () => withBackend
});
const RC = {
	OK: 0,
	BUSY: 5,
	READONLY: 8,
	IOERR: 10,
	FULL: 13,
	CANTOPEN: 14,
	READ: 266,
	SHORT: 522,
	WRITE: 778,
	FSYNC: 1034,
	TRUNCATE: 1546,
	FSTAT: 1802,
	UNLOCK: 2058,
	DELETE: 2570,
	ACCESS: 3338,
	LOCK: 3850,
	CLOSE: 4106
};
let memory;
let backend;
let ownerRealm = true;
const files = new Map();
let next = 1;
let state = {
	last: "",
	lastCode: 0,
	closeError: false
};
const backends = new WeakMap();
function withBackend(owner, fn) {
	if (!memory || !ownerRealm) throw Error("host owner contract");
	if (owner !== void 0 && !backends.has(owner)) throw Error("host backend contract");
	const previous = backend, previousState = state;
	backend = owner;
	state = owner === void 0 ? {
		last: "",
		lastCode: 0,
		closeError: false
	} : backends.get(owner);
	try {
		return fn();
	} finally {
		backend = previous;
		state = previousState;
	}
}
function attach(mem, host) {
	attachMemory(mem);
	attachBackend(host);
}
function attachMemory(mem, shared = false, isOwner = true) {
	if (memory || !(mem instanceof WebAssembly.Memory) || typeof shared !== "boolean" || typeof isOwner !== "boolean" || !(shared ? typeof SharedArrayBuffer === "function" && mem.buffer instanceof SharedArrayBuffer : mem.buffer instanceof ArrayBuffer)) throw Error("host memory contract");
	memory = mem;
	ownerRealm = isOwner;
}
function attachBackend(host) {
	if (!ownerRealm || !memory || !host) throw Error("host backend contract");
	if (backends.has(host)) throw Error("DOMAIN_USED");
	backends.set(host, {
		last: "",
		lastCode: 0,
		closeError: false
	});
	backend = host;
	state = backends.get(host);
}
function bytes(ptr, n) {
	ptr >>>= 0;
	if (!Number.isSafeInteger(n) || n < 0 || ptr + n > memory.buffer.byteLength) throw Error("memory bounds");
	return new Uint8Array(memory.buffer, ptr, n);
}
function string(ptr) {
	const b = bytes(ptr, Math.min(512, memory.buffer.byteLength - (ptr >>> 0)));
	const end = b.indexOf(0);
	if (end < 0) throw Error("unterminated path");
	const path = b.subarray(0, end);
	return new TextDecoder("utf-8", { fatal: true }).decode(path.buffer instanceof ArrayBuffer ? path : Uint8Array.from(path));
}
function name(ptr) {
	const value = string(ptr);
	if (!["/wallet.db", "/wallet.db-journal"].includes(value)) throw Object.assign(Error("unsupported path"), { code: "EINVAL" });
	return value.slice(1);
}
function offset(at) {
	if (typeof at !== "bigint" || at < 0n || at > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("offset bounds");
	return Number(at);
}
function int(ptr, n) {
	new DataView(bytes(ptr, 4).buffer).setInt32(ptr >>> 0, n, true);
}
function lease() {
	if (!backend?.owned) throw Object.assign(Error("owner lease absent"), { code: "EBUSY" });
}
function get(id) {
	lease();
	const f = files.get(id);
	if (!f || f.backend !== backend) throw Error("closed or foreign file");
	return f;
}
function mapError(error, fallback) {
	const tag = typeof error.code === "string" ? error.code : error.name;
	if ([
		"ENOSPC",
		"EDQUOT",
		"QuotaExceededError"
	].includes(tag)) return RC.FULL;
	if ([
		"EACCES",
		"EPERM",
		"NotAllowedError"
	].includes(tag)) return RC.READONLY;
	if ([
		"EBUSY",
		"EAGAIN",
		"NoModificationAllowedError"
	].includes(tag)) return RC.BUSY;
	return fallback;
}
function attempt(op, file, fallback, fn) {
	try {
		lease();
		return fn();
	} catch (e) {
		const rc = mapError(e, fallback);
		state.last = `${op}:${typeof e.code === "string" ? e.code : e.name}`;
		state.lastCode = rc;
		if (op === "close") state.closeError = true;
		return rc;
	}
}
function file_open(ptr, flags, out) {
	const path = name(ptr);
	return attempt("open", path, RC.CANTOPEN, () => {
		const type = flags & 556800;
		const readOnly = (flags & 3) === 1;
		if (type !== (path === "wallet.db" ? 256 : 2048) || ![1, 2].includes(flags & 3) || flags & 24 || readOnly && flags & 4) return RC.CANTOPEN;
		if ([...files.values()].some((f) => f.path === path && f.backend === backend)) return RC.BUSY;
		const handle = backend.open(path, Boolean(flags & 4), readOnly);
		const id = next++;
		files.set(id, {
			path,
			handle,
			level: 0,
			readOnly,
			backend
		});
		int(out, id);
		return RC.OK;
	});
}
function file_close(id) {
	const f = get(id);
	return attempt("close", f.path, RC.CLOSE, () => {
		f.backend.close(f.handle);
		files.delete(id);
		return RC.OK;
	});
}
function file_read(id, ptr, n, at) {
	const f = get(id);
	return attempt("read", f.path, RC.READ, () => {
		const target = bytes(ptr, n);
		target.fill(0);
		const count = f.backend.read(f.handle, target, offset(at));
		if (!Number.isInteger(count) || count < 0 || count > n) return RC.READ;
		return count === n ? RC.OK : RC.SHORT;
	});
}
function file_write(id, ptr, n, at) {
	const f = get(id);
	return attempt("write", f.path, RC.WRITE, () => {
		if (f.readOnly) return RC.READONLY;
		const source = bytes(ptr, n);
		let wrote = 0;
		while (wrote < n) {
			const count = f.backend.write(f.handle, source.subarray(wrote), offset(at) + wrote);
			if (!Number.isInteger(count) || count <= 0 || count > n - wrote) return RC.WRITE;
			wrote += count;
		}
		return RC.OK;
	});
}
function file_truncate(id, size) {
	const f = get(id);
	return attempt("truncate", f.path, RC.TRUNCATE, () => {
		if (f.readOnly) return RC.READONLY;
		f.backend.truncate(f.handle, offset(size));
		return RC.OK;
	});
}
function file_sync(id, flags) {
	const f = get(id);
	return attempt("sync", f.path, RC.FSYNC, () => {
		f.backend.sync(f.handle, flags);
		return RC.OK;
	});
}
function file_size(id, out) {
	const f = get(id);
	return attempt("size", f.path, RC.FSTAT, () => {
		const n = f.backend.size(f.handle);
		if (!Number.isSafeInteger(n) || n < 0) return RC.FSTAT;
		new DataView(bytes(out, 8).buffer).setBigInt64(out >>> 0, BigInt(n), true);
		return RC.OK;
	});
}
function file_lock(id, level) {
	const f = get(id);
	return attempt("lock", f.path, RC.LOCK, () => {
		if (f.path !== "wallet.db" || level < 1 || level > 4) return RC.LOCK;
		f.level = Math.max(f.level, level);
		return RC.OK;
	});
}
function file_unlock(id, level) {
	const f = get(id);
	return attempt("unlock", f.path, RC.UNLOCK, () => {
		if (![0, 1].includes(level) || level > f.level) return RC.UNLOCK;
		f.level = level;
		return RC.OK;
	});
}
function file_reserved(id, out) {
	const f = get(id);
	return attempt("reserved", f.path, RC.LOCK, () => {
		int(out, f.level >= 2 ? 1 : 0);
		return RC.OK;
	});
}
function file_delete(ptr, sync) {
	const path = name(ptr);
	return attempt("delete", path, RC.DELETE, () => {
		if (path !== "wallet.db-journal") return RC.DELETE;
		backend.delete(path, sync);
		return RC.OK;
	});
}
function file_access(ptr, flags, out) {
	const path = name(ptr);
	return attempt("access", path, RC.ACCESS, () => {
		int(out, backend.access(path, flags) ? 1 : 0);
		return RC.OK;
	});
}
function host_error(size, ptr) {
	if (size > 0) {
		const b = bytes(ptr, size);
		b.fill(0);
		b.set(new TextEncoder().encode(state.last).subarray(0, size - 1));
	}
	return state.lastCode;
}
function entropy(ptr, n) {
	if (n < 0 || n > 65536) throw Error("entropy bounds");
	try {
		const target = bytes(ptr, n), ordinary = target.buffer instanceof ArrayBuffer ? target : new Uint8Array(n);
		try {
			crypto.getRandomValues(ordinary);
			if (ordinary !== target) target.set(ordinary);
			return n;
		} finally {
			if (ordinary !== target) ordinary.fill(0);
		}
	} catch {
		return 0;
	}
}
function utc_ms() {
	return Date.now();
}
function sleep(us) {
	if (!Number.isInteger(us) || us < 0 || us > 2e4) throw Error("sleep bounds");
	const start = performance.now();
	while ((performance.now() - start) * 1e3 < us);
	return Math.ceil((performance.now() - start) * 1e3);
}
//#endregion
//#region bindings.js
var StandalonePczt = class StandalonePczt {
	static __wrap(ptr) {
		const obj = Object.create(StandalonePczt.prototype);
		obj.__wbg_ptr = ptr;
		StandalonePcztFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		StandalonePcztFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_standalonepczt_free(ptr, 0);
	}
	combine(other) {
		_assertClass(other, StandalonePczt);
		const ret = wasm.standalonepczt_combine(this.__wbg_ptr, other.__wbg_ptr);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return StandalonePczt.__wrap(ret[0]);
	}
	inspect() {
		let deferred2_0;
		let deferred2_1;
		try {
			const ret = wasm.standalonepczt_inspect(this.__wbg_ptr);
			var ptr1 = ret[0];
			var len1 = ret[1];
			if (ret[3]) {
				ptr1 = 0;
				len1 = 0;
				throw takeFromExternrefTable0(ret[2]);
			}
			deferred2_0 = ptr1;
			deferred2_1 = len1;
			return getStringFromWasm0(ptr1, len1);
		} finally {
			wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
		}
	}
	redact(profile) {
		const ptr0 = passStringToWasm0(profile, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.standalonepczt_redact(this.__wbg_ptr, ptr0, len0);
		if (ret[2]) throw takeFromExternrefTable0(ret[1]);
		return StandalonePczt.__wrap(ret[0]);
	}
	serialize() {
		const ret = wasm.standalonepczt_serialize(this.__wbg_ptr);
		if (ret[3]) throw takeFromExternrefTable0(ret[2]);
		var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
		wasm.__wbindgen_free_command_export(ret[0], ret[1] * 1, 1);
		return v1;
	}
};
if (Symbol.dispose) StandalonePczt.prototype[Symbol.dispose] = StandalonePczt.prototype.free;
var ViewingHandle = class ViewingHandle {
	static __wrap(ptr) {
		const obj = Object.create(ViewingHandle.prototype);
		obj.__wbg_ptr = ptr;
		ViewingHandleFinalization.register(obj, obj.__wbg_ptr, obj);
		return obj;
	}
	__destroy_into_raw() {
		const ptr = this.__wbg_ptr;
		this.__wbg_ptr = 0;
		ViewingHandleFinalization.unregister(this);
		return ptr;
	}
	free() {
		const ptr = this.__destroy_into_raw();
		wasm.__wbg_viewinghandle_free(ptr, 0);
	}
	derive(index, request) {
		let deferred4_0;
		let deferred4_1;
		try {
			const ptr0 = passStringToWasm0(index, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len0 = WASM_VECTOR_LEN;
			const ptr1 = passStringToWasm0(request, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len1 = WASM_VECTOR_LEN;
			const ret = wasm.viewinghandle_derive(this.__wbg_ptr, ptr0, len0, ptr1, len1);
			var ptr3 = ret[0];
			var len3 = ret[1];
			if (ret[3]) {
				ptr3 = 0;
				len3 = 0;
				throw takeFromExternrefTable0(ret[2]);
			}
			deferred4_0 = ptr3;
			deferred4_1 = len3;
			return getStringFromWasm0(ptr3, len3);
		} finally {
			wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
		}
	}
	describe() {
		let deferred1_0;
		let deferred1_1;
		try {
			const ret = wasm.viewinghandle_describe(this.__wbg_ptr);
			deferred1_0 = ret[0];
			deferred1_1 = ret[1];
			return getStringFromWasm0(ret[0], ret[1]);
		} finally {
			wasm.__wbindgen_free_command_export(deferred1_0, deferred1_1, 1);
		}
	}
	export(format, acknowledge) {
		let deferred4_0;
		let deferred4_1;
		try {
			const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len0 = WASM_VECTOR_LEN;
			const ptr1 = passStringToWasm0(acknowledge, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len1 = WASM_VECTOR_LEN;
			const ret = wasm.viewinghandle_export(this.__wbg_ptr, ptr0, len0, ptr1, len1);
			var ptr3 = ret[0];
			var len3 = ret[1];
			if (ret[3]) {
				ptr3 = 0;
				len3 = 0;
				throw takeFromExternrefTable0(ret[2]);
			}
			deferred4_0 = ptr3;
			deferred4_1 = len3;
			return getStringFromWasm0(ptr3, len3);
		} finally {
			wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
		}
	}
	find(start, request, max_attempts) {
		let deferred4_0;
		let deferred4_1;
		try {
			const ptr0 = passStringToWasm0(start, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len0 = WASM_VECTOR_LEN;
			const ptr1 = passStringToWasm0(request, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
			const len1 = WASM_VECTOR_LEN;
			const ret = wasm.viewinghandle_find(this.__wbg_ptr, ptr0, len0, ptr1, len1, max_attempts);
			var ptr3 = ret[0];
			var len3 = ret[1];
			if (ret[3]) {
				ptr3 = 0;
				len3 = 0;
				throw takeFromExternrefTable0(ret[2]);
			}
			deferred4_0 = ptr3;
			deferred4_1 = len3;
			return getStringFromWasm0(ptr3, len3);
		} finally {
			wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
		}
	}
	to_incoming() {
		const ret = wasm.viewinghandle_to_incoming(this.__wbg_ptr);
		return ViewingHandle.__wrap(ret);
	}
};
if (Symbol.dispose) ViewingHandle.prototype[Symbol.dispose] = ViewingHandle.prototype.free;
function account_lifecycle_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.account_lifecycle_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function consensus_branch(format, bytes, height) {
	const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc_command_export);
	const len1 = WASM_VECTOR_LEN;
	const ret = wasm.consensus_branch(ptr0, len0, ptr1, len1, height);
	if (ret[2]) throw takeFromExternrefTable0(ret[1]);
	return ret[0] >>> 0;
}
function enhancement_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.enhancement_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function finalized_get(generation, operation_id) {
	let deferred3_0;
	let deferred3_1;
	try {
		const ptr0 = passStringToWasm0(operation_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.finalized_get(generation, ptr0, len0);
		var ptr2 = ret[0];
		var len2 = ret[1];
		if (ret[3]) {
			ptr2 = 0;
			len2 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred3_0 = ptr2;
		deferred3_1 = len2;
		return getStringFromWasm0(ptr2, len2);
	} finally {
		wasm.__wbindgen_free_command_export(deferred3_0, deferred3_1, 1);
	}
}
function fused_send_call(generation, operation_id, proposal_id, review_commitment, token, spend, output, maximum) {
	let deferred7_0;
	let deferred7_1;
	try {
		const ptr0 = passStringToWasm0(operation_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(proposal_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passStringToWasm0(review_commitment, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ptr3 = passArray8ToWasm0(spend, wasm.__wbindgen_malloc_command_export);
		const len3 = WASM_VECTOR_LEN;
		const ptr4 = passArray8ToWasm0(output, wasm.__wbindgen_malloc_command_export);
		const len4 = WASM_VECTOR_LEN;
		const ret = wasm.fused_send_call(generation, ptr0, len0, ptr1, len1, ptr2, len2, token, ptr3, len3, ptr4, len4, maximum);
		var ptr6 = ret[0];
		var len6 = ret[1];
		if (ret[3]) {
			ptr6 = 0;
			len6 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred7_0 = ptr6;
		deferred7_1 = len6;
		return getStringFromWasm0(ptr6, len6);
	} finally {
		wasm.__wbindgen_free_command_export(deferred7_0, deferred7_1, 1);
	}
}
function payment_call(generation, command, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(command, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.payment_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function pczt_build_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.pczt_build_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function pczt_finalize_call(generation, operation_id, artifact_id, spend, output, maximum) {
	let deferred6_0;
	let deferred6_1;
	try {
		const ptr0 = passStringToWasm0(operation_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(artifact_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passArray8ToWasm0(spend, wasm.__wbindgen_malloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ptr3 = passArray8ToWasm0(output, wasm.__wbindgen_malloc_command_export);
		const len3 = WASM_VECTOR_LEN;
		const ret = wasm.pczt_finalize_call(generation, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, maximum);
		var ptr5 = ret[0];
		var len5 = ret[1];
		if (ret[3]) {
			ptr5 = 0;
			len5 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred6_0 = ptr5;
		deferred6_1 = len5;
		return getStringFromWasm0(ptr5, len5);
	} finally {
		wasm.__wbindgen_free_command_export(deferred6_0, deferred6_1, 1);
	}
}
function pczt_import_call(generation, operation_id, bytes, maximum) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.pczt_import_call(generation, ptr0, len0, ptr1, len1, maximum);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function pczt_prove_call(generation, operation_id, artifact_id, spend, output, maximum) {
	let deferred6_0;
	let deferred6_1;
	try {
		const ptr0 = passStringToWasm0(operation_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(artifact_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passArray8ToWasm0(spend, wasm.__wbindgen_malloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ptr3 = passArray8ToWasm0(output, wasm.__wbindgen_malloc_command_export);
		const len3 = WASM_VECTOR_LEN;
		const ret = wasm.pczt_prove_call(generation, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, maximum);
		var ptr5 = ret[0];
		var len5 = ret[1];
		if (ret[3]) {
			ptr5 = 0;
			len5 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred6_0 = ptr5;
		deferred6_1 = len5;
		return getStringFromWasm0(ptr5, len5);
	} finally {
		wasm.__wbindgen_free_command_export(deferred6_0, deferred6_1, 1);
	}
}
function proposal_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.proposal_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function query_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.query_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function scan_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.scan_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function signer_authorize(token, parameters, genesis, height, branch, bytes, maximum) {
	const ptr0 = passArray8ToWasm0(parameters, wasm.__wbindgen_malloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ptr1 = passArray8ToWasm0(genesis, wasm.__wbindgen_malloc_command_export);
	const len1 = WASM_VECTOR_LEN;
	const ptr2 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc_command_export);
	const len2 = WASM_VECTOR_LEN;
	const ret = wasm.signer_authorize(token, ptr0, len0, ptr1, len1, height, branch, ptr2, len2, maximum);
	if (ret[3]) throw takeFromExternrefTable0(ret[2]);
	var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
	wasm.__wbindgen_free_command_export(ret[0], ret[1] * 1, 1);
	return v4;
}
function signer_bind(token, generation, account_id) {
	let deferred3_0;
	let deferred3_1;
	try {
		const ptr0 = passStringToWasm0(account_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ret = wasm.signer_bind(token, generation, ptr0, len0);
		var ptr2 = ret[0];
		var len2 = ret[1];
		if (ret[3]) {
			ptr2 = 0;
			len2 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred3_0 = ptr2;
		deferred3_1 = len2;
		return getStringFromWasm0(ptr2, len2);
	} finally {
		wasm.__wbindgen_free_command_export(deferred3_0, deferred3_1, 1);
	}
}
function signer_capabilities(token) {
	let deferred2_0;
	let deferred2_1;
	try {
		const ret = wasm.signer_capabilities(token);
		var ptr1 = ret[0];
		var len1 = ret[1];
		if (ret[3]) {
			ptr1 = 0;
			len1 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred2_0 = ptr1;
		deferred2_1 = len1;
		return getStringFromWasm0(ptr1, len1);
	} finally {
		wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
	}
}
function signer_create_account(generation, operation, input, mnemonic, passphrase) {
	let deferred6_0;
	let deferred6_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passArray8ToWasm0(mnemonic, wasm.__wbindgen_malloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ptr3 = passArray8ToWasm0(passphrase, wasm.__wbindgen_malloc_command_export);
		const len3 = WASM_VECTOR_LEN;
		const ret = wasm.signer_create_account(generation, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
		var ptr5 = ret[0];
		var len5 = ret[1];
		if (ret[3]) {
			ptr5 = 0;
			len5 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred6_0 = ptr5;
		deferred6_1 = len5;
		return getStringFromWasm0(ptr5, len5);
	} finally {
		wasm.__wbindgen_free_command_export(deferred6_0, deferred6_1, 1);
	}
}
function signer_describe(token) {
	let deferred2_0;
	let deferred2_1;
	try {
		const ret = wasm.signer_describe(token);
		var ptr1 = ret[0];
		var len1 = ret[1];
		if (ret[3]) {
			ptr1 = 0;
			len1 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred2_0 = ptr1;
		deferred2_1 = len1;
		return getStringFromWasm0(ptr1, len1);
	} finally {
		wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
	}
}
function signer_release(token) {
	const ret = wasm.signer_release(token);
	if (ret[1]) throw takeFromExternrefTable0(ret[0]);
}
function signer_unbind(token, generation, account_id) {
	const ptr0 = passStringToWasm0(account_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ret = wasm.signer_unbind(token, generation, ptr0, len0);
	if (ret[1]) throw takeFromExternrefTable0(ret[0]);
}
function storage_binding(generation) {
	const ret = wasm.storage_binding(generation);
	if (ret[3]) throw takeFromExternrefTable0(ret[2]);
	var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
	wasm.__wbindgen_free_command_export(ret[0], ret[1] * 1, 1);
	return v1;
}
function storage_close(generation) {
	const ret = wasm.storage_close(generation);
	if (ret[1]) throw takeFromExternrefTable0(ret[0]);
}
function storage_initialize(format, bytes, genesis) {
	const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc_command_export);
	const len1 = WASM_VECTOR_LEN;
	const ptr2 = passArray8ToWasm0(genesis, wasm.__wbindgen_malloc_command_export);
	const len2 = WASM_VECTOR_LEN;
	const ret = wasm.storage_initialize(ptr0, len0, ptr1, len1, ptr2, len2);
	if (ret[2]) throw takeFromExternrefTable0(ret[1]);
	return ret[0] >>> 0;
}
function storage_initialize_memory(format, bytes, genesis) {
	const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc_command_export);
	const len1 = WASM_VECTOR_LEN;
	const ptr2 = passArray8ToWasm0(genesis, wasm.__wbindgen_malloc_command_export);
	const len2 = WASM_VECTOR_LEN;
	const ret = wasm.storage_initialize_memory(ptr0, len0, ptr1, len1, ptr2, len2);
	if (ret[2]) throw takeFromExternrefTable0(ret[1]);
	return ret[0] >>> 0;
}
function sync_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.sync_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function transaction_id(raw, branch) {
	const ptr0 = passArray8ToWasm0(raw, wasm.__wbindgen_malloc_command_export);
	const len0 = WASM_VECTOR_LEN;
	const ret = wasm.transaction_id(ptr0, len0, branch);
	if (ret[3]) throw takeFromExternrefTable0(ret[2]);
	var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
	wasm.__wbindgen_free_command_export(ret[0], ret[1] * 1, 1);
	return v2;
}
function views_call(generation, operation, input) {
	let deferred4_0;
	let deferred4_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ret = wasm.views_call(generation, ptr0, len0, ptr1, len1);
		var ptr3 = ret[0];
		var len3 = ret[1];
		if (ret[3]) {
			ptr3 = 0;
			len3 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred4_0 = ptr3;
		deferred4_1 = len3;
		return getStringFromWasm0(ptr3, len3);
	} finally {
		wasm.__wbindgen_free_command_export(deferred4_0, deferred4_1, 1);
	}
}
function views_mnemonic_call(generation, input, mnemonic, passphrase) {
	let deferred5_0;
	let deferred5_1;
	try {
		const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passArray8ToWasm0(mnemonic, wasm.__wbindgen_malloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passArray8ToWasm0(passphrase, wasm.__wbindgen_malloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ret = wasm.views_mnemonic_call(generation, ptr0, len0, ptr1, len1, ptr2, len2);
		var ptr4 = ret[0];
		var len4 = ret[1];
		if (ret[3]) {
			ptr4 = 0;
			len4 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred5_0 = ptr4;
		deferred5_1 = len4;
		return getStringFromWasm0(ptr4, len4);
	} finally {
		wasm.__wbindgen_free_command_export(deferred5_0, deferred5_1, 1);
	}
}
function views_seed_call(generation, operation, input, seed) {
	let deferred5_0;
	let deferred5_1;
	try {
		const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(input, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
		const len1 = WASM_VECTOR_LEN;
		const ptr2 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc_command_export);
		const len2 = WASM_VECTOR_LEN;
		const ret = wasm.views_seed_call(generation, ptr0, len0, ptr1, len1, ptr2, len2);
		var ptr4 = ret[0];
		var len4 = ret[1];
		if (ret[3]) {
			ptr4 = 0;
			len4 = 0;
			throw takeFromExternrefTable0(ret[2]);
		}
		deferred5_0 = ptr4;
		deferred5_1 = len4;
		return getStringFromWasm0(ptr4, len4);
	} finally {
		wasm.__wbindgen_free_command_export(deferred5_0, deferred5_1, 1);
	}
}
function __wbg_get_imports() {
	return {
		__proto__: null,
		"./bindings_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
				throw new Error(getStringFromWasm0(arg0, arg1));
			},
			__wbg_getRandomValues_436a51d0629d84e1: function() {
				return handleError(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
				}, arguments);
			},
			__wbg_getRandomValues_a678b7300e8ed57f: function() {
				return handleError(function(arg0, arg1) {
					globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
				}, arguments);
			},
			__wbg_getTime_65922ba0b59d55a7: function(arg0) {
				return arg0.getTime();
			},
			__wbg_new_0_35540e542ba689d2: function() {
				return new Date();
			},
			__wbindgen_generic_0000000000000001: function(arg0, arg1) {
				return getStringFromWasm0(arg0, arg1);
			},
			__wbindgen_init_externref_table: function() {
				const table = wasm.__wbindgen_externrefs;
				const offset = table.grow(4);
				table.set(0, void 0);
				table.set(offset + 0, void 0);
				table.set(offset + 1, null);
				table.set(offset + 2, true);
				table.set(offset + 3, false);
			}
		},
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports,
		"./wallet-host/storage-host.mjs": storage_host_exports
	};
}
const StandalonePcztFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_standalonepczt_free(ptr, 1));
const ViewingHandleFinalization = typeof FinalizationRegistry === "undefined" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((ptr) => wasm.__wbg_viewinghandle_free(ptr, 1));
function addToExternrefTable0(obj) {
	const idx = wasm.__externref_table_alloc_command_export();
	wasm.__wbindgen_externrefs.set(idx, obj);
	return idx;
}
function _assertClass(instance, klass) {
	if (!(instance instanceof klass)) throw new Error(`expected instance of ${klass.name}`);
}
function getArrayU8FromWasm0(ptr, len) {
	ptr = ptr >>> 0;
	return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
function getStringFromWasm0(ptr, len) {
	return decodeText(ptr >>> 0, len);
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	return cachedUint8ArrayMemory0;
}
function handleError(f, args) {
	try {
		return f.apply(this, args);
	} catch (e) {
		const idx = addToExternrefTable0(e);
		wasm.__wbindgen_exn_store_command_export(idx);
	}
}
function passArray8ToWasm0(arg, malloc) {
	const ptr = malloc(arg.length * 1, 1) >>> 0;
	getUint8ArrayMemory0().set(arg, ptr / 1);
	WASM_VECTOR_LEN = arg.length;
	return ptr;
}
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === void 0) {
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
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) arg = arg.slice(offset);
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = cachedTextEncoder.encodeInto(arg, view);
		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}
	WASM_VECTOR_LEN = offset;
	return ptr;
}
function takeFromExternrefTable0(idx) {
	const value = wasm.__wbindgen_externrefs.get(idx);
	wasm.__externref_table_dealloc_command_export(idx);
	return value;
}
let cachedTextDecoder = new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
	numBytesDecoded += len;
	if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
		cachedTextDecoder = new TextDecoder("utf-8", {
			ignoreBOM: true,
			fatal: true
		});
		cachedTextDecoder.decode();
		numBytesDecoded = len;
	}
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
const cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) cachedTextEncoder.encodeInto = function(arg, view) {
	const buf = cachedTextEncoder.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
let WASM_VECTOR_LEN = 0;
let wasm;
function __wbg_finalize_init(instance, module) {
	wasm = instance.exports;
	cachedUint8ArrayMemory0 = null;
	wasm.__wbindgen_start();
	return wasm;
}
function initSync(module) {
	if (wasm !== void 0) return wasm;
	if (module !== void 0) {
		if (Object.getPrototypeOf(module) === Object.prototype) ({module} = module);
		else console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
	}
	const imports = __wbg_get_imports();
	if (!(module instanceof WebAssembly.Module)) module = new WebAssembly.Module(module);
	return __wbg_finalize_init(new WebAssembly.Instance(module, imports), module);
}
//#endregion
//#region bytes.mjs
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArray, "byteLength").get;
const buffer = Object.getOwnPropertyDescriptor(typedArray, "buffer").get;
const tag = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag).get;
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
function copyBytes(value, limit, message, minimum = 1) {
	if (!(value instanceof Uint8Array) || !ArrayBuffer.isView(value) || tag.call(value) !== "Uint8Array" || !(buffer.call(value) instanceof ArrayBuffer) || byteLength.call(value) < minimum || byteLength.call(value) > limit) throw new TypeError(message);
	try {
		arrayBufferByteLength.call(buffer.call(value));
	} catch {
		throw new TypeError(message);
	}
	return new Uint8Array(value);
}
//#endregion
//#region wallet.mjs
let attempted = false;
function threaded(exports, name, ...args) {
	const fn = Reflect.get(exports, name);
	if (typeof fn !== "function") throw Error("RUNTIME_UNAVAILABLE");
	return fn(...args);
}
function uint(value) {
	if (!Number.isInteger(value) || value < 1 || value > 4294967295) throw TypeError("INVALID_ARGUMENT");
	return value;
}
function network(format, parameters, genesis) {
	const params = copyBytes(parameters, 256, "invalid parameters");
	const identity = copyBytes(genesis, 32, "invalid genesis");
	if (identity.length !== 32 || format !== "zcash-js-network/1") throw TypeError("INVALID_ARGUMENT");
	return {
		params,
		identity
	};
}
function initializeWalletRuntime(wasm) {
	const code = copyBytes(wasm, 33554432, "invalid wasm bytes");
	if (attempted) throw Error("DOMAIN_USED");
	attempted = true;
	return runtime(initSync({ module: code }), false);
}
function runtime(exports, shared) {
	const instance = crypto.randomUUID();
	attachMemory(exports.memory, shared);
	if (exports.wallet_pool_start() + exports.wallet_pool_size() > exports.__heap_base.value) throw Error("allocator overlap");
	if (exports.wallet_runtime_init() !== 0) throw Error("RUNTIME_UNAVAILABLE");
	let invalid = false;
	const run = (backend, fn) => {
		if (invalid) throw Error("DOMAIN_INVALID");
		try {
			if (shared) threaded(exports, "wallet_threaded_check");
			return withBackend(backend, fn);
		} catch (error) {
			if (typeof error !== "string" || error === "STORAGE_CLOSE_FAILED") invalid = true;
			throw error;
		}
	};
	return Object.freeze({
		get invalid() {
			return invalid;
		},
		signers: Object.freeze({
			capabilities(token) {
				uint(token);
				return JSON.parse(run(void 0, () => signer_capabilities(token)));
			},
			authorize(token, format, parameters, genesis, height, branch, bytes, maximum) {
				uint(token);
				const { params, identity } = network(format, parameters, genesis);
				if (!Number.isInteger(height) || height < 0 || height > 4294967295 || !Number.isInteger(branch) || branch < 0 || branch > 4294967295) throw TypeError("INVALID_ARGUMENT");
				if (!Number.isInteger(maximum) || maximum < 1 || maximum > 4194304) throw TypeError("RESOURCE_LIMIT");
				let length;
				try {
					length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength").get.call(bytes);
				} catch {
					throw TypeError("INVALID_PCZT");
				}
				if (length > maximum) throw TypeError("RESOURCE_LIMIT");
				const input = copyBytes(bytes, maximum, "INVALID_PCZT");
				return run(void 0, () => signer_authorize(token, params, identity, height, branch, input, maximum));
			},
			describe(token) {
				uint(token);
				return JSON.parse(run(void 0, () => signer_describe(token)));
			},
			release(token) {
				uint(token);
				return run(void 0, () => signer_release(token));
			}
		}),
		openMemory(format, parameters, genesis) {
			const { params, identity } = network(format, parameters, genesis);
			return openStorage(void 0, instance, format, params, identity, run);
		},
		open(backend, format, parameters, genesis) {
			const { params, identity } = network(format, parameters, genesis);
			attachBackend(backend);
			return openStorage(backend, instance, format, params, identity, run);
		}
	});
}
function openStorage(backend, instance, format, params, identity, execute) {
	const run = (fn) => execute(backend, fn);
	const generation = run(() => backend === void 0 ? storage_initialize_memory(format, params, identity) : storage_initialize(format, params, identity));
	let closed = false, closeError;
	return {
		generation,
		instance,
		run,
		bindSigner(token, accountId) {
			uint(token);
			if (typeof accountId !== "string" || accountId.length !== 36) throw TypeError("INVALID_ARGUMENT");
			if (closed) throw Error("STALE_HANDLE");
			return run(() => signer_bind(token, generation, accountId));
		},
		unbindSigner(token, accountId) {
			uint(token);
			if (typeof accountId !== "string" || accountId.length !== 36) throw TypeError("INVALID_ARGUMENT");
			if (closed) throw Error("STALE_HANDLE");
			return run(() => signer_unbind(token, generation, accountId));
		},
		binding(token, owner) {
			uint(token);
			if (owner !== instance) throw Error("WRONG_INSTANCE");
			if (token !== generation) throw Error("STALE_HANDLE");
			if (closed) throw Error("STALE_HANDLE");
			try {
				return run(() => new Uint8Array(storage_binding(token)));
			} catch (error) {
				if (typeof error !== "string") {
					closed = true;
					closeError = Error("DOMAIN_INVALID");
				}
				throw error;
			}
		},
		close(token, owner) {
			uint(token);
			if (owner !== instance) throw Error("WRONG_INSTANCE");
			if (token !== generation) throw Error("STALE_HANDLE");
			if (closed) {
				if (closeError) throw closeError;
				return;
			}
			closed = true;
			try {
				run(() => {
					storage_close(token);
					if (state.closeError) throw Error("STORAGE_CLOSE_FAILED");
					if (backend) backend.release();
				});
			} catch {
				closeError = Error("STORAGE_CLOSE_FAILED");
				throw closeError;
			}
		}
	};
}
//#endregion
//#region views.mjs
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted").get;
const operations = new Set([
	"account_balance",
	"account_import",
	"account_import_hd",
	"account_create_hd",
	"account_import_mnemonic",
	"account_import_mnemonic_signer",
	"account_create_mnemonic_signer",
	"account_list",
	"account_get",
	"address_current",
	"address_next",
	"address_list",
	"address_at"
]);
const queries = new Set([
	"wallet_history",
	"wallet_transaction",
	"wallet_notes",
	"wallet_utxos"
]);
const syncs = new Set([
	"scan_state",
	"scan_block_hash",
	"scan_rewind",
	"scan_complete"
]);
const enhancements = new Set(["enhancement_requests", "enhancement_apply"]);
const proposals = new Set([
	"proposal_create",
	"proposal_get",
	"proposal_list",
	"proposal_lookup_intent"
]);
const pczt = new Set([
	"fused_send",
	"pczt_finalize",
	"finalized_get",
	"pczt_prove",
	"pczt_build",
	"pczt_get_artifact",
	"pczt_import"
]);
const lifecycle = new Set([
	"account_remove",
	"account_check_key",
	"account_viewing_key"
]);
const payments = new Set([
	"payment_abandon",
	"payment_get",
	"payment_list",
	"payment_reconcile",
	"payment_observe",
	"payment_attempt_begin",
	"payment_attempt_finish",
	"payment_recovery_position"
]);
const scans = new Set([
	...payments,
	...pczt,
	...lifecycle,
	...proposals,
	"scan_plan",
	"scan_ingest_batch",
	...syncs,
	...enhancements,
	...queries
]);
const writes = new Set([
	"payment_abandon",
	"fused_send",
	"payment_reconcile",
	"payment_observe",
	"payment_attempt_begin",
	"payment_attempt_finish",
	"payment_recovery_position",
	"pczt_finalize",
	"pczt_prove",
	"pczt_import",
	"pczt_build",
	"account_remove",
	"proposal_create",
	"scan_plan",
	"scan_ingest_batch",
	"scan_rewind",
	"scan_complete",
	"enhancement_apply",
	"account_import",
	"account_import_hd",
	"account_create_hd",
	"account_import_mnemonic",
	"account_import_mnemonic_signer",
	"account_create_mnemonic_signer",
	"address_next",
	"address_at"
]);
function abort(signal, commit) {
	if (signal !== void 0 && aborted.call(signal)) throw Object.assign(Error("ABORTED"), { commit });
}
function lower(value, name = "", depth = 0) {
	if (depth > 5) throw TypeError("INVALID_ARGUMENT");
	if ([
		"parameters",
		"genesis",
		"priorTreeState"
	].includes(name)) {
		const bytes = copyBytes(value, name === "parameters" ? 256 : name === "genesis" ? 32 : 65536, "INVALID_ARGUMENT");
		return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	}
	if (name === "index") {
		if (typeof value !== "bigint" || value < 0n || value >= 1n << 88n) throw TypeError("INVALID_ARGUMENT");
		return value.toString();
	}
	if (typeof value === "string" && value.length > 14e4) throw TypeError("INVALID_ARGUMENT");
	if (value === null || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "number" && Number.isSafeInteger(value)) return value;
	if (Array.isArray(value)) {
		if (name !== "enabledPools" || value.length < 1 || value.length > 3) throw TypeError("INVALID_ARGUMENT");
		return value.map((v) => lower(v, "", depth + 1));
	}
	if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw TypeError("INVALID_ARGUMENT");
	const allowed = depth === 0 ? [
		"confirmations",
		"accountIndex",
		"accountId",
		"viewingKey",
		"birthday",
		"name",
		"viewOnly",
		"enabledPools",
		"request",
		"index",
		"signal"
	] : name === "confirmations" ? [
		"trusted",
		"untrusted",
		"allowZeroConfirmationShielding"
	] : name === "birthday" ? [
		"parameters",
		"genesis",
		"firstScanHeight",
		"priorTreeState",
		"recoverUntilExclusive",
		"source"
	] : name === "request" ? [
		"format",
		"transparent",
		"sapling",
		"ironwood"
	] : [];
	const result = Object.create(null);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowed.includes(key)) throw TypeError("INVALID_ARGUMENT");
		const property = Object.getOwnPropertyDescriptor(value, key);
		if (!property || !("value" in property)) throw TypeError("INVALID_ARGUMENT");
		if (depth === 0 && key === "signal") continue;
		result[key] = lower(property.value, key, depth + 1);
	}
	return result;
}
function scanFields(value, allowed) {
	if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw TypeError("INVALID_ARGUMENT");
	const result = Object.create(null);
	for (const key of Reflect.ownKeys(value)) {
		const property = Object.getOwnPropertyDescriptor(value, key);
		if (!allowed.includes(key) || !property || !("value" in property)) throw TypeError("INVALID_ARGUMENT");
		result[key] = property.value;
	}
	return result;
}
function scanHeight(value) {
	if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw TypeError("INVALID_ARGUMENT");
	return value;
}
function scanPoint(value) {
	const target = scanFields(value, ["height", "hash"]);
	if (!Number.isInteger(target.height) || target.height < 0 || target.height >= 4294967295) throw TypeError("INVALID_ARGUMENT");
	if (typeof target.hash !== "string" || !/^[0-9a-f]{64}$/.test(target.hash)) throw TypeError("INVALID_ARGUMENT");
	return target;
}
function scanHex(bytes) {
	const ascii = new Uint8Array(bytes.length * 2);
	for (let i = 0; i < bytes.length; i++) {
		const high = bytes[i] >>> 4, low = bytes[i] & 15;
		ascii[2 * i] = high + (high < 10 ? 48 : 87);
		ascii[2 * i + 1] = low + (low < 10 ? 48 : 87);
	}
	return new TextDecoder().decode(ascii);
}
function lowerProposal(args, operation) {
	const input = scanFields(args, [...operation === "proposal_create" || operation === "proposal_lookup_intent" ? [
		"revision",
		"accountId",
		"payments",
		"policy",
		"maxFee",
		"kind",
		"threshold",
		"fromAddresses",
		"idempotencyKey"
	] : operation === "proposal_get" ? ["operationId"] : [
		"afterSequence",
		"highWater",
		"limit"
	], "signal"]);
	delete input.signal;
	const text = (value, max) => {
		if (typeof value !== "string" || value.length > max) throw TypeError("INVALID_ARGUMENT");
		return value;
	};
	const decimal = (value) => {
		text(value, 20);
		if (!/^(0|[1-9][0-9]*)$/.test(value)) throw TypeError("INVALID_ARGUMENT");
		return value;
	};
	const money = (value) => {
		if (typeof value !== "bigint" || value < 0n || value > 2100000000000000n) throw TypeError("INVALID_ARGUMENT");
		return value.toString();
	};
	const list = (value, max, project, min = 1) => {
		if (!Array.isArray(value)) throw TypeError("INVALID_ARGUMENT");
		const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
		if (!Number.isInteger(length) || length < min || length > max || Reflect.ownKeys(value).length !== length + 1) throw TypeError("RESOURCE_LIMIT");
		return Array.from({ length }, (_, i) => {
			const d = Object.getOwnPropertyDescriptor(value, String(i));
			if (!d || !("value" in d)) throw TypeError("INVALID_ARGUMENT");
			return project(d.value);
		});
	};
	if (operation === "proposal_get") {
		if (!/^[0-9a-f]{64}$/.test(text(input.operationId, 64))) throw TypeError("INVALID_ARGUMENT");
		return input;
	}
	if (operation === "proposal_list") {
		decimal(input.afterSequence);
		if (Object.hasOwn(input, "highWater")) decimal(input.highWater);
		if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200) throw TypeError("INVALID_ARGUMENT");
		return input;
	}
	if (operation === "proposal_create" || Object.hasOwn(input, "revision")) text(input.revision, 128);
	if (operation === "proposal_lookup_intent" && !Object.hasOwn(input, "idempotencyKey")) throw TypeError("INVALID_ARGUMENT");
	text(input.accountId, 36);
	if (Object.hasOwn(input, "idempotencyKey") && text(input.idempotencyKey, 1024).length === 0) throw TypeError("INVALID_ARGUMENT");
	if (input.kind === "shield") {
		if (Object.hasOwn(input, "payments")) throw TypeError("INVALID_ARGUMENT");
		input.threshold = money(input.threshold);
		if (Object.hasOwn(input, "fromAddresses")) input.fromAddresses = list(input.fromAddresses, 256, (value) => text(value, 2048), 0);
	} else {
		if (Object.hasOwn(input, "kind") || Object.hasOwn(input, "threshold") || Object.hasOwn(input, "fromAddresses")) throw TypeError("INVALID_ARGUMENT");
		input.payments = list(input.payments, 16, (value) => {
			const payment = scanFields(value, [
				"to",
				"amount",
				"memo"
			]);
			text(payment.to, 2048);
			payment.amount = money(payment.amount);
			if (Object.hasOwn(payment, "memo") && payment.memo !== null) payment.memo = scanHex(copyBytes(payment.memo, 512, "INVALID_ARGUMENT", 0));
			return payment;
		});
	}
	if (Object.hasOwn(input, "maxFee")) input.maxFee = money(input.maxFee);
	const policy = scanFields(input.policy, [
		"spendPools",
		"transparent",
		"changePool",
		"feeRule",
		"confirmations",
		"expiry",
		"lockExpiryBlocks"
	]);
	policy.spendPools = list(policy.spendPools, 3, (value) => text(value, 16));
	for (const key of [
		"transparent",
		"changePool",
		"feeRule"
	]) text(policy[key], 32);
	policy.confirmations = scanFields(policy.confirmations, [
		"trusted",
		"untrusted",
		"allowZeroConfirmationShielding"
	]);
	scanHeight(policy.confirmations.trusted);
	scanHeight(policy.confirmations.untrusted);
	if (typeof policy.confirmations.allowZeroConfirmationShielding !== "boolean") throw TypeError("INVALID_ARGUMENT");
	policy.expiry = scanFields(policy.expiry, ["kind", "blocks"]);
	text(policy.expiry.kind, 16);
	if (Object.hasOwn(policy.expiry, "blocks")) scanHeight(policy.expiry.blocks);
	scanHeight(policy.lockExpiryBlocks);
	input.policy = policy;
	return input;
}
function lowerPayment(args, operation) {
	const keys = {
		payment_abandon: ["operationId"],
		payment_get: ["operationId"],
		payment_list: [
			"afterSequence",
			"highWater",
			"limit",
			"accountId"
		],
		payment_reconcile: [
			"operationId",
			"wallTimeMs",
			"policy"
		],
		payment_observe: [
			"operationId",
			"stepIndex",
			"observation",
			"wallTimeMs"
		],
		payment_attempt_begin: [
			"operationId",
			"stepIndex",
			"sourceId",
			"routeBinding",
			"mode",
			"origin",
			"wallTimeMs",
			"monotonicElapsedMs",
			"observationSequence",
			"policy",
			"maximum"
		],
		payment_attempt_finish: [
			"operationId",
			"attemptId",
			"outcome",
			"txid",
			"wallTimeMs",
			"diagnosticCode"
		],
		payment_recovery_position: ["afterSequence"]
	}[operation];
	const input = scanFields(args, [...keys, "signal"]);
	delete input.signal;
	const owned = (value, depth = 0) => {
		if (depth > 3) throw TypeError("INVALID_ARGUMENT");
		if (value === null || typeof value === "boolean") return value;
		if (typeof value === "string") {
			if (value.length > 256) throw TypeError("RESOURCE_LIMIT");
			return value;
		}
		if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
		if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw TypeError("INVALID_ARGUMENT");
		const keys = Reflect.ownKeys(value);
		if (keys.length > 16) throw TypeError("RESOURCE_LIMIT");
		const result = Object.create(null);
		for (const key of keys) {
			const d = Object.getOwnPropertyDescriptor(value, key);
			if (typeof key !== "string" || !d || !("value" in d)) throw TypeError("INVALID_ARGUMENT");
			result[key] = owned(d.value, depth + 1);
		}
		return result;
	};
	for (const key of Object.keys(input)) input[key] = owned(input[key]);
	if (operation === "payment_attempt_begin" && (!Number.isInteger(input.maximum) || input.maximum < 1 || input.maximum > 2097152)) throw TypeError("RESOURCE_LIMIT");
	return input;
}
function lowerScan(args, operation) {
	if (payments.has(operation)) return lowerPayment(args, operation);
	if (pczt.has(operation)) {
		const keys = operation === "fused_send" ? [
			"operationId",
			"proposalId",
			"reviewCommitment",
			"token",
			"spend",
			"output",
			"maximum"
		] : operation === "pczt_build" ? [
			"operationId",
			"proposalId",
			"reviewCommitment"
		] : operation === "pczt_import" ? [
			"operationId",
			"bytes",
			"maximum"
		] : operation === "pczt_prove" || operation === "pczt_finalize" ? [
			"operationId",
			"artifactId",
			"spend",
			"output",
			"maximum"
		] : operation === "finalized_get" ? ["operationId"] : ["operationId", "artifactId"];
		const input = scanFields(args, [...keys, "signal"]);
		delete input.signal;
		for (const key of keys) if (![
			"bytes",
			"maximum",
			"spend",
			"output",
			"token"
		].includes(key) && (key !== "artifactId" || operation !== "pczt_get_artifact" || Object.hasOwn(input, key)) && (typeof input[key] !== "string" || !/^[0-9a-f]{64}$/.test(input[key]))) throw TypeError("INVALID_ARGUMENT");
		if (operation === "fused_send" || operation === "pczt_prove" || operation === "pczt_finalize") {
			if (!Number.isInteger(input.maximum) || input.maximum < 1 || input.maximum > 4194304) throw TypeError("RESOURCE_LIMIT");
			for (const [key, size] of [["spend", 47958396], ["output", 3592860]]) {
				let length;
				try {
					length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength").get.call(input[key]);
				} catch {
					throw TypeError("INVALID_ARGUMENT");
				}
				if (length !== 0 && length !== size) throw TypeError("INVALID_ARGUMENT");
				input[key] = copyBytes(input[key], size, "INVALID_ARGUMENT", 0);
			}
		}
		if (operation === "fused_send" && (!Number.isInteger(input.token) || input.token < 0 || input.token > 4294967295)) throw TypeError("INVALID_ARGUMENT");
		if (operation === "pczt_import") {
			if (!Number.isInteger(input.maximum) || input.maximum < 1 || input.maximum > 4194304) throw TypeError("RESOURCE_LIMIT");
			let length;
			try {
				length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength").get.call(input.bytes);
			} catch {
				throw TypeError("INVALID_PCZT");
			}
			if (length > input.maximum) throw TypeError("RESOURCE_LIMIT");
			input.bytes = copyBytes(input.bytes, input.maximum, "INVALID_PCZT");
		}
		return input;
	}
	if (lifecycle.has(operation)) {
		const input = scanFields(args, operation === "account_remove" ? [
			"accountId",
			"acknowledge",
			"signal"
		] : operation === "account_viewing_key" ? ["accountId", "signal"] : [
			"accountId",
			"viewingKey",
			"signal"
		]);
		delete input.signal;
		for (const value of Object.values(input)) if (typeof value !== "string" || value.length > 14e4) throw TypeError("INVALID_ARGUMENT");
		return input;
	}
	if (proposals.has(operation)) return lowerProposal(args, operation);
	if (queries.has(operation)) {
		const inventory = operation === "wallet_notes" || operation === "wallet_utxos";
		const input = scanFields(args, inventory ? [
			"accountId",
			"cursor",
			"limit",
			"spendState",
			"locked",
			"uneconomic",
			"signal",
			...operation === "wallet_notes" ? ["pool"] : []
		] : operation === "wallet_history" ? [
			"accountId",
			"cursor",
			"limit",
			"signal"
		] : ["txid", "signal"]);
		delete input.signal;
		if (operation === "wallet_history" || inventory) {
			if (typeof input.accountId !== "string" || input.accountId.length !== 36) throw TypeError("INVALID_ARGUMENT");
			if (Object.hasOwn(input, "cursor") && (typeof input.cursor !== "string" || input.cursor.length > (inventory ? 2048 : 1024))) throw TypeError("INVALID_ARGUMENT");
			if (Object.hasOwn(input, "limit") && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200)) throw TypeError("INVALID_ARGUMENT");
		} else if (typeof input.txid !== "string" || !/^[0-9a-f]{64}$/.test(input.txid)) throw TypeError("INVALID_ARGUMENT");
		if (inventory) {
			for (const key of ["locked", "uneconomic"]) if (Object.hasOwn(input, key) && typeof input[key] !== "boolean") throw TypeError("INVALID_ARGUMENT");
			if (Object.hasOwn(input, "spendState") && ![
				"unspent",
				"pendingSpend",
				"spent",
				"unknown"
			].includes(input.spendState)) throw TypeError("INVALID_ARGUMENT");
			if (Object.hasOwn(input, "pool") && !["sapling", "ironwood"].includes(input.pool)) throw TypeError("INVALID_ARGUMENT");
		}
		return input;
	}
	if (enhancements.has(operation)) return lowerEnhancement(args, operation);
	if (operation === "scan_complete") {
		const input = scanFields(args, [
			"revision",
			"target",
			"treeState",
			"signal"
		]);
		delete input.signal;
		if (typeof input.revision !== "string" || input.revision.length > 128) throw TypeError("INVALID_ARGUMENT");
		input.target = scanPoint(input.target);
		input.treeState = scanHex(copyBytes(input.treeState, 65536, "RESOURCE_LIMIT"));
		return input;
	}
	const input = scanFields(args, [...operation === "scan_state" ? [] : operation === "scan_block_hash" ? ["height"] : operation === "scan_rewind" ? ["revision", "requestedPoint"] : operation === "scan_plan" ? ["target"] : [
		"target",
		"revision",
		"priorTreeState",
		"blocks"
	], "signal"]);
	delete input.signal;
	if (operation === "scan_state") return input;
	if (operation === "scan_block_hash") {
		input.height = scanHeight(input.height);
		return input;
	}
	if (operation !== "scan_plan" && (typeof input.revision !== "string" || input.revision.length > 128)) throw TypeError("INVALID_ARGUMENT");
	if (operation === "scan_rewind") {
		input.requestedPoint = scanPoint(input.requestedPoint);
		return input;
	}
	input.target = scanPoint(input.target);
	if (operation === "scan_ingest_batch") {
		input.priorTreeState = scanHex(copyBytes(input.priorTreeState, 65536, "INVALID_ARGUMENT"));
		const blocks = input.blocks;
		if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 16) throw TypeError("RESOURCE_LIMIT");
		if (Reflect.ownKeys(blocks).length !== blocks.length + 1) throw TypeError("INVALID_ARGUMENT");
		let remaining = 2097152;
		input.blocks = [];
		for (let i = 0; i < blocks.length; i++) {
			const property = Object.getOwnPropertyDescriptor(blocks, String(i));
			if (!property || !("value" in property)) throw TypeError("INVALID_ARGUMENT");
			const bytes = copyBytes(property.value, remaining, "RESOURCE_LIMIT");
			remaining -= bytes.length;
			input.blocks.push(scanHex(bytes));
		}
	}
	return input;
}
function lowerEnhancement(args, operation) {
	const input = scanFields(args, operation === "enhancement_requests" ? ["signal"] : [
		"revision",
		"request",
		"result",
		"signal"
	]);
	delete input.signal;
	if (operation === "enhancement_requests") return input;
	if (typeof input.revision !== "string" || input.revision.length > 128) throw TypeError("INVALID_ARGUMENT");
	const request = scanFields(input.request, [
		"kind",
		"txid",
		"address",
		"start",
		"endExclusive",
		"requestAt",
		"txStatus",
		"outputStatus"
	]);
	if (request.kind === "address") {
		scanFields(input.request, [
			"kind",
			"address",
			"start",
			"endExclusive",
			"requestAt",
			"txStatus",
			"outputStatus"
		]);
		if (typeof request.address !== "string" || request.address.length > 128 || !request.address.length || ![
			"mined",
			"mempool",
			"all"
		].includes(request.txStatus) || !["unspent", "all"].includes(request.outputStatus)) throw TypeError("INVALID_ARGUMENT");
		scanHeight(request.start);
		if (request.endExclusive !== null) scanHeight(request.endExclusive);
		if (request.requestAt !== null && (!Number.isSafeInteger(request.requestAt) || request.requestAt < 0)) throw TypeError("INVALID_ARGUMENT");
	} else {
		scanFields(input.request, ["kind", "txid"]);
		if (!["enhancement", "status"].includes(request.kind) || typeof request.txid !== "string" || !/^[0-9a-f]{64}$/.test(request.txid)) throw TypeError("INVALID_ARGUMENT");
	}
	input.request = request;
	const result = scanFields(input.result, [
		"transactions",
		"asOfHeight",
		"asOfHash",
		"complete",
		"status",
		"height"
	]);
	if (Object.hasOwn(result, "status")) {
		scanFields(input.result, ["status", "height"]);
		if (![
			"notRecognized",
			"notInMainChain",
			"mined"
		].includes(result.status)) throw TypeError("INVALID_ARGUMENT");
		if (result.status === "mined") scanHeight(result.height);
		else if (Object.hasOwn(result, "height")) throw TypeError("INVALID_ARGUMENT");
	} else {
		scanFields(input.result, request.kind === "address" ? [
			"transactions",
			"asOfHeight",
			"asOfHash",
			"complete"
		] : ["transactions"]);
		if (request.kind === "address" && typeof result.complete !== "boolean") throw TypeError("INVALID_ARGUMENT");
		if (Object.hasOwn(result, "asOfHeight")) scanHeight(result.asOfHeight);
		if (Object.hasOwn(result, "asOfHash") && (typeof result.asOfHash !== "string" || !/^[0-9a-f]{64}$/.test(result.asOfHash))) throw TypeError("INVALID_ARGUMENT");
		const unspent = request.kind === "address" && request.txStatus === "all" && request.outputStatus === "unspent" && request.endExclusive === null;
		if (unspent && result.complete !== true) throw TypeError("INVALID_ARGUMENT");
		const items = result.transactions;
		if (!Array.isArray(items) || items.length > (unspent ? 1e3 : 16) || Reflect.ownKeys(items).length !== items.length + 1) throw TypeError("RESOURCE_LIMIT");
		let remaining = 2097152, outputCount = 0;
		result.transactions = [];
		for (let i = 0; i < items.length; i++) {
			const property = Object.getOwnPropertyDescriptor(items, String(i));
			if (!property || !("value" in property)) throw TypeError("INVALID_ARGUMENT");
			const item = scanFields(property.value, [
				"txid",
				"bytes",
				"minedHeight",
				"unspentOutputs"
			]);
			if (item.minedHeight !== null) scanHeight(item.minedHeight);
			const bytes = copyBytes(item.bytes, remaining, "RESOURCE_LIMIT");
			remaining -= bytes.length;
			const lowered = {
				bytes: scanHex(bytes),
				minedHeight: item.minedHeight
			};
			if (Object.hasOwn(item, "txid")) {
				if (typeof item.txid !== "string" || !/^[0-9a-f]{64}$/.test(item.txid)) throw TypeError("INVALID_ARGUMENT");
				lowered.txid = item.txid;
			}
			if (Object.hasOwn(item, "unspentOutputs")) {
				const outputs = item.unspentOutputs;
				if (!Array.isArray(outputs) || (outputCount += outputs.length) > 1e3 || Reflect.ownKeys(outputs).length !== outputs.length + 1) throw TypeError("RESOURCE_LIMIT");
				lowered.unspentOutputs = [];
				for (let j = 0; j < outputs.length; j++) {
					const field = Object.getOwnPropertyDescriptor(outputs, String(j));
					if (!field || !("value" in field)) throw TypeError("INVALID_ARGUMENT");
					const output = scanFields(field.value, [
						"outputIndex",
						"script",
						"value"
					]);
					scanHeight(output.outputIndex);
					if (typeof output.value !== "bigint" || output.value < 0n || output.value > 2100000000000000n) throw TypeError("INVALID_ARGUMENT");
					const script = copyBytes(output.script, Math.min(remaining, 1e4), "RESOURCE_LIMIT");
					remaining -= script.length;
					lowered.unspentOutputs.push({
						outputIndex: output.outputIndex,
						script: scanHex(script),
						value: output.value.toString()
					});
				}
			}
			result.transactions.push(lowered);
		}
	}
	input.result = result;
	return input;
}
function lift(value) {
	if (Array.isArray(value)) return value.map(lift);
	if (value && typeof value === "object" && typeof value.index === "string") value.index = BigInt(value.index);
	return value;
}
function liftAmounts(value) {
	if (value === null) return null;
	for (const [key, amount] of Object.entries(value)) if ([
		"total",
		"spendable",
		"locked",
		"changePendingConfirmation",
		"pendingSpendability",
		"uneconomic",
		"observedTotal"
	].includes(key)) value[key] = BigInt(amount);
	else if (amount && typeof amount === "object") liftAmounts(amount);
	return value;
}
function viewsForStorage(storage) {
	const { generation, instance } = storage;
	let poisoned = false;
	return Object.freeze({
		generation,
		instance,
		bindSigner: storage.bindSigner,
		unbindSigner: storage.unbindSigner,
		call(token, owner, operation, args = {}, seed, mnemonic, passphrase) {
			if (poisoned) throw Error("DOMAIN_INVALID");
			let signal, input, ownedPczt, pcztOperationId, pcztMaximum, proof;
			try {
				storage.binding(token, owner);
				if (!operations.has(operation) && !scans.has(operation)) throw TypeError("INVALID_ARGUMENT");
				const descriptor = Object.getOwnPropertyDescriptor(args, "signal");
				if (descriptor && !("value" in descriptor)) throw TypeError("INVALID_ARGUMENT");
				signal = descriptor?.value;
				abort(signal, "none");
				const lowered = scans.has(operation) ? lowerScan(args, operation) : lower(args);
				if (operation === "pczt_import") {
					ownedPczt = lowered.bytes;
					pcztOperationId = lowered.operationId;
					pcztMaximum = lowered.maximum;
					delete lowered.bytes;
				}
				if (operation === "fused_send" || operation === "pczt_prove" || operation === "pczt_finalize") {
					proof = { ...lowered };
					delete lowered.spend;
					delete lowered.output;
				}
				input = JSON.stringify(lowered);
				abort(signal, "none");
			} catch (error) {
				if (scans.has(operation)) throw Object.assign(error instanceof Error ? error : Error("INVALID_ARGUMENT"), { commit: "none" });
				throw error;
			}
			let result;
			let ownedSeed, ownedMnemonic, ownedPassphrase;
			try {
				if ([
					"account_import_mnemonic",
					"account_import_mnemonic_signer",
					"account_create_mnemonic_signer"
				].includes(operation)) {
					if (seed !== void 0) throw "INVALID_ARGUMENT";
					try {
						ownedMnemonic = copyBytes(mnemonic, 4096, "INVALID_ARGUMENT");
						ownedPassphrase = passphrase === void 0 ? new Uint8Array() : copyBytes(passphrase, 65536, "INVALID_ARGUMENT", 0);
					} catch {
						throw "INVALID_ARGUMENT";
					}
					result = storage.run(() => operation === "account_import_mnemonic" ? views_mnemonic_call(token, input, ownedMnemonic, ownedPassphrase) : signer_create_account(token, operation === "account_create_mnemonic_signer" ? "account_create_hd" : "account_import_hd", input, ownedMnemonic, ownedPassphrase));
				} else if (mnemonic !== void 0 || passphrase !== void 0) throw "INVALID_ARGUMENT";
				else if (operation === "account_import_hd" || operation === "account_create_hd") {
					try {
						ownedSeed = copyBytes(seed, 64, "INVALID_ARGUMENT");
					} catch {
						throw "INVALID_ARGUMENT";
					}
					if (ownedSeed.length !== 32 && ownedSeed.length !== 64) throw "INVALID_ARGUMENT";
					result = storage.run(() => views_seed_call(token, operation, input, ownedSeed));
				} else {
					if (seed !== void 0) throw "INVALID_ARGUMENT";
					result = storage.run(() => payments.has(operation) ? payment_call(token, operation, input) : operation === "finalized_get" ? finalized_get(token, JSON.parse(input).operationId) : operation === "fused_send" ? fused_send_call(token, proof.operationId, proof.proposalId, proof.reviewCommitment, proof.token, proof.spend, proof.output, proof.maximum) : operation === "pczt_finalize" ? pczt_finalize_call(token, proof.operationId, proof.artifactId, proof.spend, proof.output, proof.maximum) : operation === "pczt_prove" ? pczt_prove_call(token, proof.operationId, proof.artifactId, proof.spend, proof.output, proof.maximum) : operation === "pczt_import" ? pczt_import_call(token, pcztOperationId, ownedPczt, pcztMaximum) : pczt.has(operation) ? pczt_build_call(token, operation, input) : lifecycle.has(operation) ? account_lifecycle_call(token, operation, input) : proposals.has(operation) ? proposal_call(token, operation, input) : queries.has(operation) ? query_call(token, operation, input) : enhancements.has(operation) ? enhancement_call(token, operation, input) : syncs.has(operation) ? sync_call(token, operation, input) : scans.has(operation) ? scan_call(token, operation, input) : views_call(token, operation, input));
				}
			} catch (error) {
				if (typeof error !== "string") {
					poisoned = true;
					throw Error("DOMAIN_INVALID");
				}
				throw Object.assign(Error(error), scans.has(operation) ? { commit: "none" } : {});
			} finally {
				ownedSeed?.fill(0);
				ownedMnemonic?.fill(0);
				ownedPassphrase?.fill(0);
			}
			const value = lift(JSON.parse(result));
			if (operation === "account_import_mnemonic_signer" || operation === "account_create_mnemonic_signer") {
				if (signal !== void 0 && aborted.call(signal)) {
					storage.run(() => signer_release(value.signerToken));
					throw Object.assign(Error("ABORTED"), {
						commit: "committed",
						account: value.account
					});
				}
			}
			abort(signal, writes.has(operation) ? "committed" : "none");
			if ((pczt.has(operation) || operation === "payment_attempt_begin") && value !== null) {
				for (const row of operation === "finalized_get" || operation === "fused_send" ? value.transactions : [value]) {
					const hex = row.bytes;
					row.bytes = new Uint8Array(hex.length / 2);
					for (let i = 0; i < row.bytes.length; i++) row.bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
				}
				for (const output of value.outputs ?? []) {
					output.amount = BigInt(output.amount);
					if (output.memo !== null) output.memo = Uint8Array.from(output.memo.match(/../g) ?? [], (hex) => parseInt(hex, 16));
				}
			}
			if (proposals.has(operation) && operation !== "proposal_list" && value !== null) {
				value.totalFee = BigInt(value.totalFee);
				for (const step of value.steps) {
					step.fee = BigInt(step.fee);
					for (const input of step.inputs) input.value = BigInt(input.value);
					for (const output of step.outputs) {
						output.amount = BigInt(output.amount);
						if (output.memo !== null) output.memo = Uint8Array.from(output.memo.match(/../g) ?? [], (hex) => parseInt(hex, 16));
					}
				}
			}
			if (operation === "account_balance") value.amounts = liftAmounts(value.amounts);
			if (queries.has(operation) && value !== null) {
				for (const row of value.items ?? value.accounts) for (const key of operation === "wallet_notes" || operation === "wallet_utxos" ? ["value"] : [
					"balanceDelta",
					"totalReceived",
					"totalSpent",
					"fee"
				]) if (row[key] !== null) row[key] = BigInt(row[key]);
				if (operation === "wallet_transaction") {
					const bytes = (hex) => {
						const result = new Uint8Array(hex.length / 2);
						for (let i = 0; i < result.length; i++) result[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
						return result;
					};
					if (value.raw !== null) value.raw = bytes(value.raw);
					for (const output of value.outputs) {
						if (output.value !== null) output.value = BigInt(output.value);
						if (output.memo.kind === "binary") output.memo.bytes = bytes(output.memo.bytes);
					}
				}
			}
			return value;
		},
		close(token, owner) {
			if (poisoned) throw Error("DOMAIN_INVALID");
			storage.close(token, owner);
		}
	});
}
//#endregion
//#region network.mjs
function consensusContext(parametersFormat, parameters, height) {
	if (parametersFormat !== "zcash-js-network/1") throw new TypeError("unsupported network format");
	if (!Number.isInteger(height) || height < 0 || height > 4294967295) throw new TypeError("invalid height");
	const branchId = consensus_branch(parametersFormat, copyBytes(parameters, 256, "invalid parameters"), height);
	return Object.freeze({
		height,
		branchId
	});
}
//#endregion
//#region transaction.mjs
function decodeTransaction(raw, branch) {
	if (typeof branch !== "number" || !Number.isInteger(branch) || branch < 0 || branch > 4294967295) throw new TypeError("invalid branch");
	const bytes = copyBytes(raw, 2097152, "invalid transaction bytes");
	const txid = transaction_id(bytes, branch);
	const display = Array.from(txid).reverse().map((b) => b.toString(16).padStart(2, "0")).join("");
	return Object.freeze({
		bytes,
		txid,
		display
	});
}
//#endregion
//#region runtime/entry.mjs
const runtimeIdentity = {
	"abiVersion": "checked-bindgen-0.2.128/1",
	"buildSha256": "56a964e1236ce4d3446108d7362b750c63b27eff9b243abdd8679b1be7a58f8e",
	"contractRevision": "zakura-private-wallet/1",
	"dependencyGraphSha256": "5a7ccbebc967e1744285a92c73a883c5556804bf082ffc306b12db53086f721d",
	"memory": {
		"initialPages": 321,
		"maximumPages": 4096,
		"shared": false
	},
	"mode": "baseline",
	"schemas": {
		"database": "wallet-storage/7",
		"hostServices": {
			"browserOpfs": "sync-access-handle/1",
			"nodeFilesystem": "linux-flock/1",
			"storage": "scalar-vfs/1"
		},
		"networkParameters": "zcash-js-network/1",
		"operations": {
			"consensusContext": "1",
			"decodeTransaction": "1",
			"walletEnhancement": "2",
			"walletFused": "1",
			"walletPayments": "2",
			"walletPczt": "4",
			"walletProposals": "2",
			"walletQueries": "2",
			"walletScan": "1",
			"walletSigner": "2",
			"walletSync": "2",
			"walletViews": "6"
		},
		"protobuf": "not-used"
	}
};
//#endregion
export { consensusContext, decodeTransaction, initializeWalletRuntime, runtimeIdentity, viewsForStorage };
