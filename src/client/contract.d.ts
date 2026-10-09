/**
 * dsh-task-assist client contract.
 *
 * `conversation.input.right` is declared by
 * `@deepseek-ai/dsh-client-ui-conversation` itself
 * (lib/types/client/contract/slots.d.ts), so we do NOT re-declare it here —
 * re-declaring the same `SlotMap` key would conflict with the owning package.
 *
 * The previous revision also imported `@deepseek-ai/dsh-client-ui-session`,
 * which is not resolvable from this package (it is not a declared dependency);
 * that import was silently swallowed by `skipLibCheck`, so it is removed.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
// Ambient side-effect import. It MUST be the `./client` subpath: the package
// root (`lib/types/index.d.ts`) only re-exports the host config and does NOT
// pull in `client/contract/slots.ts`, whose
// `declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap { … } }`
// is what teaches the compiler about `conversation.input.right`. Without it the
// slot key is unknown and `PropsRuntime<'…'>` collapses to `never`.
import '@deepseek-ai/dsh-client-ui-conversation/client';

/** Composed props our registered component receives at this slot. */
export type AssistInputRightProps = PropsRuntime<'conversation.input.right'>;
