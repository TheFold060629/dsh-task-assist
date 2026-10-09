# dsh-task-assist

DSH（DeepSeek Harness）任务辅助启动器插件。在对话框输入卡 **发送键左侧** 放一个常驻「辅助」按钮：点击后自动扫描本会话已安装的、对当前任务有帮助的 **技能（skills）** 与 **MCP 工具**，弹出候选清单（命中关键词的技能默认勾选），确认后把选中技能作为指令注入当前对话，由正在运行的 Agent 自动加载并按其方法论执行。

## 功能

- **发送键旁常驻按钮**：挂在官方 `conversation.input.right` 槽位（发送/停止键左侧的输入卡工具栏右侧）。
- **自动扫描匹配**：读取输入框当前草稿作为「任务描述」，向后端 `api/task-assist/scan` 发起扫描，对已装技能做关键词打分排序。
- **候选面板**：列出技能（可勾选，命中即默认勾选）与 MCP 工具（陈列），支持取消/确认。
- **一键注入执行**：确认后把勾选技能 `POST` 到 `api/task-assist/inject`，作为 steering 输入进入当前会话，Agent 下一步自动接手执行。

## 安装

把它加进目标 profile 的 `dsh.profile.bundles`，然后重启桌面端：

```bash
dsh plugin --profile <profile-name> add dsh-task-assist
```

> 仓库源码安装（`link:`）：`dsh plugin --profile <name> add link:<本目录>`。
> 注意 `link:` 在本机 profile 里会留成软链，适合开发；正式安装请用包名。

> ⚠️ **不要另外在 profile 的 `cordis.patch.yml` 里手写 `- insert: [dsh-task-assist]`。**
> 本插件自带的 `dsh.bundle.patch`（即包内的 `cordis.patch.yml`）已经会 insert 这一行；
> 再写一次会让同一个 entry id 在补丁栈里出现两次，触发
> `duplicate entry id … (loader-level boot failure)`，桌面端直接起不来。

> 改完 host 端一定要**完全退出再重启**（托盘 → 退出，或任务管理器结束所有
> `DeepSeek Harness.exe`）。只刷新页面不够，原因见下方「开发须知」第 4 条。

## 环境要求

- `dsh >= 0.2.0-rc.2`（见 `package.json` 的 `dsh.engines.dsh`）
- 客户端槽位依赖 `conversation.input.right`，该槽由 `@deepseek-ai/dsh-client-ui-conversation` 声明

## 开发

```bash
pnpm install        # 安装构建依赖
pnpm build          # tsc 类型检查 + tsdown 产出 lib/index.js 与 lib/client.js
```

产物：

- `lib/index.js` — host 端：路由 `api/task-assist/scan`、`api/task-assist/inject`、技能/MCP 枚举与打分。
- `lib/client.js` — 浏览器端：`conversation.input.right` 槽位组件 + 候选面板。

## 开发须知（踩过的坑）

写 DSH 插件有几条不吃亏的硬约束，本插件每一条都真栽过，记在这里省得再试：

1. **绝不写 `export default apply`。**
   插件半体按 `mod.default ?? mod` 解析。一旦有 `default` 导出，拿到的就是那个**裸 `apply` 函数**，
   它**没有声明点**，`inject` 声明读不到 → 客户端 runner 会**拒绝**直接访问服务
   （`ctx.slots` 直接抛异常而不是返回 `undefined`）。
   官方插件（`dsh-client-ui-model-selection`、`dsh-host-open-in-app` 等）`export default` 数量实测为 **0**。
   本项目 host 端结尾是 `export { Config, apply, inject, name }`，client 端同理。
   函数式插件可再补一句 `(apply as any).inject = inject` 兜底。

2. **`slots.inject` 注「槽自身」，不注父槽。**
   认领 `conversation.input.right` 要写 `slots.inject('conversation.input.right', …)`，
   而不是 `slots.inject('conversation.composer.bar', …)`。理由见下方「说明」中的同名条目。
   注错槽会让桌面端**整体起不来**。

3. **标准 hook 是 `SnapshotSelectorHook`，选择器必填。**
   `useInput` / `useSession` 内部走
   `useSyncExternalStoreWithSelector(w.subscribe, w.getSnapshot, void 0, sel, eq)`，
   而 store 会调用 `sel(snapshot)`。所以 **`useInput()` 不带参数会抛 `TypeError: l is not a function`**（压缩后变量名）。
   内核自己也一律用恒等选择器：`useInput((s) => s)`、`useSession((s) => s)`、`useStore((s) => s.draft)`。
   真 `InputState` 形状（内核 `compose()` 产出）：
   `{ draft, attachmentIds, draftRev, phase, claim?, occurrences, queue }`。

4. **改完 host 端必须重启整个进程，HMR 不够。**
   `dsh-client-hmr` 只热换**客户端半体**；Node 侧 host 半体**只在进程启动时读一次产物**。
   这会造出「新客户端 + 旧 host」的混合版本态，看起来完全像插件 bug（症状：按钮出现但接口 404）。
   核对方法：比对 `~/.dsh/dsh-boot-state.json` 里的 `bootedAt` 与 `lib/` 产物的 mtime。

5. **`apply()` 全身套 `try/catch`。**
   客户端 fiber 一旦 FAILED，前端 boot 会**整体 throw**（`web boot: 1 entry did not activate`），
   整个桌面端卡在 "Failed to load plugins"。失败只 `console.error` 并降级成「按钮不出现」。
   宿主侧同理（`startup failed: N required plugins did not activate`）。

排障通道：客户端 `diag(stage, detail)` → `POST api/task-assist/diag` → 宿主追加写
`~/.dsh/rescue/task-assist-client.log`（用 `diagOnce()` 去重，避免刷屏）。

## 工作原理

```
用户输入任务 → 点【辅助】→ client 读 useInput().draft
  → GET  api/task-assist/scan?task=..&session=..
  → host 扫描技能根目录(~/.agents/skills、~/.dsh/skills、项目 .dsh/.agents/skills)
     + 枚举已连 MCP server 工具，对 task 关键词打分排序
  → 面板展示候选（命中默认勾选）
  → 用户点【启动辅助】→ POST api/task-assist/inject {selected, session}
  → host 组装注入指令 → ctx.agents.get(sessionId).steer(message) 提交 steering 输入
  → 运行中的 Agent 在下一步拾取并按所选技能执行
```

## 说明

- 扫描是**只读**的：只枚举技能元信息（name/description）与 MCP 工具名，不执行任何技能、不调用任何业务工具。
- 注入是**提示级**指令（作为 steering 输入进入会话），不是直接代跑技能；是否真的加载/执行由 Agent 按上下文判断。
- 注入经 `ctx.agents` 的 `steer()` 提交，消息 source 固定为 `plugin:dsh-task-assist`。
  V4 会话格式要求 **producer-owned** source kind —— 写成旧的 `{ kind: 'plugin', plugin: … }`
  会让**整轮对话被拒**，而不是只让注入失败。
- 客户端槽位认领是 **`slots.inject('conversation.input.right', …)` —— 注「槽自身」**，
  不要注父槽 `conversation.composer.bar`。
  `slots.inject(key, cb)` 订阅的是 `key` **自己的声明 epoch**，那才是它变得可注册的时刻；
  而 `conversation.input.right` 与父槽 `conversation.composer.bar` 在注册序列里差了 4 步，
  注父槽会在子槽尚未声明时触发回调，抛
  `slot "conversation.input.right" is not declared (a parent entry's children table must declare it)`，
  并使客户端 fiber FAILED → 整个 `web boot` 抛 `1 entry did not activate`，桌面端起不来。
- 两侧 `apply()` 全身套 `try/catch`：客户端 fiber 一旦 FAILED，前端 boot 会**整体 throw**，
  失败只 `console.error` 并降级成「按钮不出现」，绝不拖死宿主。
- 技能来源分级：`user-agents` / `user-dsh` / `project-dsh` / `project-agents` / `bundled` / `other`，同分时按此优先级展示。
- 请求围栏只拒绝**明确跨站**的请求：桌面端 Electron 渲染层的 Origin 是 `dsh-app://app`，
  与 Host（`127.0.0.1:<port>`）永不相等，严格 `origin === host` 会把桌面端请求全部 403。

## License

MIT
