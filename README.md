# 网页操作与文档读取 · Web Workbench

面向 **DeepSeek Harness Desktop 0.2.1-rc.2** 的原生 Cordis 插件。注册 13 个工具，使用现有 Harness 工具调度、会话日志和系统提示词接口。原有 `web_search` 和 `web_fetch` 保持可用。

**0.2.1 增加侧栏拖拽、正常鼠标光标和输入插入光标，并修复窗口外松手后的卡死清理**。工具和侧栏继续使用同一个 Playwright 浏览器实例、标签页与登录状态。[验证范围](docs/verification.md)。

## 已补充的能力

| 需求 | 实现 |
| --- | --- |
| 打开需要 JavaScript 的网站 | 真实 Edge/Chromium，返回渲染后的文字、元素和标签页 |
| 点击、翻页、输入、选择、提交表单 | 使用最近一次快照中的元素 `ref`；交互后返回新快照 |
| 看见并接管 AI 操作 | 右侧栏“AI 浏览器”显示同一浏览器的实时画面；接管后可点击、滚动、键盘输入和粘贴，AI 浏览器工具暂停 |
| 登录网站 | 在侧栏接管后人工登录、处理验证码/MFA，独立浏览器 profile 与 Cookie 保留在本机 |
| 上传、下载 | 上传已暂存的文件；保存点击产生的下载；直接下载支持当前浏览器的站点 Cookie |
| 读取 PDF 全文 | 下载后二进制解析，按页提取，支持页码和文字分页；扫描页可 OCR |
| 阅读图片文字 | 内置英文和简体中文 OCR 语言文件，运行时无需联网下载 |
| 核对论文公式、插图和布局 | PDF 页面转 PNG，或对网页截图；图像语义需要额外视觉模型 |
| 读取视频 | 通过本机 ffprobe 读取信息，ffmpeg 按时间取帧，再对画面做 OCR |
| 发帖、发邮件、下单等网站写操作 | 可通过网站表单和按钮执行，是否成功应核对页面结果；遵守用户实际授权 |

不能保证站点都接受自动化；不能绕过验证码、MFA、订阅权限或付费墙。图片 OCR 不等于理解图片、图表或视频；本版不包含语音转写或额外视觉模型，不需要填写另一个模型的 API Key。

## 安装

### Windows：独立安装器

先打开过一次 DSH Desktop，然后克隆或下载本仓库，在文件资源管理器中双击 `Install.cmd`。也可以在普通终端运行：

```powershell
git clone https://github.com/CoraEJones/dsh-web-workbench.git
cd dsh-web-workbench
.\Install.cmd
```

安装器使用 DSH 自带运行时打包，再调用官方 `dsh plugin --profile desktop add <压缩包> --ignore-scripts`，同时安装插件依赖；会先备份配置，并将结果写入 `.install-results/install-result.json`。它不手工覆盖 profile 配置，不修改全局权限，不需要管理员账号。Windows 执行策略只对此安装子进程生效。

**请从普通终端或文件资源管理器运行安装器。** 在 DSH 的“工作区内修改”命令工具中运行，仍会受该聊天的沙箱限制，不能因此获得 profile 写权限。

默认使用已安装的 Edge，无需下载 Chromium，浏览器画面显示在 DSH 侧栏。默认安装压缩包而不是源码软链，因此干净克隆也能装齐依赖。保留 `.install-results` 中的安装压缩包，以便 pnpm 后续重装。开发时可给安装脚本加 `-DeveloperLink`，该模式需要先在源码目录安装依赖并保留源码目录。

### 使用 Harness 自带的管理入口

标准模式默认没有 `plugin_manager` 工具。可以切换到提供管理工具的 Creator/创造模式，或使用**侧边栏“插件”页面**安装；设置里的插件列表可能仅供查看。

在提供管理工具的聊天中，可以发送：

```text
请用 plugin_manager 安装插件：action=install_bundle，target=github:CoraEJones/dsh-web-workbench。
使用当前 desktop profile，不手工改 profile 的 package.json 或 cordis.patch.yml。
安装后检查 application 和 warnings，再核对 web_workbench_status、web_browser_open、web_browser_action、web_download_file、pdf_read、image_read。
调用 web_workbench_status 验证工具可用。只有实际生效后才报告已安装；如需重启请明确告诉我。
```

本地安装可将 `target` 改成插件目录的绝对路径。

### 验证是否生效

让 DSH 实际调用 `web_workbench_status`，再打开一个测试网页。**依赖安装成功不等于已经激活。** HMR 开启时，新增工具可以在当前运行实例动态生效；仅在 DSH 报告 `restart-required` 或热加载失败时重启，不必一律新开聊天。

可选的 `verifyOnLoad:true` 会在插件加载时，通过当前 Host 的真实工具调度器运行本机网页与 OCR 自检，输出到 `dataDir/diagnostics/live-host.json`。默认关闭；测试时建议同时设置 `headless:true`，测试完成后恢复设置。自检不调用 LLM，也不访问外部网站。

首次从 0.1.x 升级时，DSH 可能缓存了旧版本不含客户端界面的声明。若工具已出现而“AI 浏览器”入口没有出现，保存工作后重启 DSH。桌面端界面热更新连接失败时，也需要刷新页面或重启；工具加载成功不能证明客户端界面已加载。

## 在右侧栏观看和接管

在右侧栏新增页面中选择“AI 浏览器”。AI 第一次打开网页时，当前会话的侧栏也会自动展开。原有 DSH“浏览器”页仍可使用；共享 AI 浏览器使用单独的“AI 浏览器”页。

点击“接管浏览器”后，新的 AI 浏览器操作会返回 `HUMAN_CONTROL`。已经开始的操作会先结束，手动输入排在它之后，避免双方同时点击。直接点击网页画面，然后输入、粘贴或滚动；中文输入也可使用底部输入栏。点击“交还给 AI”后，AI 需要重新获取快照才能继续。关闭或收起侧栏不会自动交还控制权。

接管后使用正常鼠标光标，悬停到文字输入区、链接和拖拽控件时会显示相应的光标。输入框、文本区和可编辑内容中显示竖直插入光标，随输入、方向键和侧栏缩放更新。

支持按住鼠标拖动网页滑块、进度条、文字选择和拖动控件。指针捕获让拖动可以延续到画面外；取消、失去捕获、切换窗口、隐藏侧栏、交还 AI 或请求中断时会清理按键状态。服务端还会在失联后自动松键，避免浏览器一直处于按下状态。这个能力供人工操作，不代表 AI 可以自动完成验证码。

针对 DSH 0.2.1-rc.2 的分栏拖动，插件会在窗口失焦、丢失捕获或发现漏掉松手时取消残留的宿主手势，并清理 `data-dockkit-pointer`。正常分栏松手先由 DSH 提交布局；插件不会用全局 `pointer-events` 覆盖来绕开宿主交互规则，也不修改 DSH 安装文件。

“选择文件”将本机文件放入当前会话暂存区，供 AI 使用。接管后点击网页的上传按钮，再选择文件，会上传到同一个浏览器；也可使用“上传到当前网页”。网页下载会列在“下载文件”中，可另存到本机，AI 仍能读取同一份暂存文件。

画面采用 JPEG 视口刷新，正常约每 350 毫秒一帧（实际取决于网页和主机性能），不是高帧率视频流。移动事件串行转发并合并尚未发送的中间移动，保留按下和松开的顺序；网站的动画、风控和拖拽实现仍可能影响结果。侧栏隐藏时停止取帧。网站的原生选择菜单可用键盘操作；音视频实时播放、浏览器扩展界面及从系统桌面拖文件进入网页不在本版范围内。

## 使用示例

装好后，直接对 Harness 说：

```text
打开这篇论文的页面，用真实浏览器查找并下载我有权访问的 PDF，读取全文，按页码整理原理和实验参数。遇到登录或验证码先把浏览器交给我，完成后继续。
```

```text
打开这个网站，替我填好表单。提交前先让我检查内容，确认后再提交，并核对成功回执。
```

本地文件先调用 `web_workbench_status` 获得本会话暂存目录，把 PDF、图片、视频或待上传文件复制进去。工具仅能读取和上传该目录内的文件，不允许用路径跳转或符号链接跨出目录。浏览器 Cookie 和登录状态位于其外侧，不属于可读取、上传的文件区。

## 工具速查

| 工具 | 用途 |
| --- | --- |
| `web_workbench_status` | 能力、限制、文件暂存目录 |
| `web_browser_open` | 打开网页；返回 HTTP 状态、正文、元素 `ref` 和标签页 |
| `web_browser_snapshot` | 重新读页面；正文用 `text_offset`、元素用 `element_offset` 继续 |
| `web_browser_action` | `click/fill/select/check/press/upload/scroll/back/reload/switch_tab/dialog/wait` |
| `web_browser_screenshot` | 保存当前视口截图 |
| `web_browser_downloads` | 等待并获取浏览器触发的下载；也检查交互快照中的 `downloads` |
| `web_browser_close` | 关闭本会话浏览器，保留登录状态 |
| `web_download_file` | HTTP(S) 流式下载，`use_browser_session:true` 附加匹配站点 Cookie |
| `pdf_read` | `file`、`page_start`、`page_count`、`char_offset`、`ocr`、`language` |
| `pdf_render` | `file`、1 起算 `page`，返回 PNG 路径 |
| `image_read` | `file`、`ocr`（默认 true）、`language` |
| `video_inspect` | `file`，读取格式、时长、音视频流 |
| `video_frame` | `file`、`seconds`，返回该时间 PNG |

每次快照或操作都会使旧 `ref` 失效。`fill` 后继续使用返回的新 `ref` 点击提交。`select` 的 `text` 填选项 value。`press` 的 `text` 填 `Enter` 等键名。`upload` 使用文件输入框的 `ref`。新标签页需要 `switch_tab`。

浏览器弹窗默认立即取消，避免对话框卡死调用。若明确需要接受下一次确认框，先调用 `web_browser_action(action='dialog',accept=true)`，再点击触发它的按钮；这只对下一次弹窗有效。

读取长 PDF 时，优先按 `next_char_offset` 继续同一个页范围，再按 `next_page` 读取后续页。扫描页 `ocr:true` 只处理没有文本层的页面。复杂公式、多栏文章和表格的提取顺序可能失真，需要 `pdf_render` 核对。

## 设置与运行条件

通过 Harness 的插件设置修改 Config，不需要改源码：

| 配置 | 默认值 |
| --- | --- |
| `dataDir` | 用户目录下 `.dsh/web-workbench` |
| `headless` | `true`，后台运行并在 DSH 侧栏显示同一浏览器；`false` 可额外显示独立窗口 |
| `browserChannel` | `msedge`，也可用 `chrome`；空字符串使用 Playwright Chromium |
| `timeoutMs` | 30000 |
| `maxFileBytes` | 100 MiB |
| `maxTextChars` | 每次 20000 字符 |
| `ocrLanguage` | `eng+chi_sim`，支持 `eng`、`chi_sim` |
| `ffmpegPath` / `ffprobePath` | `ffmpeg` / `ffprobe`，可设绝对路径 |
| `verifyOnLoad` | `false`，是否运行显式的本机 Host 自检 |

Windows 上的 Edge、Node.js 24 和 FFmpeg 已用于测试。运行环境需 Node.js >=22.13；使用空 `browserChannel` 前执行 `pnpm exec playwright install chromium`。视频工具需要 FFmpeg/ffprobe 可用。登录状态按 Harness 会话隔离，同一会话重开保留；新会话不会自动继承另一会话的登录。

直接 HTTP 下载支持流式大小限制、重定向协议验证、取消和残缺文件清理。浏览器点击下载由 Playwright 完成后检查大小；浏览器下载过程中的临时磁盘用量不受该流式上限控制。某些网站还依赖浏览器指纹、动态 token 或挑战，此时应通过浏览器点击下载，不能保证只转移 Cookie 就成功。

该插件会在 Host 进程使用浏览器、网络和文件 API；它不是操作系统沙箱，也不替代 Harness 原有权限政策。网页、PDF、OCR 文本均标记为外部不可信数据，并在系统提示词中明确不得当作指令或用户授权。最终仍需要 Harness 的模型及既有权限机制正确处理这些边界。

不要分享包含浏览器 profile、`auth-state.json` 的数据目录；其中保存了本人的登录会话。不要把它加入版本库。插件不读取 `.credentials.yaml`，不更换模型，也不会自动向真实网站发帖、发邮件或下单。

## 开发、测试与交付状态

```powershell
pnpm install --ignore-scripts
pnpm test
pnpm pack
```

20 项本地测试通过，包括完整拖拽序列、取消与失联松键、过期指针隔离、输入和 iframe 光标位置、分栏残留恢复，以及同一浏览器的 AI/人工联动、上传下载、登录恢复、PDF/OCR/视频与文件边界检查。当前测试需要 Edge、FFmpeg 和 Microsoft YaHei 中文字体。

`test/client.integration.mjs` 另外使用 React 18.2、真实客户端代码和 Edge 检查侧栏事件绑定、滑块拖动、窗口失焦、误触防护、分栏残留恢复和窄侧栏的插入光标。React 只用于独立测试，插件运行时使用 DSH 提供的 React。运行方式：

```powershell
New-Item -ItemType Directory -Force .test-data/client-runtime
pnpm --dir .test-data/client-runtime add react@18.2.0 react-dom@18.2.0 --ignore-scripts
$env:WORKBENCH_REACT_FIXTURES = (Resolve-Path .test-data/client-runtime/node_modules).Path
pnpm test:client
```

另外，`test/native-host.integration.mjs` 可在安装的 DSH Electron 运行时中测试真实 Cordis、SystemPrompt、ToolRuntime 注册与调用。已经完成独立原生运行时验证和正在运行的 Desktop Host 验证。Harness 仍在迭代，其他版本尚未验证。

## 参考

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [Playwright 持久浏览器](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [Playwright 下载](https://playwright.dev/docs/downloads)
- [PDF.js](https://github.com/mozilla/pdf.js)
- [Tesseract.js 本地运行说明](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)

插件自身使用 MIT 许可；依赖保留各自许可和声明。原生图标为本插件绘制。
