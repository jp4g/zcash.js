/* tslint:disable */
/* eslint-disable */

/**
 * Validate the reviewed document and select the pinned upstream branch at height.
 * The JS entry checks types/ranges before generated glue; raw glue is internal.
 */
export function consensus_branch(format: string, bytes: Uint8Array, height: number): number;

export function storage_binding(generation: number): Uint8Array;

export function storage_close(generation: number): void;

export function storage_initialize(format: string, bytes: Uint8Array, genesis: Uint8Array): number;

/**
 * Internal codec: exact upstream serialization is required before returning identity.
 * This does not validate signatures, proofs, consensus rules, or activation.
 */
export function transaction_id(raw: Uint8Array, branch: number): Uint8Array;

export function views_call(generation: number, operation: string, input: string): string;

export function views_mnemonic_call(generation: number, input: string, mnemonic: Uint8Array, passphrase: Uint8Array): string;

export function views_seed_call(generation: number, operation: string, input: string, seed: Uint8Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly consensus_branch: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly storage_binding: (a: number) => [number, number, number, number];
    readonly storage_close: (a: number) => [number, number];
    readonly storage_initialize: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly transaction_id: (a: number, b: number, c: number) => [number, number, number, number];
    readonly views_call: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly views_mnemonic_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly views_seed_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly wallet_runtime_init: () => number;
    readonly wallet_pool_start: () => number;
    readonly wallet_pool_size: () => number;
    readonly __wbindgen_exn_store_command_export: (a: number) => void;
    readonly __externref_table_alloc_command_export: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc_command_export: (a: number, b: number) => number;
    readonly __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc_command_export: (a: number) => void;
    readonly __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
