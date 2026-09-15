export interface TransparentAddressCodec {
  decode(
    token: string,
    family: 'main' | 'test' | 'regtest'
  ): { kind: 'p2pkh' | 'p2sh'; payload: Uint8Array; canonical: string };
}
/** Lazily initialize the package-owned Rust codec; repeated calls reuse it. */
export function initialize(): Readonly<TransparentAddressCodec>;
