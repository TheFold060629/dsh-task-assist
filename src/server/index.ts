/**
 * dsh-task-assist host half.
 *
 * Responsibilities:
 *  1. Expose `api/task-assist/scan` — scan the current session's available
 *     skills (filesystem roots + loader rows) and MCP tools, rank candidates
 *     against the task text, return an ordered list for the client panel.
 *  2. Expose `api/task-assist/inject` — commit the user's selected skill names
 *     back to the host as an injection the Agent will load and execute.
 *  3. Expose `api/task-assist/auto` — the "自动分析适配技能" path. Instead of
 *     the user picking from the panel, the client announces "this text was just
 *     sent" and the host scans + injects on its own. Kept as a separate route
 *     from `/inject` because the two differ in *who decides*: `/inject` carries
 *     a user-curated list and must honour it verbatim, `/auto` decides for
 *     itself and must be free to inject nothing.
 *
 * Injection goes through the live Agent handle (`ctx.agents`), the same path the
 * official `session/prompt` command uses: `agent.steer(message)` submits input
 * for the next step and wakes the driver. The message's `source.kind` MUST be a
 * producer-owned kind (`plugin:<name>`) — the V4 session format rejects the old
 * `{ kind: 'plugin', plugin: … }` shape, and a single illegal source fails the
 * whole turn rather than just the injection.
 *
 * The client half talks to these routes by document-relative fetch
 * (`api/task-assist/...`), mirroring the official client convention.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Context } from "@deepseek-ai/cordis";

export const ROUTE_PREFIX = "api/task-assist";

/**
 * Diagnostic sink.
 *
 * The desktop shell does not persist the renderer console, so when the client
 * half fails to put its button on screen there is nothing to read afterwards.
 * The client therefore beacons what it observed to `api/task-assist/diag`, and
 * this half appends it to `~/.dsh/rescue/task-assist-client.log` — next to the
 * other dsh rescue tooling. Diagnostics only: failures here are swallowed, and
 * the file is capped so it can never grow without bound.
 */
const DIAG_LOG = join(homedir(), ".dsh", "rescue", "task-assist-client.log");
const DIAG_LOG_MAX_BYTES = 512 * 1024;

/**
 * Build marker. Bump whenever the diagnostics change, so the log unambiguously
 * identifies which artifact is live — a stale desktop process would otherwise
 * look exactly like a plugin that never mounted.
 */
const HOST_BUILD = "2026-10-10T00:30+08:00";

function logDiag(line: string): void {
  try {
    mkdirSync(dirname(DIAG_LOG), { recursive: true });
    if (existsSync(DIAG_LOG) && statSync(DIAG_LOG).size > DIAG_LOG_MAX_BYTES) {
      writeFileSync(DIAG_LOG, `--- truncated at ${new Date().toISOString()} ---\n`, "utf8");
    }
    appendFileSync(DIAG_LOG, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* diagnostics must never break the host */
  }
}

/** Producer-owned source kind required by the V4 session format. */
const PLUGIN_SOURCE_KIND = "plugin:dsh-task-assist";

/** Cap how much of a skill description we echo into the injected instruction. */
const MAX_DESCRIPTION_IN_INJECTION = 240;

/* ------------------------------------------------------------------ */
/* Skill discovery                                                    */
/* ------------------------------------------------------------------ */

export interface SkillCandidate {
  name: string;
  description: string;
  path: string;
  level: "project-dsh" | "project-agents" | "user-agents" | "user-dsh" | "bundled" | "other";
  score: number;
  reason: string;
}

interface SkillMeta {
  name: string;
  description: string;
  path: string;
  level: SkillCandidate["level"];
}

/**
 * Read one frontmatter scalar, tolerating quoted values, trailing comments and
 * folded (`>`) / literal (`|`) block scalars — real SKILL.md descriptions are
 * frequently long and quoted.
 */
function readFrontmatterScalar(fm: string, key: string): string | undefined {
  const line = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  if (!line || line.index === undefined) return undefined;
  let value = line[1].trim();

  if (/^[>|][+-]?\d*$/.test(value)) {
    // Block scalar: collect the indented lines that follow the key line.
    const rest = fm.slice(line.index + line[0].length).split(/\r?\n/);
    const body: string[] = [];
    for (const l of rest) {
      if (l.trim() === "") {
        if (body.length) body.push("");
        continue;
      }
      if (!/^\s/.test(l)) break;
      body.push(l.trim());
    }
    value = body.join(" ").trim();
  }

  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) value = quoted[2];
  return value.trim() || undefined;
}

/** Read name/description out of a SKILL.md frontmatter. */
function parseSkillMeta(file: string): Partial<SkillMeta> {
  try {
    const raw = readFileSync(file, "utf8");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    return {
      name: readFrontmatterScalar(m[1], "name"),
      description: readFrontmatterScalar(m[1], "description"),
    };
  } catch {
    return {};
  }
}

/** Scan one skill root: <name>/SKILL.md or <name>.md. */
async function scanRoot(root: string, level: SkillCandidate["level"], into: Map<string, SkillMeta>): Promise<void> {
  if (!existsSync(root)) return;
  let entries: string[];
  try {
    entries = await readdir(root, { withFileTypes: true }).then((ds) => ds.map((d) => d.name));
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(root, name);
    try {
      const st = await stat(p);
      let file = "";
      if (st.isDirectory()) file = join(p, "SKILL.md");
      else if (name.endsWith(".md")) file = p;
      if (!file || !existsSync(file)) continue;
      const meta = parseSkillMeta(file);
      if (!meta.name) continue;
      into.set(meta.name, {
        name: meta.name,
        description: meta.description ?? "",
        path: file,
        level,
      });
    } catch {
      /* ignore unreadable entries */
    }
  }
}

/**
 * Lower rank wins on a score tie. `bundled` / `other` are reserved for roots
 * that may be added later; keeping them in the table preserves the ordering
 * contract without widening the level union.
 */
const SOURCE_RANK: Record<SkillCandidate["level"], number> = {
  "user-agents": 0,
  "user-dsh": 1,
  "project-dsh": 2,
  "project-agents": 3,
  bundled: 4,
  other: 5,
};

/** Collect all discoverable skill roots (standard conventions). */
function skillRoots(cwd: string): Array<[string, SkillCandidate["level"]]> {
  const home = homedir();
  const roots: Array<[string, SkillCandidate["level"]]> = [];
  roots.push([join(home, ".agents", "skills"), "user-agents"]);
  roots.push([join(home, ".dsh", "skills"), "user-dsh"]);
  roots.push([join(cwd, ".dsh", "skills"), "project-dsh"]);
  roots.push([join(cwd, ".agents", "skills"), "project-agents"]);
  return roots;
}

/** Discover all skills from filesystem roots. */
export async function discoverSkills(cwd: string): Promise<SkillMeta[]> {
  const byName = new Map<string, SkillMeta>();
  await Promise.all(skillRoots(cwd).map(([root, level]) => scanRoot(root, level, byName)));
  return [...byName.values()];
}

/* ------------------------------------------------------------------ */
/* MCP tool discovery (best-effort, non-fatal)                        */
/* ------------------------------------------------------------------ */

export interface McpToolCandidate {
  name: string;
  description: string;
  source: string;
}

/** Collect installed MCP tools from the loader's connected servers (best-effort). */
export function discoverMcpTools(ctx: Context): McpToolCandidate[] {
  const out: McpToolCandidate[] = [];
  try {
    // Contemporary DSH exposes the tool registry with names like
    // mcp__<server>__<tool>. Enumerate it defensively across several known
    // service keys so a renamed internal service degrades to empty, not crash.
    for (const key of ["tools", "mcp", "mcpServerTools"]) {
      const svc = (ctx as any).get?.(key) ?? (ctx as any)[key];
      if (!svc || typeof svc.list !== "function") continue;
      const list = svc.list();
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        const name = typeof t === "string" ? t : t?.name;
        const description = typeof t === "object" && t ? (t as any).description ?? "" : "";
        if (typeof name === "string" && name) {
          const parts = name.split("__");
          const source = parts.length >= 2 ? parts.slice(0, 2).join("__") : "mcp";
          out.push({ name, description, source });
        }
      }
      if (out.length) break;
    }
  } catch {
    /* never crash the route */
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                            */
/* ------------------------------------------------------------------ */

/** Case-insensitive substring scoring of a candidate description/name. */
function scoreAgainst(text: string, name: string, description: string): { score: number; reason: string } {
  const hay = `${name}\n${description}`.toLowerCase();
  const tokens = text
    .toLowerCase()
    .split(/[\s,，。；;、/\\()\[\]{}-]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return { score: 0, reason: "无有效任务关键词" };

  let hits = 0;
  const hitTokens: string[] = [];
  for (const t of tokens) {
    if (hay.includes(t)) {
      hits++;
      hitTokens.push(t);
    }
  }
  // Semantic-ish boost: if the name itself contains a hit token, weight higher.
  const nameLower = name.toLowerCase();
  const nameHits = tokens.filter((t) => nameLower.includes(t)).length;
  const score = hits + nameHits * 2;
  const reason = hits > 0 ? `命中关键词: ${hitTokens.slice(0, 5).join("、")}` : "无关键词命中";
  return { score, reason };
}

export interface ScanResult {
  skills: SkillCandidate[];
  mcpTools: McpToolCandidate[];
  query: string;
}

/** Scan and rank everything against the task text. */
export async function scan({
  cwd,
  task,
  ctx,
}: {
  cwd: string;
  task: string;
  ctx: Context;
}): Promise<ScanResult> {
  const skills = await discoverSkills(cwd);
  const ranked: SkillCandidate[] = skills
    .filter((s) => s.description) // require a description so matching is meaningful
    .map((s) => {
      const { score, reason } = scoreAgainst(task, s.name, s.description);
      return { ...s, score, reason };
    })
    .sort((a, b) => b.score - a.score || SOURCE_RANK[a.level] - SOURCE_RANK[b.level]);

  const mcpTools = discoverMcpTools(ctx);
  return { skills: ranked, mcpTools, query: task };
}

/* ------------------------------------------------------------------ */
/* Injection                                                          */
/* ------------------------------------------------------------------ */

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Build the Agent-facing instruction text for the selected skills. */
export function buildInjectionText(selected: SkillCandidate[]): string {
  if (selected.length === 0) return "";
  const bullets = selected
    .map((s) => `- \`${s.name}\` — ${truncate(s.description, MAX_DESCRIPTION_IN_INJECTION)}`)
    .join("\n");
  return [
    "【任务辅助启动】用户已选中的以下技能/工具与本任务高度相关，请优先加载并按其方法论执行：",
    "",
    bullets,
    "",
    "（这些技能由 dsh-task-assist 自动推荐；若某项确实不适用，请说明并跳过。）",
  ].join("\n");
}

/** Best-effort lookup of the current session id. */
function currentSessionId(ctx: Context): string | undefined {
  try {
    const sessions = (ctx as any).get?.("sessions") ?? (ctx as any).sessions;
    const s = sessions?.current ?? sessions?.active;
    return s?.id ?? s?.sessionId ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the live Agent for a session. The agent registry keys agents by the
 * same id as their session, so `agents.get(sessionId)` is the direct lookup —
 * the official prompt path asserts exactly this (`agents.get(agent.id)` with
 * `sessionId: agent.id` in its error payload).
 */
function resolveAgent(ctx: Context, sessionId: string): any {
  try {
    const agents = (ctx as any).agents ?? (ctx as any).get?.("agents");
    if (!agents || typeof agents.get !== "function") return undefined;
    return agents.get(sessionId);
  } catch {
    return undefined;
  }
}

/**
 * Build the user-role message handed to the Agent. Prefers the host's own
 * `createUserMessage` (the same helper the official prompt path uses) and falls
 * back to the documented shape `{ role, content, source }` when that module is
 * not resolvable from the plugin.
 */
async function buildUserMessage(text: string): Promise<unknown> {
  const content = [{ type: "text", text }];
  const source = { kind: PLUGIN_SOURCE_KIND };
  try {
    // The host resolves this at runtime; it is deliberately NOT a compile-time
    // dependency (the package is not resolvable from a plugin's own tree).
    // @ts-ignore -- optional host-provided module
    const llm: any = await import("@deepseek-ai/dsh-llm");
    if (typeof llm?.createUserMessage === "function") {
      return llm.createUserMessage({ content, source });
    }
  } catch {
    /* module not exposed to plugins — fall through to the plain shape */
  }
  return { role: "user", content, source };
}

/**
 * Commit the selected skills into the current session as a steering message, so
 * the running Agent picks it up like a user prompt and executes on the next
 * step. Returns a human-readable result for the client toast.
 */
export async function injectSelected(
  ctx: Context,
  sessionId: string | undefined,
  selected: SkillCandidate[],
): Promise<{ ok: boolean; detail: string }> {
  const text = buildInjectionText(selected);
  if (!text) return { ok: false, detail: "未选中任何技能" };

  const target = sessionId ?? currentSessionId(ctx);
  if (!target) return { ok: false, detail: "无法确定目标会话" };

  const agent = resolveAgent(ctx, target);
  if (!agent) return { ok: false, detail: `会话 ${target} 没有运行中的 agent` };

  // `steer()` submits input for the next step and wakes the driver; `followup()`
  // would queue a whole new turn. Prefer steer, degrade to followup.
  const deliver =
    typeof agent.steer === "function"
      ? agent.steer.bind(agent)
      : typeof agent.followup === "function"
        ? agent.followup.bind(agent)
        : undefined;
  if (!deliver) return { ok: false, detail: "agent 未暴露 steer/followup 注入方法" };

  try {
    const message = await buildUserMessage(text);
    deliver(message);
    return { ok: true, detail: `已向会话 ${target} 注入 ${selected.length} 项技能` };
  } catch (e) {
    return { ok: false, detail: `注入失败: ${(e as Error)?.message ?? String(e)}` };
  }
}

/**
 * Auto mode's threshold, and *only* auto mode's.
 *
 * A human browsing the panel can see a zero-score row and judge it; an
 * unattended injection cannot. `score > 0` means "at least one task keyword
 * appears in this skill's name or description", which is the weakest signal
 * that is still evidence rather than noise. Note this is deliberately NOT
 * applied in `scan()`: the panel must keep showing everything so the search box
 * has something to search, and so the user can rescue a skill the scorer missed.
 */
const AUTO_MIN_SCORE = 1;

export interface AutoResult {
  ok: boolean;
  detail: string;
  /** Names actually injected — empty when nothing cleared the threshold. */
  injected: string[];
  /** How many candidates were examined, for the client toast/log. */
  scanned: number;
}

/**
 * Scan `task` and inject whatever clears the auto threshold, without asking.
 *
 * Every early return is a *success* with `injected: []`, not a failure: a task
 * that matches no skill is the common case and must not surface an error to the
 * user. Only "the injection itself blew up" reports `ok: false`.
 */
export async function autoAssist(
  ctx: Context,
  sessionId: string | undefined,
  task: string,
): Promise<AutoResult> {
  if (!task.trim()) return { ok: true, detail: '空任务，跳过自动分析', injected: [], scanned: 0 };

  const target = sessionId ?? currentSessionId(ctx);
  if (!target) return { ok: true, detail: '无法确定目标会话，跳过', injected: [], scanned: 0 };

  let result: ScanResult;
  try {
    result = await scan({ cwd: resolveCwd(ctx, target), task, ctx });
  } catch (e) {
    return { ok: false, detail: `扫描失败: ${(e as Error)?.message ?? String(e)}`, injected: [], scanned: 0 };
  }

  const hits = result.skills.filter((s) => s.score >= AUTO_MIN_SCORE);
  const scanned = result.skills.length;
  if (hits.length === 0) {
    return { ok: true, detail: `自动分析：${scanned} 个技能均未命中`, injected: [], scanned };
  }

  const resp = await injectSelected(ctx, target, hits);
  return {
    ok: resp.ok,
    detail: resp.ok ? `自动分析命中 ${hits.length} 项：${resp.detail}` : resp.detail,
    injected: hits.map((s) => s.name),
    scanned,
  };
}

/* ------------------------------------------------------------------ */
/* Host entry + routes                                                */
/* ------------------------------------------------------------------ */

/** Resolve the workspace root / cwd for the current session. */
function resolveCwd(ctx: Context, sessionId: string | undefined): string {
  try {
    const sessions = (ctx as any).get?.("sessions") ?? (ctx as any).sessions;
    const s = sessionId ? sessions?.get?.(sessionId) : sessions?.current ?? sessions?.active;
    const cwd = s?.cwd ?? s?.workspace ?? process.cwd();
    return typeof cwd === "string" && cwd ? cwd : process.cwd();
  } catch {
    return process.cwd();
  }
}

/**
 * Request fence.
 *
 * The official skill-explorer fence requires `origin.host === host`, which never
 * holds on the desktop shell: the Electron renderer sends `Origin: dsh-app://app`
 * while Host is `127.0.0.1:<port>` — that combination would 403 every request.
 * We therefore reject only *explicit* cross-site requests and otherwise defer to
 * the kernel's own Host/Origin trust fence.
 */
function isTrustedRequest(req: any): boolean {
  try {
    if (req?.headers?.["sec-fetch-site"] === "cross-site") return false;
    const origin = req?.headers?.origin;
    if (origin === undefined) return true; // same-origin navigation / non-browser client
    if (typeof origin === "string" && origin.startsWith("dsh-app://")) return true; // desktop shell
    const host = req?.headers?.host;
    if (typeof host !== "string" || !host) return false;
    return new URL(origin).host === new URL(`http://${host}`).host;
  } catch {
    return false;
  }
}

/** Validate and normalize the client-supplied selection before trusting it. */
function parseSelection(parsed: any): SkillCandidate[] {
  const raw = Array.isArray(parsed?.selected) ? parsed.selected : [];
  const levels: SkillCandidate["level"][] = [
    "project-dsh",
    "project-agents",
    "user-agents",
    "user-dsh",
    "bundled",
    "other",
  ];
  return raw
    .filter((s: any) => s && typeof s.name === "string" && s.name.trim() !== "")
    .map((s: any) => ({
      name: String(s.name),
      description: typeof s.description === "string" ? s.description : "",
      path: typeof s.path === "string" ? s.path : "",
      level: levels.includes(s.level) ? s.level : "other",
      score: typeof s.score === "number" ? s.score : 0,
      reason: typeof s.reason === "string" ? s.reason : "",
    }));
}

/** Cordis function-plugin name (official host halves export this). */
export const name = "dsh-task-assist";

/**
 * Declared host services.
 *
 * Official host plugins that own webServer routes declare the carrier
 * (`dsh-host-open-in-app`: `inject = ["webServer", "connection", "subprocess"]`).
 * Without the declaration `apply` runs before the service is up, `ctx.webServer`
 * reads `undefined`, and the routes are silently never registered — the panel
 * then only ever reports request errors.
 */
export const inject = ["webServer"];

/** Register the plugin's host routes against a webserver-backed context. */
export function apply(ctx: Context): void {
  // Host-side mirror of the client's defensive contract: a throw inside `apply`
  // marks this entry required-but-not-activated, which aborts the whole host
  // boot (`startup failed: N required plugins did not activate`). Losing the two
  // routes degrades to "the panel reports a request error"; bricking the
  // desktop does not.
  try {
    // `ctx.get(name)` is the *optional* lookup and is not gated by the fiber's
    // declaration; the property read is kept as a fallback for hosts that seat
    // the service directly. Probe `get` first, then the property.
    const server =
      (() => {
        try {
          const viaGet = (ctx as any).get?.("webServer");
          if (viaGet && typeof viaGet.register === "function") return viaGet;
        } catch {
          /* gated access — fall through */
        }
        try {
          return (ctx as any).webServer;
        } catch {
          return undefined;
        }
      })() ?? undefined;
    logDiag(
      `host:apply build=${HOST_BUILD} webServer=${server && typeof server.register === "function" ? "yes" : "no"} ` +
        `ctxKeys=${ctx ? Object.keys(ctx as any).slice(0, 40).join(",") : "none"}`,
    );
    if (!server || typeof server.register !== "function") {
      // A no-server context (tests, headless) simply registers nothing.
      logDiag("host:apply no-webServer — routes not registered");
      return;
    }

    // Each route rides the plugin fiber, so unload disposes it (official shape:
    // `ctx.effect(() => ctx.webServer.register({...}), label)`).
    const route = (row: any, label: string): void => {
      try {
        ctx.effect(() => server.register(row), `dsh-task-assist: ${label}`);
      } catch {
        // No effect seat (bare test context): register directly.
        server.register(row);
      }
    };

    // Registered first on purpose: this is the only channel through which the
    // client half can be observed, so it must not be lost to a later failure.
    route(
      {
        kind: "prefix",
        path: `/${ROUTE_PREFIX}/diag`,
        handler: async (req: any, res: any) => {
          try {
            let body = "";
            for await (const chunk of req) body += chunk;
            logDiag(`client ${body}`);
          } catch (e) {
            logDiag(`client (unreadable body) ${String((e as Error)?.message ?? e)}`);
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true}');
        },
      },
      `POST /${ROUTE_PREFIX}/diag`,
    );

    route(
      {
        kind: "prefix",
        path: `/${ROUTE_PREFIX}/scan`,
        handler: async (req: any, res: any) => {
          if (!isTrustedRequest(req)) {
            res.writeHead(403).end();
            return;
          }
          try {
            const u = new URL(req.url ?? "", "http://localhost");
            const task = u.searchParams.get("task") ?? "";
            const sid = u.searchParams.get("session") ?? undefined;
            const cwd = resolveCwd(ctx, sid);
            const result = await scan({ cwd, task, ctx });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error)?.message ?? String(e) }));
          }
        },
      },
      `GET /${ROUTE_PREFIX}/scan`,
    );

    route(
      {
        kind: "prefix",
        path: `/${ROUTE_PREFIX}/inject`,
        handler: async (req: any, res: any) => {
          if (!isTrustedRequest(req)) {
            res.writeHead(403).end();
            return;
          }
          try {
            let body = "";
            for await (const chunk of req) body += chunk;
            let parsed: any = {};
            try {
              parsed = JSON.parse(body || "{}");
            } catch {
              parsed = {};
            }
            const selected = parseSelection(parsed);
            const sid: string | undefined = typeof parsed?.session === "string" ? parsed.session : undefined;
            const result = await injectSelected(ctx, sid, selected);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error)?.message ?? String(e) }));
          }
        },
      },
      `POST /${ROUTE_PREFIX}/inject`,
    );

    route(
      {
        kind: "prefix",
        path: `/${ROUTE_PREFIX}/auto`,
        handler: async (req: any, res: any) => {
          if (!isTrustedRequest(req)) {
            res.writeHead(403).end();
            return;
          }
          try {
            let body = "";
            for await (const chunk of req) body += chunk;
            let parsed: any = {};
            try {
              parsed = JSON.parse(body || "{}");
            } catch {
              parsed = {};
            }
            const task: string = typeof parsed?.task === "string" ? parsed.task : "";
            const sid: string | undefined = typeof parsed?.session === "string" ? parsed.session : undefined;
            const result = await autoAssist(ctx, sid, task);
            // The auto path runs unattended, so the log is the only record of
            // why a given message did or did not get help. Always write a line.
            logDiag(
              `auto session=${sid ?? "-"} scanned=${result.scanned} injected=${result.injected.length} ` +
                `ok=${result.ok} detail=${result.detail}`,
            );
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (e) {
            logDiag(`auto-throw ${String((e as Error)?.stack ?? e)}`);
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: (e as Error)?.message ?? String(e) }));
          }
        },
      },
      `POST /${ROUTE_PREFIX}/auto`,
    );

    logDiag("host:apply routes registered (diag, scan, inject, auto)");
  } catch (error) {
    console.error(
      '[dsh-task-assist] 宿主路由注册失败（面板会报请求错误，但不影响桌面端启动）:',
      error,
    );
    logDiag(`host:apply-throw ${String((error as Error)?.stack ?? error)}`);
  }
}

/**
 * Declare the dependency on the callable too.
 *
 * A loader that resolves `mod.default ?? mod` would otherwise hand the runtime
 * this bare function, which has no declaration site — the `inject` list above
 * would never be read and `webServer` would stay unresolvable.
 */
(apply as any).inject = inject;

// NOTE: deliberately NO `export default`.
// Official host halves end with `export { Config, apply, inject, name }`. With a
// default export present, `mod.default ?? mod` resolves to the function and the
// declaration above is lost.
