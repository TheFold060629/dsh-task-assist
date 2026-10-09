window.__ModuleLoader__.load({ id: "dsh-task-assist", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let react = require("react");
react = __toESM(react, 1);
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client/components/AssistButton.tsx
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
const rowStyle = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	height: "32px",
	minWidth: "32px",
	padding: "0 10px",
	border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
	borderRadius: "10px",
	background: "transparent",
	color: "inherit",
	cursor: "pointer",
	fontSize: "13px",
	gap: "6px",
	position: "relative"
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
const panelStyle = {
	position: "fixed",
	overflow: "auto",
	overscrollBehavior: "contain",
	background: "var(--ds-h-bg-3, #ffffff)",
	color: "var(--ds-h-fg, #1c1c1e)",
	border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
	borderRadius: "14px",
	boxShadow: "0 12px 40px rgba(0,0,0,.24)",
	padding: "12px",
	zIndex: 2147483e3,
	textAlign: "left",
	contain: "layout style"
};
const itemStyle = {
	display: "flex",
	gap: "8px",
	alignItems: "flex-start",
	padding: "8px 6px",
	borderRadius: "8px"
};
const ghostBtn = {
	border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
	background: "transparent",
	borderRadius: "10px",
	padding: "6px 14px",
	cursor: "pointer",
	fontSize: "13px",
	color: "inherit"
};
const primaryBtn = {
	border: "none",
	background: "var(--ds-h-accent, #4f7cff)",
	color: "#fff",
	borderRadius: "10px",
	padding: "6px 16px",
	cursor: "pointer",
	fontSize: "13px",
	fontWeight: 600
};
const toastStyle = {
	position: "fixed",
	width: "min(320px, 86vw)",
	border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
	background: "var(--ds-h-bg-3, #fff)",
	color: "var(--ds-h-fg, #1c1c1e)",
	borderRadius: "10px",
	padding: "8px 12px",
	fontSize: "12px",
	cursor: "pointer",
	zIndex: 2147483001,
	textAlign: "left"
};
/** Sticky header so ✕ and the title stay reachable while the list scrolls. */
const panelHeaderStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	position: "sticky",
	top: 0,
	margin: "-12px -12px 8px",
	padding: "12px 12px 8px",
	background: "var(--ds-h-bg-3, #ffffff)",
	borderRadius: "14px 14px 0 0",
	zIndex: 1
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
const closeBtnStyle = {
	display: "grid",
	placeItems: "center",
	width: "28px",
	height: "28px",
	flex: "none",
	border: "none",
	borderRadius: "8px",
	background: "transparent",
	color: "inherit",
	cursor: "pointer",
	fontSize: "16px",
	lineHeight: 1,
	padding: 0,
	pointerEvents: "auto",
	opacity: .75
};
const searchStyle = {
	width: "100%",
	boxSizing: "border-box",
	height: "30px",
	padding: "0 10px",
	border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
	borderRadius: "9px",
	background: "transparent",
	color: "inherit",
	fontSize: "13px",
	outline: "none"
};
const autoRowStyle = {
	display: "flex",
	alignItems: "center",
	gap: "7px",
	margin: "8px 0 0",
	padding: "7px 8px",
	borderRadius: "9px",
	background: "color-mix(in srgb, currentColor 6%, transparent)",
	cursor: "pointer",
	fontSize: "12.5px",
	userSelect: "none"
};
const miniBtnStyle = {
	border: "1px solid color-mix(in srgb, currentColor 20%, transparent)",
	background: "transparent",
	borderRadius: "7px",
	padding: "2px 9px",
	cursor: "pointer",
	fontSize: "11.5px",
	color: "inherit"
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
const PANEL_MAX_VIEWPORT_FRACTION = .62;
/** Breathing room between the panel and the button, and the window edge. */
const PANEL_GAP = 10;
const VIEWPORT_PAD = 8;
/** Size is a pure function of the viewport — never of the anchor. */
function computePanelFixes() {
	const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
	const vh = window.innerHeight || document.documentElement.clientHeight || 768;
	return {
		width: Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_WIDTH, vw - VIEWPORT_PAD * 2)),
		maxHeight: Math.max(PANEL_MIN_HEIGHT, Math.min(Math.round(vh * PANEL_MAX_VIEWPORT_FRACTION), vh - VIEWPORT_PAD * 2))
	};
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
function placePanelAt(anchor, width, height) {
	if (!anchor || anchor.width === 0 && anchor.height === 0) return null;
	const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
	const vh = window.innerHeight || document.documentElement.clientHeight || 768;
	let top = anchor.top - PANEL_GAP >= height ? anchor.top - PANEL_GAP - height : anchor.bottom + PANEL_GAP;
	top = Math.max(VIEWPORT_PAD, Math.min(top, vh - height - VIEWPORT_PAD));
	let left = anchor.right - width;
	left = Math.max(VIEWPORT_PAD, Math.min(left, vw - width - VIEWPORT_PAD));
	return {
		left,
		top
	};
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
function usePanelBox(open, anchorRef, panelRef, contentKey) {
	const [box, setBox] = (0, react.useState)(null);
	const contentKeyRef = (0, react.useRef)(contentKey);
	contentKeyRef.current = contentKey;
	(0, react.useEffect)(() => {
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
		const reposition = (e) => {
			const target = e?.target;
			if (target && target !== document && panelRef.current?.contains(target)) return;
			const placed = placePanelAt(anchorRef.current?.getBoundingClientRect() ?? null, fixes.width, fixes.maxHeight);
			if (!placed) return;
			setBox({
				left: placed.left,
				top: placed.top,
				width: fixes.width,
				maxHeight: fixes.maxHeight
			});
		};
		let frame = 0;
		let pendingEvent;
		const scheduleReposition = (e) => {
			pendingEvent = e ?? pendingEvent;
			if (frame) return;
			if (typeof requestAnimationFrame !== "function") {
				reposition(pendingEvent);
				pendingEvent = void 0;
				return;
			}
			frame = requestAnimationFrame(() => {
				frame = 0;
				const ev = pendingEvent;
				pendingEvent = void 0;
				reposition(ev);
			});
		};
		reposition();
		scheduleReposition();
		const onResize = () => {
			const next = computePanelFixes();
			fixes.width = next.width;
			fixes.maxHeight = next.maxHeight;
			scheduleReposition();
		};
		window.addEventListener("resize", onResize);
		window.addEventListener("scroll", scheduleReposition, true);
		return () => {
			if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("scroll", scheduleReposition, true);
		};
	}, [
		open,
		anchorRef,
		panelRef
	]);
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
function useDismissOnOutside(open, onClose, refs) {
	const refsKey = refs.length;
	const refsRef = (0, react.useRef)(refs);
	refsRef.current = refs;
	(0, react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (e) => {
			const target = e.target;
			if (!target) return;
			for (const ref of refsRef.current) {
				const el = ref.current;
				if (el && (el === target || el.contains(target))) return;
			}
			onClose();
		};
		const onKeyDown = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [
		open,
		onClose,
		refsKey
	]);
}
/**
* Hook-free body: everything the control actually does. `task` / `sid` are
* resolved by whichever shell owns this render, so this component can be reused
* with or without the framework's selector hooks.
*/
function AssistPanel({ task, sid }) {
	const [open, setOpen] = (0, react.useState)(false);
	const [loading, setLoading] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const [result, setResult] = (0, react.useState)(null);
	const [checked, setChecked] = (0, react.useState)({});
	const [toast, setToast] = (0, react.useState)(null);
	/** Free-text filter over the skill list. */
	const [query, setQuery] = (0, react.useState)("");
	/** Mirror of the persisted auto-analyze toggle. */
	const [autoOn, setAutoOn] = (0, react.useState)(() => readAutoEnabled());
	/** Trigger button — the anchor the panel is placed against. */
	const anchorRef = (0, react.useRef)(null);
	/** The panel itself — measured for its natural size. */
	const panelRef = (0, react.useRef)(null);
	/** The toast — also treated as "inside" so clicking it just dismisses it. */
	const toastRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => subscribeAuto(setAutoOn), []);
	const closePanel = (0, react.useCallback)(() => setOpen(false), []);
	/**
	* Seed the checked map.
	*
	* With auto-analyze on, the sensible preset is "everything that scored" — the
	* user asked us to pick for them. With it off, nothing is pre-checked, which
	* keeps the manual path an explicit choice and avoids a stray 「启动辅助」
	* injecting a list the user never looked at.
	*/
	const seedChecked = (0, react.useCallback)((scan, auto) => {
		const init = {};
		for (const s of scan.skills) init[`skill:${s.name}`] = auto ? s.score > 0 : false;
		setChecked(init);
	}, []);
	const openPanel = (0, react.useCallback)(async () => {
		setError(null);
		setResult(null);
		setQuery("");
		setLoading(true);
		try {
			const scan = await requestScan(task || "", sid);
			setResult(scan);
			seedChecked(scan, readAutoEnabled());
			setOpen(true);
		} catch (e) {
			setError(e?.message ?? String(e));
			setOpen(true);
		} finally {
			setLoading(false);
		}
	}, [
		task,
		sid,
		seedChecked
	]);
	const confirm = (0, react.useCallback)(async () => {
		if (!result) return;
		const selected = result.skills.filter((s) => checked[`skill:${s.name}`]);
		if (selected.length === 0) {
			setToast("未勾选任何技能，已取消");
			setOpen(false);
			return;
		}
		setLoading(true);
		try {
			const resp = await requestInject(selected, sid);
			setToast(resp.ok ? `${resp.detail} ✅` : `注入失败：${resp.detail}`);
			setOpen(false);
		} catch (e) {
			setToast(`请求失败：${e?.message ?? String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [
		result,
		checked,
		sid
	]);
	const toggle = (0, react.useCallback)((key) => {
		setChecked((c) => ({
			...c,
			[key]: !c[key]
		}));
	}, []);
	const toggleAuto = (0, react.useCallback)((next) => {
		setAutoEnabled(next);
		setAutoOn(next);
		if (result) seedChecked(result, next);
	}, [result, seedChecked]);
	/**
	* Case-insensitive substring match over name + description.
	*
	* Description is included because skill names are terse (`pdf`, `commit`) and
	* the thing the user actually remembers is often a word from the blurb.
	*/
	const filteredSkills = (0, react.useMemo)(() => {
		if (!result) return [];
		const q = query.trim().toLowerCase();
		if (!q) return result.skills;
		return result.skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
	}, [result, query]);
	const filteredCheckedCount = filteredSkills.filter((s) => checked[`skill:${s.name}`]).length;
	/** Bulk toggle over the *filtered* view, so a search can be selected in one go. */
	const toggleAllFiltered = (0, react.useCallback)(() => {
		if (filteredSkills.length === 0) return;
		const allOn = filteredSkills.every((s) => checked[`skill:${s.name}`]);
		setChecked((c) => {
			const next = { ...c };
			for (const s of filteredSkills) next[`skill:${s.name}`] = !allOn;
			return next;
		});
	}, [filteredSkills, checked]);
	const totalChecked = result ? result.skills.filter((s) => checked[`skill:${s.name}`]).length : 0;
	const box = usePanelBox(open, anchorRef, panelRef, filteredSkills.length);
	useDismissOnOutside(open, closePanel, [
		panelRef,
		anchorRef,
		toastRef
	]);
	/**
	* Toast placement.
	*
	* The toast is `position: fixed` too, so it needs its own coordinates. It
	* shares the anchor's right edge and floats just above the button — the
	* upward offset is done with a transform rather than a guessed pixel value,
	* because the toast's height depends on how long the message wrapped.
	*/
	const toastBox = (0, react.useMemo)(() => {
		if (!toast) return null;
		const a = anchorRef.current?.getBoundingClientRect();
		if (!a) return null;
		const vw = window.innerWidth || 1024;
		const width = Math.min(320, vw - 16);
		let left = a.right - width;
		left = Math.max(8, Math.min(left, vw - width - 8));
		return {
			left,
			top: a.top - 10,
			width
		};
	}, [toast]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			position: "relative",
			display: "inline-flex"
		},
		"data-dsh-task-assist": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: anchorRef,
				type: "button",
				"aria-label": "任务辅助（自动匹配已装技能/工具）",
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				title: "任务辅助：自动搜索已装技能/工具并帮你执行",
				style: rowStyle,
				onClick: () => open ? closePanel() : void openPanel(),
				disabled: loading,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						width: "15",
						height: "15",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						strokeLinecap: "round",
						strokeLinejoin: "round",
						"aria-hidden": "true",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: "12",
							cy: "12",
							r: "3"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "辅助" }),
					autoOn && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						title: "自动分析已开启：每条消息发出后会自动匹配技能",
						style: {
							position: "absolute",
							top: "3px",
							right: "3px",
							width: "6px",
							height: "6px",
							borderRadius: "50%",
							background: "var(--ds-h-accent, #4f7cff)"
						}
					})
				]
			}),
			open && box && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: panelRef,
				style: {
					...panelStyle,
					left: box.left,
					top: box.top,
					width: box.width,
					maxHeight: box.maxHeight
				},
				role: "dialog",
				"aria-label": "任务辅助候选",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: panelHeaderStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: { fontSize: "14px" },
							children: "任务辅助"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: closePanel,
							"aria-label": "关闭",
							title: "关闭（Esc）",
							style: closeBtnStyle,
							children: "✕"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontSize: "12px",
							color: "color-mix(in srgb, currentColor 62%, transparent)",
							marginBottom: "8px"
						},
						children: ["任务：", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: task || "（输入框暂无文字，扫描全部匹配项）" })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						value: query,
						placeholder: "搜索技能（名称或描述）…",
						"aria-label": "搜索技能",
						onChange: (e) => setQuery(e.target.value),
						style: searchStyle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: autoRowStyle,
						title: "勾选后：面板默认勾中命中的技能；且每条消息发出后会自动扫描并注入适配技能",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: autoOn,
							onChange: (e) => toggleAuto(e.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "根据文本内容自动分析适配技能" })]
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: "13px",
							opacity: .7,
							marginTop: "8px"
						},
						children: "扫描中…"
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontSize: "13px",
							color: "#c0392b",
							marginTop: "8px"
						},
						children: ["扫描失败：", error]
					}),
					result && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						result.skills.length === 0 && result.mcpTools.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: "13px",
								opacity: .7,
								marginTop: "8px"
							},
							children: "未发现可用的技能/工具。"
						}),
						result.skills.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									margin: "10px 0 2px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										fontSize: "12px",
										fontWeight: 600
									},
									children: [
										"技能（",
										filteredSkills.length,
										"/",
										result.skills.length,
										"，已勾 ",
										totalChecked,
										"）"
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: toggleAllFiltered,
									style: miniBtnStyle,
									disabled: filteredSkills.length === 0,
									children: filteredSkills.length > 0 && filteredCheckedCount === filteredSkills.length ? "全不选" : "全选"
								})]
							}),
							filteredSkills.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontSize: "12.5px",
									opacity: .65,
									padding: "8px 2px"
								},
								children: [
									"没有匹配「",
									query,
									"」的技能。"
								]
							}),
							filteredSkills.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									...itemStyle,
									cursor: "pointer"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: !!checked[`skill:${s.name}`],
									onChange: () => toggle(`skill:${s.name}`)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { fontWeight: 600 },
										children: [s.name, s.score > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontSize: "10.5px",
												fontWeight: 400,
												opacity: .55,
												marginLeft: "6px"
											},
											children: ["score ", s.score]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											fontSize: "12px",
											opacity: .72
										},
										children: s.description
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											fontSize: "11px",
											opacity: .5
										},
										children: s.reason || "未命中关键词"
									})
								] })]
							}, `skill:${s.name}`))
						] }),
						result.mcpTools.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontSize: "12px",
									fontWeight: 600,
									margin: "10px 0 4px"
								},
								children: [
									"MCP 工具（",
									result.mcpTools.length,
									"）"
								]
							}),
							result.mcpTools.slice(0, 25).map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: itemStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: "12px",
										flex: "0 0 auto",
										fontFamily: "monospace"
									},
									children: t.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: "12px",
										opacity: .7
									},
									children: t.description
								})]
							}, `tool:${t.name}`)),
							result.mcpTools.length > 25 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontSize: "11px",
									opacity: .55
								},
								children: [
									"…共 ",
									result.mcpTools.length,
									" 个工具"
								]
							})
						] })
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: "8px",
							justifyContent: "flex-end",
							position: "sticky",
							bottom: 0,
							margin: "12px -12px -12px",
							padding: "10px 12px 12px",
							background: "var(--ds-h-bg-3, #ffffff)",
							borderRadius: "0 0 14px 14px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: closePanel,
							style: ghostBtn,
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: confirm,
							disabled: loading || !result,
							style: {
								...primaryBtn,
								opacity: loading || !result ? .5 : 1
							},
							children: loading ? "提交中…" : `启动辅助${totalChecked ? ` (${totalChecked})` : ""} 🚀`
						})]
					})
				]
			}),
			toast && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: toastRef,
				type: "button",
				onClick: () => setToast(null),
				style: {
					...toastStyle,
					left: toastBox?.left,
					top: toastBox?.top,
					width: toastBox?.width,
					transform: "translateY(-100%)"
				},
				"aria-live": "polite",
				children: [toast, " ✕"]
			})
		]
	});
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
function useAutoAssistOnSend(task, sid, revision) {
	/** The last non-empty draft we saw — the text that may have just been sent. */
	const lastDraft = (0, react.useRef)("");
	/** Draft revision we already handled, so one send yields one injection. */
	const handledRev = (0, react.useRef)(void 0);
	(0, react.useEffect)(() => {
		if (task) {
			lastDraft.current = task;
			return;
		}
		const sent = lastDraft.current;
		if (!sent) return;
		if (!readAutoEnabled()) return;
		if (typeof revision === "number") {
			if (handledRev.current === revision) return;
			handledRev.current = revision;
		}
		lastDraft.current = "";
		diag("auto:send-detected", {
			chars: sent.length,
			rev: revision ?? null
		});
		requestAuto(sent, sid).then((resp) => {
			diag("auto:result", {
				ok: resp.ok,
				scanned: resp.scanned,
				injected: resp.injected,
				detail: resp.detail
			});
		});
	}, [
		task,
		sid,
		revision
	]);
}
/** Report the observed standard-kit shape once per distinct shape. */
function reportShape(props) {
	diagOnce("render", {
		props: Object.keys(props).sort(),
		useInput: typeof props.useInput,
		useSession: typeof props.useSession,
		sessionId: typeof props.sessionId === "string" ? props.sessionId : null
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
function pickDraft(input) {
	if (input === void 0 || input === null) return "";
	for (const field of [
		"draft",
		"text",
		"value",
		"content"
	]) {
		const v = input[field];
		if (typeof v === "string" && v.trim() !== "") return v.trim();
	}
	return "";
}
/** Shell that owns the framework selector hooks (always calls them, in order). */
function AssistButtonWithHooks(props) {
	reportShape(props);
	const { useInput, useSession, sessionId } = props;
	let input;
	let session;
	try {
		input = useInput((s) => s);
	} catch (e) {
		diagOnce("useInput:throw", String(e?.message ?? e));
	}
	try {
		session = useSession((s) => s);
	} catch (e) {
		diagOnce("useSession:throw", String(e?.message ?? e));
	}
	if (input !== void 0) diagOnce("input:shape", {
		keys: Object.keys(input ?? {}).sort(),
		draft: typeof input?.draft === "string" ? input.draft.slice(0, 80) : null,
		draftRev: typeof input?.draftRev === "number" ? input.draftRev : null
	});
	/** The composer draft doubles as the "task description" the host scores. */
	const task = pickDraft(input);
	/** Session identity: the injected prop wins, otherwise the live snapshot. */
	const sid = sessionId ?? session?.id ?? session?.sessionId ?? void 0;
	useAutoAssistOnSend(task, sid, typeof input?.draftRev === "number" ? input.draftRev : void 0);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistPanel, {
		task,
		sid
	});
}
/**
* Slot occupant.
*
* Picks a shell from the props shape *without* calling a hook itself (stable
* per props shape), and always renders the control: when the standard kit does
* not hand us the selector hooks we still show the button, just without the
* draft-prefill. Silence is the one outcome we never want.
*/
function AssistButton(props) {
	reportShape(props);
	const { useInput, useSession } = props;
	const body = typeof useInput === "function" && typeof useSession === "function" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistButtonWithHooks, {
		...props,
		useInput,
		useSession
	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistPanel, {
		task: "",
		sid: props.sessionId
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistBoundary, { children: body });
}
/**
* Error boundary: a render throw inside a slot entry makes the slot core retire
* (abdicate) the entry, i.e. the button vanishes with no visible reason. Catch
* it, report it, and keep the rest of the composer intact.
*/
var AssistBoundary = class extends react.default.Component {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error) {
		diagOnce("render:throw", String(error?.stack ?? error));
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
};
//#endregion
//#region src/client/index.ts
/**
* Client services this plugin depends on. The cordis client runtime waits for
* these before invoking `apply`, so `ctx.slots` is guaranteed to exist.
* (Mirrors `exports.inject` in the official skill-explorer bundle.)
*/
const inject = ["slots"];
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
const SLOT_NAME = "conversation.input.right";
const SLOT_ID = "task-assist";
/** Display text the owner projects where a label is needed. */
const SLOT_LABEL = "辅助";
/** Document-relative host route (mirrors the official client convention). */
const PREFIX = "api/task-assist";
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
async function hostFetch(path, init) {
	const first = await fetch(path, init);
	if (first.status !== 404) return first;
	return fetch(`/${path}`, init);
}
/** Fire-and-forget POST that must never throw. */
function beacon(path, body) {
	hostFetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		keepalive: true
	}).catch(() => {});
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
const BUILD = "2026-10-10T01:10+08:00";
function diag(stage, detail) {
	try {
		beacon(DIAG, JSON.stringify({
			build: BUILD,
			stage,
			detail: detail === void 0 ? null : detail
		}));
	} catch {}
}
/**
* Deduplicating beacon.
*
* A slot occupant re-renders on every keystroke, so an unconditional beacon in
* the render path floods the sink — a real observed failure produced hundreds of
* identical lines in half a minute and buried the one line that mattered. Each
* distinct `stage` + payload is reported once, with a hard cap as a backstop.
*/
const seenBeacons = /* @__PURE__ */ new Set();
const MAX_BEACONS = 60;
function diagOnce(stage, detail) {
	let key;
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
	diag("module:loaded", {
		href: typeof location !== "undefined" ? location.href : null,
		origin: typeof location !== "undefined" ? location.origin : null
	});
	for (const delay of [
		1500,
		4e3,
		9e3
	]) try {
		setTimeout(() => diag(`module:alive+${delay}ms`, { applied: applyRan }), delay);
	} catch {}
} catch {}
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
function resolveSlots(ctx) {
	const ok = (s) => s && typeof s.register === "function" ? s : void 0;
	try {
		const viaGet = ok(ctx?.get?.("slots"));
		if (viaGet) return viaGet;
	} catch {}
	try {
		return ok(ctx?.slots);
	} catch {
		return;
	}
}
/** Scan the host for skills/MCP tools matching `task` for `sessionId`. */
async function requestScan(task, sessionId) {
	const params = new URLSearchParams();
	params.set("task", task);
	if (sessionId) params.set("session", sessionId);
	const res = await hostFetch(`${PREFIX}/scan?${params.toString()}`, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`scan failed: ${res.status}`);
	return await res.json();
}
/** Commit the selected skills back to the host for Agent injection. */
async function requestInject(selected, sessionId) {
	const res = await hostFetch(`${PREFIX}/inject`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json"
		},
		body: JSON.stringify({
			selected,
			session: sessionId
		})
	});
	if (!res.ok) throw new Error(`inject failed: ${res.status}`);
	return await res.json();
}
/**
* Announce "this text was just sent" and let the host scan + inject by itself.
*
* Unlike `requestInject`, this carries no selection: the host owns the decision
* (see `autoAssist`). It is called from the render path in response to a draft
* being cleared, so it must never throw into that path — failures resolve to a
* negative `AutoResponse` rather than rejecting.
*/
async function requestAuto(task, sessionId) {
	try {
		const res = await hostFetch(`${PREFIX}/auto`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json"
			},
			body: JSON.stringify({
				task,
				session: sessionId
			})
		});
		if (!res.ok) return {
			ok: false,
			detail: `auto failed: ${res.status}`,
			injected: [],
			scanned: 0
		};
		const data = await res.json();
		return {
			ok: !!data.ok,
			detail: typeof data.detail === "string" ? data.detail : "",
			injected: Array.isArray(data.injected) ? data.injected : [],
			scanned: typeof data.scanned === "number" ? data.scanned : 0
		};
	} catch (e) {
		return {
			ok: false,
			detail: e?.message ?? String(e),
			injected: [],
			scanned: 0
		};
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
const AUTO_KEY = "dsh-task-assist:auto-analyze";
function readAutoEnabled() {
	try {
		return localStorage.getItem(AUTO_KEY) === "1";
	} catch {
		return false;
	}
}
function writeAutoEnabled(on) {
	try {
		localStorage.setItem(AUTO_KEY, on ? "1" : "0");
	} catch {}
}
/**
* Subscribe to the toggle so the panel and the render-path auto trigger observe
* the same value. `storage` only fires in *other* documents, so writers must
* also notify locally — hence the in-page listener set.
*/
const autoListeners = /* @__PURE__ */ new Set();
function subscribeAuto(listener) {
	autoListeners.add(listener);
	return () => {
		autoListeners.delete(listener);
	};
}
function setAutoEnabled(on) {
	writeAutoEnabled(on);
	for (const l of [...autoListeners]) try {
		l(on);
	} catch {}
}
/**
* Register the Assist control into the composer submit row.
*
* Defensive by design: a UI plugin must never brick the shell. A throw here
* leaves this fiber in FAILED, and the client boot then refuses to mount the
* app at all (`web boot: N entry did not activate`). So any failure degrades to
* "button absent" and is reported instead of escalating.
*/
function apply(ctx) {
	applyRan = true;
	try {
		const slots = resolveSlots(ctx);
		diag("apply:start", {
			build: BUILD,
			hasCtx: !!ctx,
			hasSlots: !!slots,
			hasRegister: typeof slots?.register === "function",
			hasInject: typeof slots?.inject === "function",
			hasEffect: typeof ctx?.effect === "function"
		});
		if (!slots) {
			console.error("[dsh-task-assist] ctx.slots 不可用，辅助按钮未挂载");
			diag("apply:no-slots", {
				ctxKeys: ctx ? Object.keys(ctx).slice(0, 40) : null,
				declaredInject: apply.inject ?? null
			});
			return;
		}
		const register = () => slots.register({
			name: SLOT_NAME,
			id: SLOT_ID,
			order: -100,
			label: SLOT_LABEL
		}, AssistButton);
		if (typeof slots.inject === "function") {
			ctx.effect(() => {
				diag("apply:inject-fired", { slot: SLOT_NAME });
				return slots.inject(SLOT_NAME, register);
			}, "dsh-task-assist: input.right seat");
			diag("apply:ok", { mode: "inject" });
		} else {
			register();
			diag("apply:ok", { mode: "direct" });
		}
	} catch (error) {
		console.error("[dsh-task-assist] 客户端挂载失败（辅助按钮不可用，但不影响桌面端启动）:", error);
		diag("apply:throw", String(error?.stack ?? error));
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
apply.inject = inject;
//#endregion
exports.AssistButton = AssistButton;
exports.BUILD = BUILD;
exports.apply = apply;
exports.diag = diag;
exports.diagOnce = diagOnce;
exports.inject = inject;
exports.pickDraft = pickDraft;
exports.readAutoEnabled = readAutoEnabled;
exports.requestAuto = requestAuto;
exports.requestInject = requestInject;
exports.requestScan = requestScan;
exports.setAutoEnabled = setAutoEnabled;
exports.subscribeAuto = subscribeAuto;
exports.writeAutoEnabled = writeAutoEnabled;


return module.exports;
}});
