/**
 * AssistButton — the `conversation.input.right` occupant.
 *
 * The slot's framework standard kit injects `useSession`, `useInput`,
 * `useConversation`, `inputActions`, and `sessionId` as props. We call the
 * selector hooks at the top of the component (rules-of-hooks safe), read the
 * current draft as the "task" text, then open a candidate panel that:
 *   1. scans the host for matching skills + MCP tools,
 *   2. lets the user check/uncheck (skills with a positive score are
 *      default-checked),
 *   3. on "启动辅助" commits the selection to the host for Agent injection.
 *
 * All styling is inline (CSS-in-JS) so the bundle needs no separate stylesheet.
 *
 * ROBUSTNESS CONTRACT (learned the hard way):
 *   - The button must render **even if the standard kit is not what we expect**.
 *     A slot occupant that silently returns `null` is indistinguishable from a
 *     plugin that never loaded, so every branch below still renders the control.
 *   - Any render throw is caught by `AssistBoundary`, which reports through
 *     `diag()` instead of letting the entry abdicate silently.
 */
import React, { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { diagOnce, requestInject, requestScan, type ScanResponse } from '../index';

/**
 * Framework hooks we consume.
 *
 * Both are `SnapshotSelectorHook`s: `bindSnapshotSelector` wraps
 * `useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, sel, eq)`
 * — the **selector is required**. Calling one with no arguments passes
 * `undefined` as `sel`, and the store then invokes it (`sel(snapshot)`), which
 * throws `"l is not a function"` out of the component. Always pass an identity
 * selector to read the whole snapshot.
 */
type SnapshotSelectorHook = (selector: (snapshot: any) => any, eq?: unknown) => any;

export interface AssistButtonProps {
  /** Current Session identity (framework standard kit). */
  sessionId?: string;
  /** Read the composer input snapshot (`InputState.draft` = task text). */
  useInput?: SnapshotSelectorHook;
  /** Read the current Session lifecycle snapshot (fallback task source). */
  useSession?: SnapshotSelectorHook;
}

const rowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  minWidth: '32px',
  padding: '0 10px',
  border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
  borderRadius: '10px',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '13px',
  gap: '6px',
  position: 'relative',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0',
  bottom: 'calc(100% + 46px)',
  width: 'min(440px, 78vw)',
  maxHeight: 'min(60vh, 520px)',
  overflow: 'auto',
  background: 'var(--ds-h-bg-3, #ffffff)',
  color: 'var(--ds-h-fg, #1c1c1e)',
  border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
  borderRadius: '14px',
  boxShadow: '0 12px 40px rgba(0,0,0,.24)',
  padding: '12px',
  zIndex: 90,
  textAlign: 'left',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'flex-start',
  padding: '8px 6px',
  borderRadius: '8px',
};

const ghostBtn: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
  background: 'transparent',
  borderRadius: '10px',
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  border: 'none',
  background: 'var(--ds-h-accent, #4f7cff)',
  color: '#fff',
  borderRadius: '10px',
  padding: '6px 16px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
};

const toastStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0',
  bottom: 'calc(100% + 8px)',
  width: 'min(320px, 70vw)',
  border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
  background: 'var(--ds-h-bg-3, #fff)',
  color: 'var(--ds-h-fg, #1c1c1e)',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
  zIndex: 95,
};

/**
 * Hook-free body: everything the control actually does. `task` / `sid` are
 * resolved by whichever shell owns this render, so this component can be reused
 * with or without the framework's selector hooks.
 */
function AssistPanel({ task, sid }: { task: string; sid?: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const openPanel = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const scan = await requestScan(task || '', sid);
      setResult(scan);
      const init: Record<string, boolean> = {};
      for (const s of scan.skills) init[`skill:${s.name}`] = s.score > 0;
      setChecked(init);
      setOpen(true);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [task, sid]);

  const confirm = useCallback(async () => {
    if (!result) return;
    const selected = result.skills.filter((s) => checked[`skill:${s.name}`]);
    if (selected.length === 0) {
      setToast('未勾选任何技能，已取消');
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await requestInject(selected, sid);
      setToast(resp.ok ? `${resp.detail} ✅` : `注入失败：${resp.detail}`);
      setOpen(false);
    } catch (e) {
      setToast(`请求失败：${(e as Error)?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [result, checked, sid]);

  const toggle = useCallback((key: string) => {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  }, []);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} data-dsh-task-assist>
      <button
        type="button"
        aria-label="任务辅助（自动匹配已装技能/工具）"
        title="任务辅助：自动搜索已装技能/工具并帮你执行"
        style={rowStyle}
        onClick={openPanel}
        disabled={loading}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>辅助</span>
      </button>

      {open && (
        <div style={panelStyle} role="dialog" aria-label="任务辅助候选">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <strong style={{ fontSize: '14px' }}>任务辅助</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭"
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit' }}>
              ✕
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'color-mix(in srgb, currentColor 62%, transparent)', marginBottom: '8px' }}>
            任务：<code>{task || '（输入框暂无文字，扫描全部匹配项）'}</code>
          </div>

          {loading && <div style={{ fontSize: '13px', opacity: 0.7 }}>扫描中…</div>}
          {error && <div style={{ fontSize: '13px', color: '#c0392b' }}>扫描失败：{error}</div>}

          {result && !loading && (
            <>
              {result.skills.length === 0 && result.mcpTools.length === 0 && (
                <div style={{ fontSize: '13px', opacity: 0.7 }}>未发现可用的技能/工具。</div>
              )}

              {result.skills.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 600, margin: '6px 0 4px' }}>
                    技能（{result.skills.length}）
                  </div>
                  {result.skills.map((s) => (
                    <label key={`skill:${s.name}`} style={{ ...itemStyle, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!checked[`skill:${s.name}`]}
                        onChange={() => toggle(`skill:${s.name}`)}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: '12px', opacity: 0.72 }}>{s.description}</div>
                        <div style={{ fontSize: '11px', opacity: 0.5 }}>{s.reason || '未命中关键词'}</div>
                      </div>
                    </label>
                  ))}
                </>
              )}

              {result.mcpTools.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 600, margin: '10px 0 4px' }}>
                    MCP 工具（{result.mcpTools.length}）
                  </div>
                  {result.mcpTools.slice(0, 25).map((t) => (
                    <div key={`tool:${t.name}`} style={itemStyle}>
                      <span style={{ fontSize: '12px', flex: '0 0 auto', fontFamily: 'monospace' }}>{t.name}</span>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>{t.description}</span>
                    </div>
                  ))}
                  {result.mcpTools.length > 25 && (
                    <div style={{ fontSize: '11px', opacity: 0.55 }}>…共 {result.mcpTools.length} 个工具</div>
                  )}
                </>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" onClick={() => setOpen(false)} style={ghostBtn}>取消</button>
            <button
              type="button"
              onClick={confirm}
              disabled={loading || !result}
              style={{ ...primaryBtn, opacity: loading || !result ? 0.5 : 1 }}
            >
              {loading ? '提交中…' : '启动辅助 🚀'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <button type="button" onClick={() => setToast(null)} style={toastStyle} aria-live="polite">
          {toast} ✕
        </button>
      )}
    </div>
  );
}

/** Report the observed standard-kit shape once per distinct shape. */
function reportShape(props: AssistButtonProps): void {
  diagOnce('render', {
    props: Object.keys(props).sort(),
    useInput: typeof props.useInput,
    useSession: typeof props.useSession,
    sessionId: typeof props.sessionId === 'string' ? props.sessionId : null,
  });
}

/**
 * Read the composer draft out of an `InputState`.
 *
 * The kernel's own `compose()` publishes
 * `{ draft, attachmentIds, draftRev, phase, claim?, occurrences, queue }` where
 * `draft` is the editor's clipboard text, so that is the primary field. The
 * alternatives are pure insurance against a future rename — they cost nothing
 * and keep the button working if the shape drifts.
 */
export function pickDraft(input: any): string {
  if (input === undefined || input === null) return '';
  for (const field of ['draft', 'text', 'value', 'content']) {
    const v = input[field];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/** Shell that owns the framework selector hooks (always calls them, in order). */
function AssistButtonWithHooks(
  props: AssistButtonProps & { useInput: SnapshotSelectorHook; useSession: SnapshotSelectorHook },
): ReactNode {
  reportShape(props);
  const { useInput, useSession, sessionId } = props;

  // A selector hook that throws would otherwise take the whole entry down.
  // The selector is REQUIRED — see SnapshotSelectorHook above.
  let input: any;
  let session: any;
  try {
    input = useInput((s: any) => s);
  } catch (e) {
    diagOnce('useInput:throw', String((e as Error)?.message ?? e));
  }
  try {
    session = useSession((s: any) => s);
  } catch (e) {
    diagOnce('useSession:throw', String((e as Error)?.message ?? e));
  }

  // One-shot shape report: tells the log exactly what the composer published,
  // which is what distinguishes "empty draft" from "wrong field".
  if (input !== undefined) {
    diagOnce('input:shape', {
      keys: Object.keys(input ?? {}).sort(),
      draft: typeof input?.draft === 'string' ? input.draft.slice(0, 80) : null,
      draftRev: typeof input?.draftRev === 'number' ? input.draftRev : null,
    });
  }

  /** The composer draft doubles as the "task description" the host scores. */
  const task = pickDraft(input);
  /** Session identity: the injected prop wins, otherwise the live snapshot. */
  const sid: string | undefined = sessionId ?? session?.id ?? session?.sessionId ?? undefined;

  return <AssistPanel task={task} sid={sid} />;
}

/**
 * Slot occupant.
 *
 * Picks a shell from the props shape *without* calling a hook itself (stable
 * per props shape), and always renders the control: when the standard kit does
 * not hand us the selector hooks we still show the button, just without the
 * draft-prefill. Silence is the one outcome we never want.
 */
export function AssistButton(props: AssistButtonProps): ReactNode {
  reportShape(props);
  const { useInput, useSession } = props;
  const body =
    typeof useInput === 'function' && typeof useSession === 'function' ? (
      <AssistButtonWithHooks {...props} useInput={useInput} useSession={useSession} />
    ) : (
      // No selector hooks available: still render, using only `sessionId`.
      <AssistPanel task="" sid={props.sessionId} />
    );
  return <AssistBoundary>{body}</AssistBoundary>;
}

/**
 * Error boundary: a render throw inside a slot entry makes the slot core retire
 * (abdicate) the entry, i.e. the button vanishes with no visible reason. Catch
 * it, report it, and keep the rest of the composer intact.
 */
class AssistBoundary extends React.Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    diagOnce('render:throw', String((error as Error)?.stack ?? error));
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export default AssistButton;
