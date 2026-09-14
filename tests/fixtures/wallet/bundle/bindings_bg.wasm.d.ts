/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const consensus_branch: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const storage_binding: (a: number) => [number, number, number, number];
export const storage_close: (a: number) => [number, number];
export const storage_initialize: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const transaction_id: (a: number, b: number, c: number) => [number, number, number, number];
export const views_call: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
export const views_mnemonic_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
export const views_seed_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
export const rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
export const rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
export const rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
export const rustsecp256k1_v0_10_0_context_create: (a: number) => number;
export const wallet_runtime_init: () => number;
export const wallet_pool_start: () => number;
export const wallet_pool_size: () => number;
export const __wbindgen_exn_store_command_export: (a: number) => void;
export const __externref_table_alloc_command_export: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc_command_export: (a: number, b: number) => number;
export const __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
export const __externref_table_dealloc_command_export: (a: number) => void;
export const __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
