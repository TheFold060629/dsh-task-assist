/**
 * dsh-task-assist client entry (browser).
 *
 * Registers an Assist button into the `conversation.input.right` slot — the
 * compact control row immediately before the composer's Send/Stop button. The
 * button reads the current draft (task text) via the session standard props,
 * calls the host `api/task-assist/scan`, shows a candidate panel, and on
 * confirm POSTs the selection to `api/task-assist/inject` so the Agent picks
 * the chosen skills up in its running turn.
 */
import type { Context } from '@deepseek-ai/cordis';
// The `Context.slots` augmentation comes from @deepseek-ai/dsh-client-ui-slots.
// We must NOT import the renderer at runtime — that would inline the whole
// renderer into our browser bundle.
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { AssistButton } from './components/AssistButton';

// Re-exported so the slot component and its draft reader are reachable from the
// built artifact (regression tests read the component out of the slot registry
// and exercise `pickDraft` directly).
export { AssistButton, pickDraft } from './components/AssistButton';

/**
 * Client services this plugin depends on. The cordis client runtime waits for
 * these before invoking `apply`, so `ctx.slots` is guaranteed to exist.
 * (Mirrors `exports.inject` in the official skill-explorer bundle.)
 */
export const inject = ['slots'];

/**
 * Seat name.
 *
 * `conversation.input.right` is declared by the *entry* that registers
 * `conversation.composer.bar` (client-ui-conversation's `registerComposerBar`),
 * NOT by the `conversation.content` factory that declares the composer bar slot
 * itself. Those two declarations happen at different moments, and the factory
 * one comes first, so waiting on the parent is wrong.
 *
 * `slots.inject(key)` subscribes to `key`'s OWN declaration epoch — exactly the
 * moment the seat becomes registrable. Injecting the parent instead fires
 * earlier and `slots.register` then throws
 * `slot "conversation.input.right" is not declared (a parent entry's children
 * table must declare it)`, which propagates out of `apply()` and leaves the
 * fiber in FAILED — so the whole client boot reports
 * `web boot: 1 entry did not activate` and the desktop never starts.
 *
 * Canonical form (kernel contract catalog + @michengai/dsh-pua both do this):
 *   slots.inject(SLOT_NAME, () =>
 *     slots.register({ name: SLOT_NAME, id, order, label }, Component))
 */
const SLOT_NAME = 'conversation.input.right';
const SLOT_ID = 'task-assist';
/** Display text the owner projects where a label is needed. */
const SLOT_LABEL = '辅助';

/** Composed props our slot component receives. */
export type RightSlotProps = PropsRuntime<'conversation.input.right'> & {
  sessionId?: string;
};

/** Document-relative host route (mirrors the official client convention). */
const PREFIX = 'api/task-assist';

/**
 * Fetch one host route, tolerating either URL convention.
 *
 * The kernel's routes are registered root-absolute (`/open-in-app/apps`), while
 * the official client halves fetch them document-relative. Those are the same
 * URL only when the shell document sits at the origin root. Rather than bet on
 * that, try the document-relative form first and fall back to the root-absolute
 * one on a 404 — a 404 is exactly what a path mismatch produces, and it is
 * indistinguishable from "route missing" otherwise.
 */
async function hostFetch(path: string, init?: RequestInit): Promise<Response> {
  const first = await fetch(path, init);
  if (first.status !== 404) return first;
  // Body can only be read once; the fallback re-issues the request.
  return fetch(`/${path}`, init);
}

/** Fire-and-forget POST that must never throw. */
function beacon(path: string, body: string): void {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  };
  void hostFetch(path, init).catch(() => {});
}

/**
 * Diagnostic beacon.
 *
 * The renderer console of the desktop shell is not persisted anywhere we can
 * read after the fact, which makes "the button is missing" undebuggable. So the
 * client reports what it observed to the host, and the host appends it to
 * `~/.dsh/rescue/task-assist-client.log`. Fire-and-forget: it must never throw,
 * block, or reject, and it never affects the plugin's behaviour.
 */
const DIAG = `${PREFIX}/diag`;

/**
 * Build marker. Bump this whenever the diagnostics themselves change, so the
 * log unambiguously identifies which artifact produced a line — a stale
 * desktop process is otherwise indistinguishable from a silent failure.
 */
export const BUILD = '2026-10-10T01:10+08:00';

export function diag(stage: string, detail?: unknown): void {
  try {
    beacon(
      DIAG,
      JSON.stringify({ build: BUILD, stage, detail: detail === undefined ? null : detail }),
    );
  } catch {
    /* diagnostics must never break the host */
  }
}

/**
 * Deduplicating beacon.
 *
 * A slot occupant re-renders on every keystroke, so an unconditional beacon in
 * the render path floods the sink — a real observed failure produced hundreds of
 * identical lines in half a minute and buried the one line that mattered. Each
 * distinct `stage` + payload is reported once, with a hard cap as a backstop.
 */
const seenBeacons = new Set<string>();
const MAX_BEACONS = 60;

export function diagOnce(stage: string, detail?: unknown): void {
  let key: string;
  try {
    key = `${stage}|${JSON.stringify(detail ?? null)}`;
  } catch {
    key = stage;
  }
  if (seenBeacons.has(key)) return;
  if (seenBeacons.size >= MAX_BEACONS) return;
  seenBeacons.add(key);
  diag(stage, detail);
}

/** Set once `apply` has been entered — reported by the liveness beacons below. */
let applyRan = false;

/**
 * Load-time beacon.
 *
 * `diag()` calls inside `apply` can only prove things once the client entry has
 * actually activated. This one runs the moment the artifact is evaluated, so
 * "artifact never imported" and "artifact imported but `apply` never called"
 * stop looking identical. Retried a few times because the host route may still
 * be coming up while the renderer is already executing this module.
 */
try {
  diag('module:loaded', {
    href: typeof location !== 'undefined' ? location.href : null,
    origin: typeof location !== 'undefined' ? location.origin : null,
  });
  for (const delay of [1500, 4000, 9000]) {
    try {
      setTimeout(() => diag(`module:alive+${delay}ms`, { applied: applyRan }), delay);
    } catch {
      /* no timer seat: the immediate beacon already went out */
    }
  }
} catch {
  /* diagnostics must never break the host */
}

/**
 * Resolve the `slots` service defensively.
 *
 * The client runner gates *direct* service property access on the plugin's
 * `inject` declaration and **denies it by throwing** when the declaration is
 * missing. `ctx.get(name)` is the documented *optional* lookup and is not
 * gated, so it is tried first; the property read stays as a fallback for hosts
 * that expose `slots` directly. Both probes are individually guarded, because a
 * denied read throws rather than returning `undefined`.
 */
function resolveSlots(ctx: any): { register: Function; inject?: Function } | undefined {
  const ok = (s: any) => (s && typeof s.register === 'function' ? s : undefined);
  try {
    const viaGet = ok(ctx?.get?.('slots'));
    if (viaGet) return viaGet;
  } catch {
    /* declaration-gated access denied — fall through to the property probe */
  }
  try {
    return ok(ctx?.slots);
  } catch {
    return undefined;
  }
}

export interface ScanResponse {
  skills: Array<{
    name: string;
    description: string;
    path?: string;
    level?: string;
    score: number;
    reason: string;
  }>;
  mcpTools: Array<{ name: string; description: string; source?: string }>;
  query: string;
}

export interface InjectResponse {
  ok: boolean;
  detail: string;
}

/** Result of the unattended auto-analysis path (`api/task-assist/auto`). */
export interface AutoResponse {
  ok: boolean;
  detail: string;
  injected: string[];
  scanned: number;
}

/** Scan the host for skills/MCP tools matching `task` for `sessionId`. */
export async function requestScan(task: string, sessionId?: string): Promise<ScanResponse> {
  const params = new URLSearchParams();
  params.set('task', task);
  if (sessionId) params.set('session', sessionId);
  const res = await hostFetch(`${PREFIX}/scan?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`scan failed: ${res.status}`);
  return (await res.json()) as ScanResponse;
}

/** Commit the selected skills back to the host for Agent injection. */
export async function requestInject(
  selected: Array<{ name: string; description: string; path?: string; level?: string; score: number; reason: string }>,
  sessionId?: string,
): Promise<InjectResponse> {
  const res = await hostFetch(`${PREFIX}/inject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ selected, session: sessionId }),
  });
  if (!res.ok) throw new Error(`inject failed: ${res.status}`);
  return (await res.json()) as InjectResponse;
}

/**
 * Announce "this text was just sent" and let the host scan + inject by itself.
 *
 * Unlike `requestInject`, this carries no selection: the host owns the decision
 * (see `autoAssist`). It is called from the render path in response to a draft
 * being cleared, so it must never throw into that path — failures resolve to a
 * negative `AutoResponse` rather than rejecting.
 */
export async function requestAuto(task: string, sessionId?: string): Promise<AutoResponse> {
  try {
    const res = await hostFetch(`${PREFIX}/auto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ task, session: sessionId }),
    });
    if (!res.ok) return { ok: false, detail: `auto failed: ${res.status}`, injected: [], scanned: 0 };
    const data = (await res.json()) as Partial<AutoResponse>;
    return {
      ok: !!data.ok,
      detail: typeof data.detail === 'string' ? data.detail : '',
      injected: Array.isArray(data.injected) ? data.injected : [],
      scanned: typeof data.scanned === 'number' ? data.scanned : 0,
    };
  } catch (e) {
    return { ok: false, detail: (e as Error)?.message ?? String(e), injected: [], scanned: 0 };
  }
}

/**
 * Persisted "根据文本内容自动分析适配技能" toggle.
 *
 * It doubles as the panel checkbox and as the gate for the post-send auto path,
 * so its value has to outlive the panel (which unmounts when closed) and the
 * page (the shell reloads on plugin updates). localStorage is wrapped because
 * it throws outright under a denied storage partition, and a settings read must
 * never be the thing that takes the button down.
 */
const AUTO_KEY = 'dsh-task-assist:auto-analyze';

export function readAutoEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAutoEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the toggle still works for this panel's lifetime */
  }
}

/**
 * Subscribe to the toggle so the panel and the render-path auto trigger observe
 * the same value. `storage` only fires in *other* documents, so writers must
 * also notify locally — hence the in-page listener set.
 */
const autoListeners = new Set<(on: boolean) => void>();

export function subscribeAuto(listener: (on: boolean) => void): () => void {
  autoListeners.add(listener);
  return () => {
    autoListeners.delete(listener);
  };
}

export function setAutoEnabled(on: boolean): void {
  writeAutoEnabled(on);
  for (const l of [...autoListeners]) {
    try {
      l(on);
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

/**
 * Register the Assist control into the composer submit row.
 *
 * Defensive by design: a UI plugin must never brick the shell. A throw here
 * leaves this fiber in FAILED, and the client boot then refuses to mount the
 * app at all (`web boot: N entry did not activate`). So any failure degrades to
 * "button absent" and is reported instead of escalating.
 */
export function apply(ctx: Context): void {
  applyRan = true;
  try {
    const slots = resolveSlots(ctx);
    diag('apply:start', {
      build: BUILD,
      hasCtx: !!ctx,
      hasSlots: !!slots,
      hasRegister: typeof slots?.register === 'function',
      hasInject: typeof slots?.inject === 'function',
      hasEffect: typeof (ctx as any)?.effect === 'function',
    });
    if (!slots) {
      console.error('[dsh-task-assist] ctx.slots 不可用，辅助按钮未挂载');
      diag('apply:no-slots', {
        ctxKeys: ctx ? Object.keys(ctx as any).slice(0, 40) : null,
        declaredInject: (apply as any).inject ?? null,
      });
      return;
    }

    const register = () =>
      slots.register(
        { name: SLOT_NAME, id: SLOT_ID, order: -100, label: SLOT_LABEL },
        AssistButton as unknown as (props: RightSlotProps) => import('react').ReactNode,
      );

    if (typeof slots.inject === 'function') {
      // Claim the seat itself. `slots.inject` resolves the wait exactly when the
      // owning entry declares the seat in its children table, so `register` is
      // guaranteed to find a declared slot. `ctx.effect` ties the wait (and the
      // registration) to this plugin's fiber, so unload cleans both up.
      ctx.effect(
        () => {
          diag('apply:inject-fired', { slot: SLOT_NAME });
          return slots.inject!(SLOT_NAME, register);
        },
        'dsh-task-assist: input.right seat',
      );
      diag('apply:ok', { mode: 'inject' });
    } else {
      register();
      diag('apply:ok', { mode: 'direct' });
    }
  } catch (error) {
    console.error(
      '[dsh-task-assist] 客户端挂载失败（辅助按钮不可用，但不影响桌面端启动）:',
      error,
    );
    diag('apply:throw', String((error as Error)?.stack ?? error));
  }
}

/**
 * Carry the dependency declaration on the callable too.
 *
 * Official client halves export `inject` and `apply` as *named* exports and no
 * default (see `dsh-client-ui-model-selection`, `dsh-client-ui-conversation`).
 * A loader that resolves `mod.default ?? mod` picks the bare function, which has
 * no declaration site — the runner then denies `ctx.slots` outright. Attaching
 * the same list to the function keeps the declaration alive either way.
 */
(apply as any).inject = inject;

// NOTE: deliberately NO `export default`.
// The official convention is named `inject` + `apply` only. With a default
// export present, `mod.default ?? mod` resolves to this bare function and the
// `inject` declaration above is never read — `ctx.slots` is then denied by the
// runner's declaration gate, `apply` degrades to "no slots" and the button
// silently never appears (boot still succeeds, so nothing is logged).
