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
const panelStyle = {
	position: "absolute",
	right: "0",
	bottom: "calc(100% + 46px)",
	width: "min(440px, 78vw)",
	maxHeight: "min(60vh, 520px)",
	overflow: "auto",
	background: "var(--ds-h-bg-3, #ffffff)",
	color: "var(--ds-h-fg, #1c1c1e)",
	border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
	borderRadius: "14px",
	boxShadow: "0 12px 40px rgba(0,0,0,.24)",
	padding: "12px",
	zIndex: 90,
	textAlign: "left"
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
	position: "absolute",
	right: "0",
	bottom: "calc(100% + 8px)",
	width: "min(320px, 70vw)",
	border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
	background: "var(--ds-h-bg-3, #fff)",
	color: "var(--ds-h-fg, #1c1c1e)",
	borderRadius: "10px",
	padding: "8px 12px",
	fontSize: "12px",
	cursor: "pointer",
	zIndex: 95
};
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
	const openPanel = (0, react.useCallback)(async () => {
		setError(null);
		setResult(null);
		setLoading(true);
		try {
			const scan = await requestScan(task || "", sid);
			setResult(scan);
			const init = {};
			for (const s of scan.skills) init[`skill:${s.name}`] = s.score > 0;
			setChecked(init);
			setOpen(true);
		} catch (e) {
			setError(e?.message ?? String(e));
			setOpen(true);
		} finally {
			setLoading(false);
		}
	}, [task, sid]);
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
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			position: "relative",
			display: "inline-flex"
		},
		"data-dsh-task-assist": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				"aria-label": "任务辅助（自动匹配已装技能/工具）",
				title: "任务辅助：自动搜索已装技能/工具并帮你执行",
				style: rowStyle,
				onClick: openPanel,
				disabled: loading,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
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
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "辅助" })]
			}),
			open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: panelStyle,
				role: "dialog",
				"aria-label": "任务辅助候选",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: "8px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: { fontSize: "14px" },
							children: "任务辅助"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setOpen(false),
							"aria-label": "关闭",
							style: {
								border: "none",
								background: "none",
								cursor: "pointer",
								fontSize: "16px",
								color: "inherit"
							},
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
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: "13px",
							opacity: .7
						},
						children: "扫描中…"
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontSize: "13px",
							color: "#c0392b"
						},
						children: ["扫描失败：", error]
					}),
					result && !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						result.skills.length === 0 && result.mcpTools.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: "13px",
								opacity: .7
							},
							children: "未发现可用的技能/工具。"
						}),
						result.skills.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								fontSize: "12px",
								fontWeight: 600,
								margin: "6px 0 4px"
							},
							children: [
								"技能（",
								result.skills.length,
								"）"
							]
						}), result.skills.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								...itemStyle,
								cursor: "pointer"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: !!checked[`skill:${s.name}`],
								onChange: () => toggle(`skill:${s.name}`)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { fontWeight: 600 },
									children: s.name
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
						}, `skill:${s.name}`))] }),
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
							marginTop: "12px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setOpen(false),
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
							children: loading ? "提交中…" : "启动辅助 🚀"
						})]
					})
				]
			}),
			toast && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => setToast(null),
				style: toastStyle,
				"aria-live": "polite",
				children: [toast, " ✕"]
			})
		]
	});
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
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistPanel, {
		task: pickDraft(input),
		sid: sessionId ?? session?.id ?? session?.sessionId ?? void 0
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
const BUILD = "2026-10-09T16:05+08:00";
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
exports.requestInject = requestInject;
exports.requestScan = requestScan;


return module.exports;
}});
