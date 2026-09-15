# Exact declaration reference

The shared SDK contracts live in `src/types.ts`; root runtime exports and function signatures come from `src/index.ts` and the implementation modules. The documentation entry `public-api.ts` re-exports these sources for example typechecking. Types and successful compilation do not establish backend support.

Use the [grouped API reference](reference.md) to locate a task, the [walkthrough](walkthrough.md) to see a complete scenario, and the [host contract](host-contract.md) to review implementation ownership. The site includes the source-owned contracts directly so there is no separately maintained declaration copy.

<<< ../../src/types.ts
