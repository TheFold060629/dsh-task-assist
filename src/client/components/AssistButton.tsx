/**
 * AssistButton — the `conversation.input.right` occupant.
 *
 * The slot's framework standard kit injects `useSession`, `useInput`,
 * `useConversation`, `inputActions`, and `sessionId` as props. We call the
 * selector hooks at the top of the component (rules-of-hooks safe), read the
 * current draft as the "task" text, then open a candidate panel that:
 *   1. scans the host for matching skills + MCP tools,
 *   2. lets the user search the list and check/uncheck entries (skills with a
 *      positive score are default-checked when auto-analyze is on),
 *   3. on "启动辅助" commits the selection to the host for Agent injection.
 *
 * It additionally watches for the draft being *sent* and, when the
 * "自动分析适配技能" toggle is on, asks the host to scan + inject on its own —
 * see `useAutoAssistOnSend`.
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  diag,
  diagOnce,
  readAutoEnabled,
  requestAuto,
  requestInject,
  requestScan,
  setAutoEnabled,
  subscribeAuto,
  type ScanResponse,
} from '../index';

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

/**
 * Panel geometry.
 *
 * WHY `position: fixed`, NOT `absolute`.
 *
 * The seat lives in the composer's `trailing` group
 * (`.RlGAzG_trailing{flex:none;gap:12px;margin-left:auto}`) inside
 * `.RlGAzG_standardControls{display:flex}`, which itself sits inside
 * `.RlGAzG_card{...;position:relative;border-radius:…;display:flex}`.
 *
 * An `absolute` panel is therefore positioned against that card and painted
 * inside its stacking/clipping scope — so the region where the ✕ sits got
 * covered by later-painted composer chrome, and clicks landed on whatever was
 * on top instead of the button. Bumping `z-index` cannot win that fight,
 * because the panel is trapped in a lower stacking context to begin with.
 *
 * `position: fixed` escapes every ancestor's stacking context (it is laid out
 * against the viewport and only re-parented by a transform/filter ancestor,
 * which the composer has none of), so the panel paints above the whole
 * composer and receives its own clicks. We then place it by measuring the
 * button and anchoring to whichever side has room.
 */
const panelStyle: React.CSSProperties = {
  position: 'fixed',
  // Width and maxHeight are NOT set here — `box.width` / `box.maxHeight` are the
  // single source of truth, and they come exclusively from `computePanelFixes()`
  // (= the viewport). Declaring them in both places let a stale value override
  // the intended one, and deriving them from the anchor was the actual cause of
  // the "panel resizes while scrolling" bug.
  overflow: 'auto',
  overscrollBehavior: 'contain',
  background: 'var(--ds-h-bg-3, #ffffff)',
  color: 'var(--ds-h-fg, #1c1c1e)',
  border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
  borderRadius: '14px',
  boxShadow: '0 12px 40px rgba(0,0,0,.24)',
  padding: '12px',
  zIndex: 2147483000,
  textAlign: 'left',
  // Contain layout/paint so nothing inside can influence the composer's layout
  // (and vice versa), which would feed back into the position measurements.
  contain: 'layout style',
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
  position: 'fixed',
  width: 'min(320px, 86vw)',
  border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
  background: 'var(--ds-h-bg-3, #fff)',
  color: 'var(--ds-h-fg, #1c1c1e)',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '12px',
  cursor: 'pointer',
  zIndex: 2147483001,
  textAlign: 'left',
};

/** Sticky header so ✕ and the title stay reachable while the list scrolls. */
const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'sticky',
  top: 0,
  margin: '-12px -12px 8px',
  padding: '12px 12px 8px',
  background: 'var(--ds-h-bg-3, #ffffff)',
  borderRadius: '14px 14px 0 0',
  zIndex: 1,
};

/**
 * The ✕ itself.
 *
 * It was previously an unstyled-ish 16px glyph in a 0-padding button, i.e. a
 * ~16×22px hit target sitting in the very corner the composer's own chrome
 * overlapped. Enlarged to a 28×28 flex-centred box with an explicit
 * `pointer-events: auto` so it is a real target regardless of what the panel is
 * layered over.
 */
const closeBtnStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: '28px',
  height: '28px',
  flex: 'none',
  border: 'none',
  borderRadius: '8px',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: 1,
  padding: 0,
  pointerEvents: 'auto',
  opacity: 0.75,
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: '30px',
  padding: '0 10px',
  border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
  borderRadius: '9px',
  background: 'transparent',
  color: 'inherit',
  fontSize: '13px',
  outline: 'none',
};

const autoRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  margin: '8px 0 0',
  padding: '7px 8px',
  borderRadius: '9px',
  background: 'color-mix(in srgb, currentColor 6%, transparent)',
  cursor: 'pointer',
  fontSize: '12.5px',
  userSelect: 'none',
};

const miniBtnStyle: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
  background: 'transparent',
  borderRadius: '7px',
  padding: '2px 9px',
  cursor: 'pointer',
  fontSize: '11.5px',
  color: 'inherit',
};

/**
 * Compute a fixed-position box for the panel, anchored to `anchor`.
 *
 * Preference order, re-evaluated on every open and on every resize/scroll:
 *   1. above the button (the composer sits at the bottom of the window, so this
 *      is almost always the roomiest side)
 *   2. below it, when there is not enough room above
 *
 * Horizontally the panel is right-aligned to the anchor's right edge — which is
 * what `right: 0` used to express — but clamped into the viewport so a narrow
 * window cannot push the ✕ off-screen to the left.
 *
 * Returns `null` before the first measurement (first paint), so the caller can
 * skip rendering the panel for one frame rather than flash it at 0,0.
 */
/**
 * Fix a popover's SIZE once, when it opens.
 *
 * The bug this replaces: the panel's `maxHeight` was derived from
 * `anchor.top` (`available = anchor.top - PANEL_GAP - VIEWPORT_PAD`), and the
 * anchor is the composer button — which MOVES whenever the conversation
 * scrolls. So scrolling the chat made the panel continuously resize
 * (542 → 502 → 452 → … as the composer slid up the viewport). The panel looked
 * like it was being squeezed while the wheel turned.
 *
 * Size and position are therefore decided **independently**:
 *   - size: viewport-derived, computed once at open (`computePanelFixes`)
 *   - position: recomputed live, cheaply, from the anchor (`placePanelAt`)
 *
 * A popover is allowed to *move* with its trigger; it must not *change size*
 * with it.
 */
const PANEL_WIDTH = 440;
const PANEL_MIN_WIDTH = 240;
const PANEL_MIN_HEIGHT = 180;
/** Share of the viewport the panel may occupy, so it never feels fullscreen. */
const PANEL_MAX_VIEWPORT_FRACTION = 0.62;
/** Breathing room between the panel and the button, and the window edge. */
const PANEL_GAP = 10;
const VIEWPORT_PAD = 8;

/** Size is a pure function of the viewport — never of the anchor. */
function computePanelFixes(): { width: number; maxHeight: number } {
  const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
  const vh = window.innerHeight || document.documentElement.clientHeight || 768;
  const width = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_WIDTH, vw - VIEWPORT_PAD * 2));
  const maxHeight = Math.max(
    PANEL_MIN_HEIGHT,
    Math.min(Math.round(vh * PANEL_MAX_VIEWPORT_FRACTION), vh - VIEWPORT_PAD * 2),
  );
  return { width, maxHeight };
}

/**
 * Place the panel relative to the anchor, given a FIXED size.
 *
 * Only the anchor's position is consulted here; the size comes in from outside,
 * which is what keeps scroll from resizing the panel. Vertically the panel is
 * pinned so it clears the composer: it sits above the anchor when there is room
 * for its full height there, otherwise below it. The result is clamped into the
 * viewport but never re-derived from the available space, so it does not
 * oscillate — the worst case is that the panel overlaps the composer slightly
 * in a very short window, which is far better than visible breathing.
 */
function placePanelAt(
  anchor: DOMRect | null,
  width: number,
  height: number,
): { left: number; top: number } | null {
  if (!anchor || (anchor.width === 0 && anchor.height === 0)) return null;

  const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
  const vh = window.innerHeight || document.documentElement.clientHeight || 768;

  const roomAbove = anchor.top - PANEL_GAP;
  const above = roomAbove >= height;

  let top = above ? anchor.top - PANEL_GAP - height : anchor.bottom + PANEL_GAP;
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - height - VIEWPORT_PAD));

  let left = anchor.right - width;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - width - VIEWPORT_PAD));

  return { left, top };
}

/**
 * Live geometry for the panel — with **size** and **position** strictly split.
 *
 * The bug this exists to prevent: the panel grew and shrank while the user
 * scrolled the conversation behind it. The cause was that the height was
 * derived from the anchor (`available = anchor.top - gaps`, then
 * `maxHeight = min(contentHeight, available, …)`), so every wheel tick that
 * moved the composer button also changed the panel's height. A popover may
 * *follow* its trigger; it must not *resize* with it.
 *
 * Hence:
 *
 *   1. **Size** (viewport-only): computed once from `computePanelFixes()` when
 *      the panel opens, and re-derived only on `window.resize` — the single
 *      case where a viewport-derived size legitimately changes. Nothing about
 *      the anchor or the content may influence it. Because the panel keeps a
 *      viewport-proportional `maxHeight` and `overflow:auto`, a long list
 *      scrolls inside a stable frame instead of stretching it.
 *   2. **Position** (anchor + size): recomputed on scroll/resize from
 *      `placePanelAt(anchor, width, height)`. rAF-throttled so a fast wheel
 *      flick yields one update per frame instead of one per event.
 *
 * Scroll listeners use the capture phase so scrolling inside any ancestor
 * scroll container is seen, not just the window. Scroll events originating
 * inside the panel are ignored: the skill list is itself a scroll container,
 * and letting it reposition the panel would be a self-sustaining loop.
 *
 * `contentKey` is accepted for call-site compatibility but no longer drives the
 * size — content can only ever scroll within the fixed frame.
 */
function usePanelBox(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  panelRef: React.RefObject<HTMLElement | null>,
  /** Retained for API compatibility; no longer affects the box. */
  contentKey: unknown,
): { left: number; top: number; width: number; maxHeight: number } | null {
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  // Keep the latest contentKey reachable without making the effect re-run for
  // it — the effect's lifetime is tied to `open` only.
  const contentKeyRef = useRef(contentKey);
  contentKeyRef.current = contentKey;

  useEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }

    /** Size is frozen for the lifetime of this open/close cycle. */
    const fixes = computePanelFixes();

    /**
     * Reposition using the frozen size. Cheap; safe to call often.
     *
     * Ignores scroll events that originate inside the panel itself: the skill
     * list is a scroll container, and letting its own scrolling reposition the
     * panel creates a self-sustaining loop (scroll → reposition → scroll). The
     * panel does not need to move when its own content scrolls.
     */
    const reposition = (e?: Event) => {
      const target = e?.target as Node | null | undefined;
      // `document` is the target for window/document scrolls — those matter.
      if (target && target !== document && panelRef.current?.contains(target)) return;
      const anchor = anchorRef.current?.getBoundingClientRect() ?? null;
      const placed = placePanelAt(anchor, fixes.width, fixes.maxHeight);
      if (!placed) return;
      setBox({ left: placed.left, top: placed.top, width: fixes.width, maxHeight: fixes.maxHeight });
    };

    // rAF throttle: coalesce bursts of scroll events into one reposition per
    // frame. Without this a wheel flick fires dozens of measures and each one
    // can reflow, which is both slow and visually jittery.
    let frame = 0;
    let pendingEvent: Event | undefined;
    const scheduleReposition = (e?: Event) => {
      pendingEvent = e ?? pendingEvent;
      if (frame) return;
      if (typeof requestAnimationFrame !== 'function') {
        reposition(pendingEvent);
        pendingEvent = undefined;
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const ev = pendingEvent;
        pendingEvent = undefined;
        reposition(ev);
      });
    };

    reposition();
    // Second pass on the next frame, once the browser has laid the anchor out.
    scheduleReposition();

    // The only event that may change the size: the viewport itself changed.
    const onResize = () => {
      const next = computePanelFixes();
      fixes.width = next.width;
      fixes.maxHeight = next.maxHeight;
      scheduleReposition();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', scheduleReposition, true);

    return () => {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', scheduleReposition, true);
    };
    // `contentKey` intentionally excluded — see the docstring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRef, panelRef]);

  return box;
}

/**
 * Dismiss on outside pointer-down and on Escape.
 *
 * This is the other half of the reported bug: the panel could only be closed by
 * hitting the (unreachable) ✕, so "clicking next to it" did nothing. Listening
 * on `pointerdown` in the capture phase closes before the click reaches
 * whatever was underneath, which is what users expect from a popover.
 *
 * Deliberately no backdrop element: a full-screen scrim would swallow the first
 * click on the composer (users often click back into the draft to keep typing).
 * Outside-click dismissal gives the same escape hatch without stealing clicks.
 */
function useDismissOnOutside(
  open: boolean,
  onClose: () => void,
  refs: Array<React.RefObject<HTMLElement | null>>,
): void {
  // `refs` is a fresh array literal on every render, so depending on it would
  // re-subscribe every render. The ref objects themselves are stable for the
  // component's lifetime, which is what we actually depend on.
  const refsKey = refs.length;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Keep the panel open when the interaction is inside it, or on the
      // trigger button (letting the button's own onClick toggle it).
      for (const ref of refsRef.current) {
        const el = ref.current;
        if (el && (el === target || el.contains(target))) return;
      }
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Capture phase: run before the underlying control's own handlers.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, refsKey]);
}

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
  /** Free-text filter over the skill list. */
  const [query, setQuery] = useState('');
  /** Mirror of the persisted auto-analyze toggle. */
  const [autoOn, setAutoOn] = useState<boolean>(() => readAutoEnabled());

  /** Trigger button — the anchor the panel is placed against. */
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  /** The panel itself — measured for its natural size. */
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** The toast — also treated as "inside" so clicking it just dismisses it. */
  const toastRef = useRef<HTMLButtonElement | null>(null);

  // The toggle is shared with the render-path auto trigger, so a change made
  // anywhere has to show up here. Subscribing (rather than reading once) also
  // keeps two open composers from disagreeing.
  useEffect(() => subscribeAuto(setAutoOn), []);

  const closePanel = useCallback(() => setOpen(false), []);

  /**
   * Seed the checked map.
   *
   * With auto-analyze on, the sensible preset is "everything that scored" — the
   * user asked us to pick for them. With it off, nothing is pre-checked, which
   * keeps the manual path an explicit choice and avoids a stray 「启动辅助」
   * injecting a list the user never looked at.
   */
  const seedChecked = useCallback((scan: ScanResponse, auto: boolean) => {
    const init: Record<string, boolean> = {};
    for (const s of scan.skills) init[`skill:${s.name}`] = auto ? s.score > 0 : false;
    setChecked(init);
  }, []);

  const openPanel = useCallback(async () => {
    setError(null);
    setResult(null);
    setQuery('');
    setLoading(true);
    try {
      const scan = await requestScan(task || '', sid);
      setResult(scan);
      seedChecked(scan, readAutoEnabled());
      setOpen(true);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [task, sid, seedChecked]);

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

  const toggleAuto = useCallback(
    (next: boolean) => {
      setAutoEnabled(next);
      setAutoOn(next);
      // Re-seed so flipping the switch immediately reflects the new policy on
      // the list that is already on screen — otherwise the user has to close
      // and reopen the panel to see the effect of their own click.
      if (result) seedChecked(result, next);
    },
    [result, seedChecked],
  );

  /**
   * Case-insensitive substring match over name + description.
   *
   * Description is included because skill names are terse (`pdf`, `commit`) and
   * the thing the user actually remembers is often a word from the blurb.
   */
  const filteredSkills = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    if (!q) return result.skills;
    return result.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q),
    );
  }, [result, query]);

  const filteredCheckedCount = filteredSkills.filter((s) => checked[`skill:${s.name}`]).length;

  /** Bulk toggle over the *filtered* view, so a search can be selected in one go. */
  const toggleAllFiltered = useCallback(() => {
    if (filteredSkills.length === 0) return;
    const allOn = filteredSkills.every((s) => checked[`skill:${s.name}`]);
    setChecked((c) => {
      const next = { ...c };
      for (const s of filteredSkills) next[`skill:${s.name}`] = !allOn;
      return next;
    });
  }, [filteredSkills, checked]);

  const totalChecked = result ? result.skills.filter((s) => checked[`skill:${s.name}`]).length : 0;

  // Fixed positioning + the two dismissal paths (outside click, Escape).
  // Declared after the derived lists because `contentKey` needs
  // `filteredSkills.length` — re-measuring when the list grows (scan arriving,
  // filter change) keeps the height clamp tracking real content, not first paint.
  const box = usePanelBox(open, anchorRef, panelRef, filteredSkills.length);
  useDismissOnOutside(open, closePanel, [panelRef, anchorRef, toastRef]);

  /**
   * Toast placement.
   *
   * The toast is `position: fixed` too, so it needs its own coordinates. It
   * shares the anchor's right edge and floats just above the button — the
   * upward offset is done with a transform rather than a guessed pixel value,
   * because the toast's height depends on how long the message wrapped.
   */
  const toastBox = useMemo(() => {
    if (!toast) return null;
    const a = anchorRef.current?.getBoundingClientRect();
    if (!a) return null;
    const vw = window.innerWidth || 1024;
    const width = Math.min(320, vw - 16);
    let left = a.right - width;
    left = Math.max(8, Math.min(left, vw - width - 8));
    return { left, top: a.top - 10, width };
  }, [toast]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} data-dsh-task-assist>
      <button
        ref={anchorRef}
        type="button"
        aria-label="任务辅助（自动匹配已装技能/工具）"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="任务辅助：自动搜索已装技能/工具并帮你执行"
        style={rowStyle}
        onClick={() => (open ? closePanel() : void openPanel())}
        disabled={loading}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>辅助</span>
        {autoOn && (
          <span
            title="自动分析已开启：每条消息发出后会自动匹配技能"
            style={{
              position: 'absolute', top: '3px', right: '3px',
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--ds-h-accent, #4f7cff)',
            }}
          />
        )}
      </button>

      {/*
        The panel is only rendered once we have a measured box. Rendering it
        before measurement would flash it at 0,0 for one frame; the measurement
        itself happens in a layout effect + rAF in `usePanelBox`.
      */}
      {open && box && (
        <div
          ref={panelRef}
          style={{ ...panelStyle, left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight }}
          role="dialog"
          aria-label="任务辅助候选"
        >
          <div style={panelHeaderStyle}>
            <strong style={{ fontSize: '14px' }}>任务辅助</strong>
            <button
              type="button"
              onClick={closePanel}
              aria-label="关闭"
              title="关闭（Esc）"
              style={closeBtnStyle}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'color-mix(in srgb, currentColor 62%, transparent)', marginBottom: '8px' }}>
            任务：<code>{task || '（输入框暂无文字，扫描全部匹配项）'}</code>
          </div>

          <input
            type="search"
            value={query}
            placeholder="搜索技能（名称或描述）…"
            aria-label="搜索技能"
            onChange={(e) => setQuery(e.target.value)}
            style={searchStyle}
          />

          <label style={autoRowStyle} title="勾选后：面板默认勾中命中的技能；且每条消息发出后会自动扫描并注入适配技能">
            <input type="checkbox" checked={autoOn} onChange={(e) => toggleAuto(e.target.checked)} />
            <span>根据文本内容自动分析适配技能</span>
          </label>

          {loading && <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '8px' }}>扫描中…</div>}
          {error && <div style={{ fontSize: '13px', color: '#c0392b', marginTop: '8px' }}>扫描失败：{error}</div>}

          {result && !loading && (
            <>
              {result.skills.length === 0 && result.mcpTools.length === 0 && (
                <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '8px' }}>未发现可用的技能/工具。</div>
              )}

              {result.skills.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>
                      技能（{filteredSkills.length}/{result.skills.length}，已勾 {totalChecked}）
                    </span>
                    <button type="button" onClick={toggleAllFiltered} style={miniBtnStyle}
                      disabled={filteredSkills.length === 0}>
                      {filteredSkills.length > 0 && filteredCheckedCount === filteredSkills.length ? '全不选' : '全选'}
                    </button>
                  </div>

                  {filteredSkills.length === 0 && (
                    <div style={{ fontSize: '12.5px', opacity: 0.65, padding: '8px 2px' }}>
                      没有匹配「{query}」的技能。
                    </div>
                  )}

                  {filteredSkills.map((s) => (
                    <label key={`skill:${s.name}`} style={{ ...itemStyle, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!checked[`skill:${s.name}`]}
                        onChange={() => toggle(`skill:${s.name}`)}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {s.name}
                          {s.score > 0 && (
                            <span style={{ fontSize: '10.5px', fontWeight: 400, opacity: 0.55, marginLeft: '6px' }}>
                              score {s.score}
                            </span>
                          )}
                        </div>
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

          {/*
            Sticky footer: in a tall list the action buttons must not require
            scrolling to the bottom to reach.
          */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              position: 'sticky',
              bottom: 0,
              margin: '12px -12px -12px',
              padding: '10px 12px 12px',
              background: 'var(--ds-h-bg-3, #ffffff)',
              borderRadius: '0 0 14px 14px',
            }}
          >
            <button type="button" onClick={closePanel} style={ghostBtn}>取消</button>
            <button
              type="button"
              onClick={confirm}
              disabled={loading || !result}
              style={{ ...primaryBtn, opacity: loading || !result ? 0.5 : 1 }}
            >
              {loading ? '提交中…' : `启动辅助${totalChecked ? ` (${totalChecked})` : ''} 🚀`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <button
          ref={toastRef}
          type="button"
          onClick={() => setToast(null)}
          style={{
            ...toastStyle,
            // Anchor the toast to the trigger button. `translateY(-100%)`
            // lifts it clear of the button using its own measured height.
            left: toastBox?.left,
            top: toastBox?.top,
            width: toastBox?.width,
            transform: 'translateY(-100%)',
          }}
          aria-live="polite"
        >
          {toast} ✕
        </button>
      )}
    </div>
  );
}

/**
 * Detect "the user just sent the draft" and, when auto-analyze is on, ask the
 * host to scan + inject on its own.
 *
 * WHY DETECTION RATHER THAN INTERCEPTION
 * There is no plugin-facing "message sent" event, and there is no supported way
 * to wrap the composer's submit handler — the send key belongs to the kernel's
 * own composer entry, and replacing it is exactly the class of change that took
 * the desktop shell down before (a slot/component contract violation fails the
 * fiber and the whole client boot refuses to mount).
 *
 * Instead we watch the state the kernel already publishes. `InputState` carries
 * `{ draft, attachmentIds, draftRev, phase, claim?, occurrences, queue }`:
 * sending clears `draft` and bumps `draftRev`. So the signal is the transition
 * "we had non-empty text, and now the draft is empty and its revision moved".
 * That is observed, not imposed — it cannot break the send path, and if the
 * shape ever drifts the worst case is that auto-assist stops firing.
 *
 * The fired-guard is keyed on the draft revision so that a single send produces
 * at most one injection even though the hook re-runs on every render, and so
 * that re-typing the same text later is correctly treated as a new send.
 */
function useAutoAssistOnSend(
  task: string,
  sid: string | undefined,
  revision: number | undefined,
): void {
  /** The last non-empty draft we saw — the text that may have just been sent. */
  const lastDraft = useRef('');
  /** Draft revision we already handled, so one send yields one injection. */
  const handledRev = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Track the newest non-empty draft. This is the payload we would inject.
    if (task) {
      lastDraft.current = task;
      return;
    }

    // Draft is empty. Either it was just sent, or we simply have no text yet.
    const sent = lastDraft.current;
    if (!sent) return;
    if (!readAutoEnabled()) return;

    // Require the revision to have moved: a render where the draft is empty and
    // the revision is unchanged is just an unrelated re-render, not a send.
    if (typeof revision === 'number') {
      if (handledRev.current === revision) return;
      handledRev.current = revision;
    }

    lastDraft.current = '';
    diag('auto:send-detected', { chars: sent.length, rev: revision ?? null });

    void requestAuto(sent, sid).then((resp) => {
      diag('auto:result', {
        ok: resp.ok,
        scanned: resp.scanned,
        injected: resp.injected,
        detail: resp.detail,
      });
    });
  }, [task, sid, revision]);
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

  // Post-send auto path. Declared before the early-return-free render below so
  // the hook order is unconditional (this component never returns early anyway,
  // but the ordering contract is worth keeping obvious).
  useAutoAssistOnSend(
    task,
    sid,
    typeof input?.draftRev === 'number' ? input.draftRev : undefined,
  );

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
