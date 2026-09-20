//#region dist/src/errors.js
const errors = new WeakSet();
function isZcashError(value) {
	return typeof value === "object" && value !== null && errors.has(value);
}
function failure(code, stage, recovery, message, retryable = false, syncStatus, paymentState, operationId = paymentState?.operationId) {
	const error = Object.assign(new Error(message), {
		name: "ZcashError",
		code,
		stage,
		recovery,
		retryable,
		...syncStatus === void 0 ? {} : { syncStatus },
		...operationId === void 0 ? {} : { operationId },
		...paymentState === void 0 ? {} : { paymentState }
	});
	errors.add(error);
	return Object.freeze(error);
}
function invalidArgument() {
	return failure("INVALID_ARGUMENT", "validation", "correct-input", "Invalid argument.");
}
//#endregion
//#region dist/src/wallet/session.js
var WalletSession = class {
	owner;
	tail = Promise.resolve();
	closing;
	completions = new WeakMap();
	generation;
	instance;
	constructor(owner) {
		this.owner = owner;
		this.generation = owner.generation;
		this.instance = owner.instance;
	}
	completion(error) {
		return this.completions.get(error);
	}
	invoke(operation, args) {
		args ??= {};
		if (this.closing) {
			const error = failure("CLOSED", "runtime", "none", "Wallet session is closed.");
			this.completions.set(error, "none");
			return Promise.reject(error);
		}
		const result = this.tail.then(() => {
			try {
				if (operation === "signer_bind" || operation === "signer_unbind") {
					const input = args;
					const method = operation === "signer_bind" ? this.owner.bindSigner : this.owner.unbindSigner;
					if (!method) throw failure("METHOD_NOT_SUPPORTED", "account", "configure", "Native signer binding unavailable.");
					return Reflect.apply(method, this.owner, [input.token, input.accountId]);
				}
				if (operation === "account_import_mnemonic_signer" || operation === "account_create_mnemonic_signer") {
					const { mnemonic, passphrase, ...input } = args;
					return this.owner.call(this.generation, this.instance, operation, input, void 0, mnemonic, passphrase);
				}
				return this.owner.call(this.generation, this.instance, operation, args);
			} catch (error) {
				if (typeof error === "object" && error !== null && !this.completions.has(error)) {
					let commit;
					try {
						commit = Object.getOwnPropertyDescriptor(error, "commit")?.value;
					} catch {}
					this.completions.set(error, commit === "none" || commit === "committed" ? commit : "unknown");
				}
				throw error;
			}
		});
		this.tail = result.catch(() => void 0);
		return result;
	}
	close() {
		this.closing ??= this.tail.then(() => this.owner.close(this.generation, this.instance));
		return this.closing;
	}
};
//#endregion
//#region dist/src/clients/owned-plumbing.js
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag).get;
Object.getOwnPropertyDescriptor(typedArray, "buffer").get;
Object.getOwnPropertyDescriptor(typedArray, "byteOffset").get;
Object.getOwnPropertyDescriptor(typedArray, "byteLength").get;
Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
function recordFields(value, keys) {
	if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalidArgument();
	const output = Object.create(null);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !keys.includes(key)) throw invalidArgument();
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) throw invalidArgument();
		output[key] = descriptor.value;
	}
	return output;
}
function copyRecord(value, keys) {
	try {
		if (Array.isArray(value)) throw invalidArgument();
		return recordFields(value, keys);
	} catch {
		throw invalidArgument();
	}
}
//#endregion
//#region dist/src/wallet/commands.js
function command(select, stage, flags = {}) {
	return {
		select,
		stage,
		...flags
	};
}
const walletCommands = {
	payment_abandon: {
		stage: "observation",
		write: true
	},
	payment_get: { stage: "observation" },
	payment_list: { stage: "observation" },
	payment_reconcile: {
		stage: "observation",
		write: true
	},
	payment_observe: {
		stage: "observation",
		write: true
	},
	payment_attempt_begin: {
		stage: "submission",
		write: true
	},
	payment_attempt_finish: {
		stage: "submission",
		write: true
	},
	payment_recovery_position: {
		stage: "observation",
		write: true
	},
	fused_send: {
		stage: "finalization",
		write: true
	},
	pczt_finalize: {
		stage: "finalization",
		write: true
	},
	finalized_get: { stage: "account" },
	account_viewing_key: { stage: "account" },
	account_remove: {
		stage: "account",
		write: true
	},
	account_check_key: { stage: "account" },
	account_import: {
		stage: "account",
		write: true
	},
	account_list: { stage: "account" },
	account_get: { stage: "account" },
	address_current: { stage: "address" },
	address_next: {
		stage: "address",
		write: true
	},
	address_list: { stage: "address" },
	address_at: {
		stage: "address",
		write: true
	},
	scan_plan: {
		stage: "sync",
		write: true
	},
	scan_ingest_batch: {
		stage: "sync",
		write: true
	},
	scan_state: { stage: "sync" },
	scan_block_hash: { stage: "sync" },
	scan_rewind: {
		stage: "sync",
		write: true
	},
	scan_complete: {
		stage: "sync",
		write: true
	},
	enhancement_requests: { stage: "sync" },
	enhancement_apply: {
		stage: "sync",
		write: true
	},
	account_balance: { stage: "query" },
	close: { stage: "runtime" },
	wallet_notes: { stage: "query" },
	wallet_utxos: { stage: "query" },
	wallet_history: { stage: "query" },
	wallet_transaction: { stage: "query" },
	account_import_mnemonic_signer: {
		stage: "account",
		write: true,
		secret: true
	},
	account_create_mnemonic_signer: {
		stage: "account",
		write: true,
		secret: true
	},
	pczt_prove: {
		stage: "proving",
		write: true
	},
	pczt_import: {
		stage: "proposal",
		write: true
	},
	pczt_build: {
		stage: "proposal",
		write: true
	},
	pczt_get_artifact: { stage: "proposal" },
	proposal_lookup_intent: {
		stage: "proposal",
		proposal: true
	},
	proposal_create: {
		stage: "proposal",
		write: true,
		proposal: true
	},
	proposal_get: {
		stage: "proposal",
		proposal: true
	},
	proposal_list: {
		stage: "proposal",
		proposal: true
	},
	signer_bind: {
		stage: "account",
		signer: true
	},
	signer_unbind: {
		stage: "account",
		signer: true
	}
};
function signerToken(value) {
	const { token } = copyRecord(value, ["token"]);
	if (typeof token !== "number") throw invalidArgument();
	return token;
}
function signerAuthorization(value) {
	const dto = copyRecord(value, [
		"token",
		"format",
		"parameters",
		"genesis",
		"height",
		"branch",
		"bytes",
		"maximum"
	]);
	if (typeof dto.token !== "number" || typeof dto.format !== "string" || !(dto.parameters instanceof Uint8Array) || !(dto.genesis instanceof Uint8Array) || !(dto.bytes instanceof Uint8Array) || typeof dto.height !== "number" || typeof dto.branch !== "number" || typeof dto.maximum !== "number") throw invalidArgument();
	return {
		token: dto.token,
		format: dto.format,
		parameters: dto.parameters,
		genesis: dto.genesis,
		height: dto.height,
		branch: dto.branch,
		bytes: dto.bytes,
		maximum: dto.maximum
	};
}
const signerCommands = {
	signer_capabilities: command((s) => (args) => s.capabilities(signerToken(args)), "account", { signer: true }),
	signer_authorize: command((s) => (args) => {
		const dto = signerAuthorization(args);
		return s.authorize(dto.token, dto.format, dto.parameters, dto.genesis, dto.height, dto.branch, dto.bytes, dto.maximum);
	}, "authorization", { signer: true }),
	signer_describe: command((s) => (args) => s.describe(signerToken(args)), "account", { signer: true }),
	signer_release: command((s) => (args) => s.release(signerToken(args)), "account", { signer: true }),
	close: command(() => () => {}, "runtime")
};
const commands = {
	...walletCommands,
	...signerCommands
};
const mnemonicCommand = (value) => typeof value === "string" && Object.hasOwn(commands, value) && commands[value].secret === true;
//#endregion
//#region dist/src/wallet/worker.js
function clearMnemonic(value) {
	if (!value || typeof value !== "object") return;
	const args = value;
	for (const key of ["mnemonic", "passphrase"]) if (args?.[key] instanceof Uint8Array) args[key].fill(0);
}
const nativeCodes = {
	NOT_FINALIZED: "NOT_FINALIZED",
	PAYMENT_BLOCKED: "PAYMENT_BLOCKED",
	TRANSACTION_EXPIRED: "TRANSACTION_EXPIRED",
	SUBMISSION_REJECTED: "SUBMISSION_REJECTED",
	SUBMISSION_UNKNOWN: "SUBMISSION_UNKNOWN",
	PROVING_MATERIAL_REQUIRED: "PROVING_MATERIAL_REQUIRED",
	PROOF_FAILED: "PROOF_FAILED",
	ASSET_INTEGRITY: "ASSET_INTEGRITY",
	ASSET_UNAVAILABLE: "ASSET_UNAVAILABLE",
	NOTHING_TO_SHIELD: "NOTHING_TO_SHIELD",
	IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
	INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
	FEE_LIMIT_EXCEEDED: "FEE_LIMIT_EXCEEDED",
	STALE_PROPOSAL: "STALE_PROPOSAL",
	INPUT_LOCKED: "INPUT_LOCKED",
	PCZT_MULTI_STEP_UNSUPPORTED: "PCZT_MULTI_STEP_UNSUPPORTED",
	OPERATION_NOT_FOUND: "OPERATION_NOT_FOUND",
	INVALID_PCZT: "INVALID_PCZT",
	ROLE_PRECONDITION: "ROLE_PRECONDITION",
	UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
	UNSUPPORTED_POOL: "UNSUPPORTED_POOL",
	PCZT_ASSOCIATION_MISMATCH: "PCZT_ASSOCIATION_MISMATCH",
	RESOURCE_LIMIT: "RESOURCE_LIMIT",
	STALE_REVISION: "CURSOR_STALE",
	CURSOR_STALE: "CURSOR_STALE",
	RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
	INVALID_MNEMONIC: "INVALID_MNEMONIC",
	ENTROPY_UNAVAILABLE: "ENTROPY_UNAVAILABLE",
	SIGNER_MISMATCH: "ACCOUNT_KEY_MISMATCH",
	ACCOUNT_INDEX_EXHAUSTED: "RESOURCE_LIMIT",
	METHOD_NOT_SUPPORTED: "METHOD_NOT_SUPPORTED",
	CHAIN_MISMATCH: "PROTOCOL_MISMATCH",
	SCAN_FAILED: "PROTOCOL_MISMATCH",
	INVALID_ARGUMENT: "INVALID_ARGUMENT",
	INVALID_VIEWING_KEY: "INVALID_ARGUMENT",
	INVALID_BIRTHDAY: "INVALID_ARGUMENT",
	INCOHERENT_BIRTHDAY: "NETWORK_MISMATCH",
	NETWORK_MISMATCH: "NETWORK_MISMATCH",
	ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
	ACCOUNT_COLLISION: "ACCOUNT_COLLISION",
	INCOMING_ONLY_WALLET_UNSUPPORTED: "INCOMING_ONLY_WALLET_UNSUPPORTED",
	RECEIVER_UNAVAILABLE: "RECEIVER_UNAVAILABLE",
	ADDRESS_UNAVAILABLE: "RECEIVER_UNAVAILABLE",
	ADDRESS_INDEX_REUSE: "ADDRESS_ALREADY_EXPOSED",
	ADDRESS_GAP_LIMIT: "DISCOVERY_RANGE_UNSAFE",
	SYNC_REQUIRED: "SYNC_REQUIRED",
	STORAGE_ERROR: "STORAGE_ERROR",
	STORAGE_BUSY: "STORAGE_BUSY",
	STORAGE_CLOSE_FAILED: "STORAGE_ERROR",
	INVALID_ACCOUNT_METADATA: "STORAGE_ERROR",
	INVALID_STORED_ADDRESS: "STORAGE_ERROR",
	VIEWING_SCHEMA_REQUIRED: "MIGRATION_REQUIRED",
	POOL_UNAVAILABLE: "UNSUPPORTED_POOL",
	UNSUPPORTED_VIEWING_COMPONENT: "UNSUPPORTED_POOL",
	UNSUPPORTED_POOL_PROJECTION: "UNSUPPORTED_POOL",
	UNSUPPORTED_ADDRESS_FORMAT: "INVALID_ARGUMENT",
	STALE_HANDLE: "STALE_HANDLE",
	ABORTED: "ABORTED",
	CLOSED: "CLOSED"
};
[...Object.values(nativeCodes)];
function errorInfo(error, command) {
	let code;
	if (isZcashError(error)) code = error.code;
	else {
		let name = error;
		try {
			if (typeof error === "object" && error !== null) name = Object.getOwnPropertyDescriptor(error, "message")?.value;
		} catch {}
		if (typeof name === "string" && Object.hasOwn(nativeCodes, name)) code = nativeCodes[name];
	}
	const definition = commands[command];
	if (definition.proposal && code === "CURSOR_STALE") code = "STALE_PROPOSAL";
	const invalid = code === void 0 || code === "STALE_HANDLE" && !definition.signer;
	code ??= "RUNTIME_UNAVAILABLE";
	const storage = [
		"STORAGE_ERROR",
		"STORAGE_BUSY",
		"MIGRATION_REQUIRED"
	].includes(code);
	const sync = definition.stage === "sync";
	const stage = invalid ? "runtime" : storage ? "storage" : code === "INVALID_ARGUMENT" ? "validation" : definition.stage;
	const recovery = code === "RESOURCE_LIMIT" ? "configure" : invalid || storage ? "reopen" : code === "SYNC_REQUIRED" || sync && ["CURSOR_STALE", "PROTOCOL_MISMATCH"].includes(code) ? "sync" : code === "STALE_PROPOSAL" ? "review-new-proposal" : code === "ABORTED" || code === "CLOSED" ? "none" : "correct-input";
	return {
		error: {
			code,
			stage,
			recovery,
			retryable: false,
			message: "Wallet operation failed."
		},
		invalid
	};
}
function installWalletWorker(owner, port, ownerInvalid = () => false, signers) {
	const session = owner ? new WalletSession(owner) : void 0;
	const calls = {};
	if (signers) for (const [name, definition] of Object.entries(signerCommands)) calls[name] = definition.select(signers);
	let lastId = 0, closed = false;
	port.onmessage = async ({ data: raw }) => {
		const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : void 0;
		let command = "close";
		try {
			if (!data || typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id <= lastId || typeof data.command !== "string" || !Object.hasOwn(session ? walletCommands : signerCommands, data.command) || typeof data.args !== "object" || data.args === null || Array.isArray(data.args) || Object.keys(data).sort().join(",") !== "args,command,id") throw failure("INVALID_ARGUMENT", "validation", "correct-input", "Invalid wallet request.");
			lastId = data.id;
			command = data.command;
			if (closed) throw failure("CLOSED", "runtime", "none", "Wallet session is closed.");
			if (command === "close") closed = true;
			const value = session ? command === "close" ? await session.close() : await session.invoke(command, data.args) : await Reflect.apply(calls[command], calls, [data.args]);
			port.postMessage({
				id: data.id,
				completion: commands[command].write ? "committed" : "none",
				invalid: false,
				outcome: {
					ok: true,
					value
				}
			});
		} catch (error) {
			const info = errorInfo(error, command);
			info.invalid ||= ownerInvalid();
			if (info.invalid) closed = true;
			const completion = session ? typeof error === "object" && error !== null ? session.completion(error) ?? "unknown" : "unknown" : info.invalid ? "unknown" : "none";
			port.postMessage({
				id: data?.id,
				completion,
				invalid: info.invalid,
				outcome: {
					ok: false,
					error: info.error
				}
			});
		} finally {
			if (mnemonicCommand(data?.command)) clearMnemonic(data?.args);
		}
	};
	port.start();
}
//#endregion
//#region dist/src/runtime/wallet-profile.js
const walletProfile = {
	contractRevision: "zakura-private-wallet/1",
	abiVersion: "checked-bindgen-0.2.128/1",
	schemas: {
		operations: {
			walletViews: "6",
			walletSigner: "2",
			walletProposals: "2",
			walletPczt: "4",
			walletPayments: "2",
			walletFused: "1",
			walletScan: "1",
			walletSync: "2",
			walletEnhancement: "2",
			walletQueries: "2",
			consensusContext: "1",
			decodeTransaction: "1"
		},
		protobuf: "not-used",
		networkParameters: "zcash-js-network/1",
		database: "wallet-storage/7",
		hostServices: {
			nodeFilesystem: "linux-flock/1",
			browserOpfs: "sync-access-handle/1",
			storage: "scalar-vfs/1"
		}
	}
};
function sameRecord(a, b) {
	if (a === b) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	const left = Object.keys(a), right = Object.keys(b);
	return left.length === right.length && left.every((key) => Object.hasOwn(b, key) && sameRecord(a[key], b[key]));
}
//#endregion
//#region dist/src/runtime/wallet-worker.js
const node = typeof globalThis.process?.versions?.node === "string";
const threads = node ? await import("node:worker_threads") : void 0;
const control = node ? threads.parentPort : globalThis;
let phase = "new";
let api;
let runtime;
let signerPort = false;
let initializationId;
function executableUrl(value) {
	return typeof value === "string" && value.startsWith(node ? "file:" : "blob:");
}
function isPort(value) {
	return value instanceof (node ? threads.MessagePort : MessagePort);
}
function failed(code) {
	throw new Error(code);
}
function openRequest(data) {
	const storage = data.storage;
	if (!storage || typeof storage !== "object" || Array.isArray(storage)) failed("INVALID_ARGUMENT");
	const record = storage;
	let location;
	if (record.kind === "memory") {
		if (Object.keys(record).length !== 1) failed("INVALID_ARGUMENT");
		location = { kind: "memory" };
	} else {
		if (record.kind !== (node ? "node-filesystem" : "browser-opfs")) failed("INVALID_ARGUMENT");
		const path = node ? record.path : record.name;
		if (typeof path !== "string" || !executableUrl(data.hostUrl)) failed("INVALID_ARGUMENT");
		location = {
			kind: "persistent",
			location: path,
			hostUrl: data.hostUrl
		};
	}
	if (!isPort(data.port) || !(data.genesis instanceof Uint8Array) || data.genesis.length !== 32 || !(data.parameters instanceof Uint8Array) || data.parameters.length < 1 || data.parameters.length > 256 || typeof data.parametersFormat !== "string") failed("INVALID_ARGUMENT");
	return {
		type: "open",
		id: data.id,
		storage: location,
		port: data.port,
		parametersFormat: data.parametersFormat,
		parameters: data.parameters,
		genesis: data.genesis
	};
}
function admit(data) {
	switch (data.type) {
		case "compute-initialize":
			if (phase !== "new") failed("PROTOCOL_MISMATCH");
			if (!executableUrl(data.moduleUrl) || !(data.module instanceof WebAssembly.Module) || !(data.memory instanceof WebAssembly.Memory) || !(data.memory.buffer instanceof SharedArrayBuffer) || typeof data.index !== "number" || !Number.isSafeInteger(data.index) || data.index < 0 || data.index >= 8) failed("PROTOCOL_MISMATCH");
			return {
				type: data.type,
				moduleUrl: data.moduleUrl,
				module: data.module,
				memory: data.memory,
				index: data.index
			};
		case "initialize":
			if (phase !== "new") failed("PROTOCOL_MISMATCH");
			if (!executableUrl(data.moduleUrl) || !(data.wasm instanceof Uint8Array)) failed("INVALID_ARGUMENT");
			return {
				type: data.type,
				id: data.id,
				moduleUrl: data.moduleUrl,
				wasm: data.wasm,
				expected: data.expected,
				maxMemoryBytes: data.maxMemoryBytes,
				workers: data.workers
			};
		case "pool-build":
			if (phase !== "starting" || initializationId === void 0) failed("PROTOCOL_MISMATCH");
			return { type: data.type };
		case "signers":
			if (phase !== "ready" || signerPort || !isPort(data.port)) failed("PROTOCOL_MISMATCH");
			return {
				type: data.type,
				id: data.id,
				port: data.port
			};
		case "open":
			if (phase !== "ready") failed("PROTOCOL_MISMATCH");
			return openRequest(data);
		default: return failed("PROTOCOL_MISMATCH");
	}
}
function checkIdentity(expected, maxMemoryBytes) {
	const identity = api.runtimeIdentity;
	if (!identity || !sameRecord(walletProfile, {
		contractRevision: identity.contractRevision,
		abiVersion: identity.abiVersion,
		schemas: identity.schemas
	}) || !sameRecord(expected, {
		contractRevision: identity.contractRevision,
		abiVersion: identity.abiVersion,
		schemas: identity.schemas,
		buildSha256: identity.buildSha256,
		dependencyGraphSha256: identity.dependencyGraphSha256,
		mode: identity.mode
	})) failed("PROTOCOL_MISMATCH");
	if (!["baseline", "threaded"].includes(identity.mode) || identity.memory?.shared !== (identity.mode === "threaded") || identity.memory.maximumPages !== 4096 || !Number.isSafeInteger(identity.memory.initialPages) || identity.memory.initialPages < 1 || identity.memory.initialPages > identity.memory.maximumPages) failed("PROTOCOL_MISMATCH");
	if (typeof maxMemoryBytes !== "number" || !Number.isSafeInteger(maxMemoryBytes) || maxMemoryBytes < identity.memory.maximumPages * 65536) failed("RESOURCE_LIMIT");
	return identity;
}
async function initialize(request) {
	phase = "starting";
	api = await import(request.moduleUrl);
	const identity = checkIdentity(request.expected, request.maxMemoryBytes);
	if (identity.mode === "threaded") {
		const { workers, id } = request;
		if (typeof workers !== "number" || !Number.isSafeInteger(workers) || workers < 1 || workers > 8) failed("RESOURCE_LIMIT");
		if (typeof id !== "number" || !Number.isSafeInteger(id)) failed("PROTOCOL_MISMATCH");
		initializationId = id;
		const pool = api.prepareThreaded(request.wasm, workers);
		request.wasm.fill(0);
		control.postMessage({
			type: "pool",
			id,
			module: pool.module,
			memory: pool.memory
		});
		return;
	}
	runtime = api.initializeWalletRuntime(request.wasm);
	request.wasm.fill(0);
	phase = "ready";
	control.postMessage({
		type: "ready",
		identity,
		id: request.id
	});
}
async function initializeCompute(request) {
	phase = "starting";
	api = await import(request.moduleUrl);
	api.enterThreaded(request.module, request.memory, request.index, () => control.postMessage({
		type: "compute-loaded",
		index: request.index
	}));
	failed("RUNTIME_UNAVAILABLE");
}
async function acquireStorage(storage) {
	if (node) {
		const fs = await import("node:fs");
		try {
			fs.mkdirSync(storage.location, { mode: 448 });
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
	return (await import(storage.hostUrl)).acquire(storage.location, { create: true });
}
const knownFailures = new Set([
	"INVALID_ARGUMENT",
	"PROTOCOL_MISMATCH",
	"RESOURCE_LIMIT",
	"NETWORK_MISMATCH",
	"SCHEMA_MISMATCH",
	"VIEWING_SCHEMA_REQUIRED"
]);
function failureInfo(error, fallback) {
	let tag, code = fallback;
	try {
		tag = typeof error === "string" ? error : Object.getOwnPropertyDescriptor(error, "message")?.value;
	} catch {}
	try {
		if (Object.getOwnPropertyDescriptor(error, "code")?.value === "EBUSY" || error instanceof DOMException && error.name === "NoModificationAllowedError") code = "STORAGE_BUSY";
	} catch {}
	const known = typeof tag === "string" && knownFailures.has(tag);
	if (known && typeof tag === "string") code = tag;
	return {
		code,
		known
	};
}
async function openStorage(request) {
	let backend, owner;
	let nativeOpening = false, fallback = "RUNTIME_UNAVAILABLE";
	try {
		api.consensusContext(request.parametersFormat, request.parameters, 0);
		fallback = "STORAGE_ERROR";
		const { storage, parametersFormat, parameters, genesis } = request;
		if (storage.kind === "persistent") backend = await acquireStorage(storage);
		nativeOpening = true;
		const opened = storage.kind === "memory" ? runtime.openMemory(parametersFormat, parameters, genesis) : runtime.open(backend, parametersFormat, parameters, genesis);
		owner = api.viewsForStorage(opened);
		installWalletWorker(owner, request.port, () => runtime.invalid);
		control.postMessage({
			type: "opened",
			id: request.id
		});
		return;
	} catch (error) {
		const info = failureInfo(error, fallback);
		let cleanupFailed = false;
		try {
			if (owner) owner.close(owner.generation, owner.instance);
		} catch {
			cleanupFailed = true;
		}
		try {
			if (backend?.owned) backend.release();
		} catch {
			cleanupFailed = true;
			info.code = "STORAGE_ERROR";
		}
		return {
			code: info.code,
			fatal: cleanupFailed || runtime?.invalid === true || nativeOpening && !info.known
		};
	}
}
function reportFailure(data, code, fatal) {
	if (fatal) phase = "failed";
	control.postMessage({
		type: "failure",
		code,
		id: data.type === "pool-build" ? initializationId : data.id,
		fatal
	});
}
let opening = Promise.resolve();
control.onmessage = ({ data }) => {
	opening = opening.then(() => handle(data));
};
async function handle(raw) {
	const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
	try {
		const request = admit(data);
		switch (request.type) {
			case "initialize": return await initialize(request);
			case "compute-initialize": return await initializeCompute(request);
			case "pool-build":
				runtime = api.finishThreaded();
				phase = "ready";
				control.postMessage({
					type: "ready",
					identity: api.runtimeIdentity,
					id: initializationId
				});
				return;
			case "signers":
				installWalletWorker(void 0, request.port, () => runtime.invalid, runtime.signers);
				signerPort = true;
				control.postMessage({
					type: "signers-ready",
					id: request.id
				});
				return;
			case "open": {
				const result = await openStorage(request);
				if (result) reportFailure(data, result.code, result.fatal);
			}
		}
	} catch (error) {
		const fatal = data.type !== "open" || phase !== "ready" || runtime?.invalid === true;
		reportFailure(data, failureInfo(error, "RUNTIME_UNAVAILABLE").code, fatal);
	}
}
//#endregion
