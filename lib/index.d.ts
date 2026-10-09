import { Context } from "@deepseek-ai/cordis";

//#region src/server/index.d.ts
declare const ROUTE_PREFIX = "api/task-assist";
interface SkillCandidate {
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
/** Discover all skills from filesystem roots. */
declare function discoverSkills(cwd: string): Promise<SkillMeta[]>;
interface McpToolCandidate {
  name: string;
  description: string;
  source: string;
}
/** Collect installed MCP tools from the loader's connected servers (best-effort). */
declare function discoverMcpTools(ctx: Context): McpToolCandidate[];
interface ScanResult {
  skills: SkillCandidate[];
  mcpTools: McpToolCandidate[];
  query: string;
}
/** Scan and rank everything against the task text. */
declare function scan({
  cwd,
  task,
  ctx
}: {
  cwd: string;
  task: string;
  ctx: Context;
}): Promise<ScanResult>;
/** Build the Agent-facing instruction text for the selected skills. */
declare function buildInjectionText(selected: SkillCandidate[]): string;
/**
 * Commit the selected skills into the current session as a steering message, so
 * the running Agent picks it up like a user prompt and executes on the next
 * step. Returns a human-readable result for the client toast.
 */
declare function injectSelected(ctx: Context, sessionId: string | undefined, selected: SkillCandidate[]): Promise<{
  ok: boolean;
  detail: string;
}>;
interface AutoResult {
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
declare function autoAssist(ctx: Context, sessionId: string | undefined, task: string): Promise<AutoResult>;
/** Cordis function-plugin name (official host halves export this). */
declare const name = "dsh-task-assist";
/**
 * Declared host services.
 *
 * Official host plugins that own webServer routes declare the carrier
 * (`dsh-host-open-in-app`: `inject = ["webServer", "connection", "subprocess"]`).
 * Without the declaration `apply` runs before the service is up, `ctx.webServer`
 * reads `undefined`, and the routes are silently never registered — the panel
 * then only ever reports request errors.
 */
declare const inject: string[];
/** Register the plugin's host routes against a webserver-backed context. */
declare function apply(ctx: Context): void;
//#endregion
export { AutoResult, McpToolCandidate, ROUTE_PREFIX, ScanResult, SkillCandidate, apply, autoAssist, buildInjectionText, discoverMcpTools, discoverSkills, inject, injectSelected, name, scan };