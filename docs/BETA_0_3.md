# OnceHere Beta 0.3 验收台账

2026-10-28。用户体验以 [PRODUCT.md](PRODUCT.md) 为准，迭代范围见 [ROADMAP.md](ROADMAP.md)。本台账区分自动化验证、桌面浏览器验证、真实 Android 和真实用户验证；后一类不能由前一类替代。

## 代码基线与交付

- 起点：最新照片导入分支 `feat/photo-first-onboarding` @ `cac3e97`，当时比远端主干多 18 个提交。
- `beta/0.3-foundation` 已通过 [PR #3](https://github.com/voyokee/ohmytrace/pull/3) 合入主干 `afc902d`；Web / Android / 分享入口统一为 OnceHere，保留旧安装包、数据库和备份格式标识以兼容数据。
- PR 三项检查和主干 CI 均通过：[主干 Web](https://github.com/voyokee/ohmytrace/actions/runs/40508957693)、[主干 Android 与 APK](https://github.com/voyokee/ohmytrace/actions/runs/40508957619)。已建立 `v0.2.0` 基线标签，指向 `afc902d`。
- Web CI 覆盖 Node 20 / 24；Android CI 使用 JDK 17、SDK / Build Tools 35、校验 SHA-256 的 Gradle 8.11.1，运行 JVM 单测、Lint，构建 Debug、测试与未签名 Release APK，再禁用缓存重跑全部 Release 任务、逐字节比较 APK。
- 可撤销编辑领域基础已通过 [PR #4](https://github.com/voyokee/ohmytrace/pull/4) 合入 `5521cfd`，见 [TRUSTED_EDITS.md](TRUSTED_EDITS.md)。统一卡片已通过 [PR #6](https://github.com/voyokee/ohmytrace/pull/6) 合入 `b457826`，见 [TRUSTED_EDITS.md](TRUSTED_EDITS.md)。
- 深港沿海归属、机场 / 路过推断、城市标题与升级重扫已通过 [PR #5](https://github.com/voyokee/ohmytrace/pull/5) 合入 `f75506f`；[Web](https://github.com/voyokee/ohmytrace/actions/runs/40543530986) 与 [Android](https://github.com/voyokee/ohmytrace/actions/runs/40543530999) 主干 CI 全绿，见 [BORDER_TRANSIT_FIX.md](BORDER_TRANSIT_FIX.md)。
- 当前开发 `beta/0.3-first-confirmation`：Android / Web 自动导入后的最多三问、阶段草稿与首次短回放，见 [FIRST_USE.md](FIRST_USE.md)。
- `v0.3.0` 尚未发布，完整退出标准继续逐项验证。
- I2-A/B 已通过 [PR #9](https://github.com/voyokee/ohmytrace/pull/9) 合入 `a40e65c`，Node 20 / 24 与 Android / APK 检查全绿。I2-C/D/E 从该主干切出 `beta/0.3-data-sovereignty`。

## 退出标准追踪

| 标准 | 当前状态 | 所需证据 |
|---|---|---|
| PR 合入 main、CI 全绿、可复现 Web / APK、v0.3.0 | 进行中 | PR、主干运行链接、构建清单与校验和、标签 |
| 至少两台 Android，包含 vivo 和中档机 | 未测，目前无可用设备 | 下表的真机记录、系统版本和 WebView 版本 |
| 1k / 5k+ 真实相册，首城 ≤ 60 s，无崩溃 | 未测 | 原始计时、导入计数、异常日志 |
| 中档机全球中位数 ≥ 30 FPS、P95 帧间隔 | 未测 | 测量场景、样本数量、原始帧间隔与汇总 |
| 切后台 / 恢复、杀进程后续扫 | 未测 | 中断前后计数与稳定 ID、检查点和权限状态 |
| 用户可见名称统一，无系统词进入主流程 | 进行中 | 已有入口名称检查；后续统一卡片与首次使用验收 |
| 国家 / 地区显示与计数、默认离线地名查询 | 自动化与桌面浏览器已验证，真机待测；争议默认待法务复核 | `CN_REGION_POLICY.md`、代表坐标、242 包出口、存量数据与逐条同意回归 |
| 最多三问、生成阶段草稿、无需输入日期格式 | 自动化与桌面浏览器已验证，真机待测 | 领域与浏览器用例，首次使用计时 |
| 城市 / 常驻 / 旅程来源、统一卡片纠错、撤销与重新整理保留修改 | 统一卡片与自动化已验证，真机待测 | 各实体编辑命令、撤销、重新整理回归 |
| 完整备份跨设备恢复实体和 ID 零差异 | 自动化与桌面独立配置已验证，真实两设备未测 | 规范集合逐字段 / ID 比对、来源隔离、缺原图占位；真机矩阵待补 |
| GPX / GeoJSON 开放导出、持久存储与备份提醒 | 自动化与桌面浏览器已验证，Android SAF 真机未测 | XML 独立解析、范围 / 日期精度、下载字节、时钟与提醒回归；外部工具截图见下 |
| 人生 / 年份时间轴双向联动，阶段 / 年份 / 旅程回放分享 | 待完成 | 领域、浏览器和真机用例 |
| 两类用户合计 5–10 位真实试用 | 未开始 | 匿名本地记录和用户自愿提供的汇总 |

## 真机测试矩阵

每台设备分别跑 1k 与 5k+ 真实相册，不能用生成图片或模拟端口代替。照片原图和精确位置留在用户设备，仓库仅保存脱敏的计数、版本、耗时、帧统计和失败摘要。

| 设备 / 档位 | Android / WebView | 相册数量 / 格式 | 首城 / 全量耗时 | 中位数 FPS / P95 ms / 样本数 | 后台 / 杀进程续扫 | 结果 |
|---|---|---|---|---|---|---|
| vivo（待提供） | 未测 | 1k，JPEG / HEIC | 未测 | 未测 | 未测 | 未测 |
| vivo（同机） | 未测 | 5k+，JPEG / HEIC | 未测 | 未测 | 未测 | 未测 |
| 中档 Android（待提供） | 未测 | 1k，JPEG / HEIC | 未测 | 未测 | 未测 | 未测 |
| 中档 Android（同机） | 未测 | 5k+，JPEG / HEIC | 未测 | 未测 | 未测 | 未测 |

另测拒绝相册权限、拒绝照片位置、Android 14+ 部分照片授权扩大 / 撤回、缺失 GPS、HEIC 解码、索引重建、覆盖安装、存储空间不足、设备 B 无原图的恢复。已有原生测试可用 `connectedDebugAndroidTest` 在测试设备运行；它会创建并清理自己的合成照片，但不能代替真实相册验收。

## 本轮验证记录

- I2-C/D/E：228 项 Life 领域测试、完整 `package.json` 测试链、3 项生产与 6 项发布测试通过；Editor / Viewer / Native 构建通过。Android Java 编译、11 项 JVM 测试与 Lint 通过。没有新增运行时依赖、权限或 Canonical schema 字段；机制见 [DATA_SOVEREIGNTY.md](DATA_SOVEREIGNTY.md)。
- I2-C/D/E 桌面 Chrome 156 / Playwright 1.55.0：320 / 375 / 390 / 430px 与桌面三入口、抽屉各分区、N / Esc、实际导出下载、备份时戳、提交后持久化一次、首次 / 30 天 / 稍后 7 天提醒、独立配置恢复及原图占位通过。模拟原生端口验证保存字节与取消备份不写成功时戳；并通过首次使用、四类卡片、12k 原生相册、地名单条同意、时间轴、故事与 OPFS / 回滚回归。
- I2-C/D/E RED/GREEN：旧共享端口第二消费者抢走待处理回复、恢复旧原生指针后与设备 B 同编号照片碰撞而丢观测，均先失败再修复。恢复来源隔离随日志提交 / 回滚 / 重启收敛。实际 IndexedDB 还发现内联主键写法及恢复提交后界面反馈错误，已在真实浏览器回归覆盖。保守来源校验仍不能跨安装按内容重绑原图，详见机制文档。
- 既有 `browser.mjs` 回放断言在旧实现复现 RED：自动打开卡片调用用户交互暂停，刚开始即停止。为程序回放选择显式传入 `interaction:false`，普通用户选择仍暂停；记录列表测试先通过真实“我的”入口打开列表，不点击隐藏控件。I4 会继续收敛播放器入口。
- 开放格式桌面核验（2026-10-28，**代理操作，非真人复核**）：应用导出的合成 GeoJSON 在 [geojson.io](https://geojson.io/) 编辑器载入后显示成都 / 台北，空几何旅程与阶段元数据保留，[截图](geojson-export-proof.jpg)；同一导出器的三城合成 GPX 在 [gpx.studio](https://gpx.studio/app) 通过文件打开显示三站及顺序路线，[截图](gpx-export-proof.jpg)。单站路线不能产生可见线段。未使用真实用户位置；真实人工桌面复核仍待补。
- 500 地点 / 5k 照片元数据的两种格式导出约 77 ms（本地领域测试，门槛 < 1 s）。Android 卸载 / 清数据 / 覆盖安装、SAF 真实文件提供方和真实两设备恢复均标为未测，步骤见 [ANDROID_PHOTO_IMPORT.md](ANDROID_PHOTO_IMPORT.md)。
- I2-C/D/E 帧率（相对 `a40e65c`）：关闭同时运行的外部地图后，全球 60 → 60 FPS、P95 17.3 → 17.2 ms；高山 119.8 → 120 FPS、P95 9.5 → 9.4 ms，差异在 5% 内，见 [原始记录](data-sovereignty-performance.json)。首轮并行外部 WebGL 地图时高山 77.5 → 60 FPS，未满足门槛，保留 [资源竞争记录](data-sovereignty-performance-contended.json)；不以该轮宣称通过。桌面软件渲染不能替代真机验收。

- I2-A/B（`beta/0.3-cn-naming`，基于主干 `e52d73b`）：211 项 Life 领域测试、完整 `package.json` 测试链、6 项发布协议、3 项生产构建测试通过；Editor / Viewer / Native 构建完成。新增纯函数口径模块与 316,619 字节离线行政区搜索索引，无新增运行时依赖，原始几何未改。
- RED/GREEN：旧实现上，台北旧名与归属错误、4 个旧国家名应计为 2、20 条默认搜索触发 20 次在线调用、离线来源误写 Nominatim 均先失败再通过；真实 Chrome 还复现在线 fetch 接收者错误（同意后未发请求），修复后同意恰好 1 次、取消 0 次。测试覆盖缓存同意、在线 ISO2、藏南覆盖幂等、全部 242 包出口、钓鱼岛无名称、重整后 ID 与人工名称保留。
- 桌面 Chrome 156 / Playwright 1.55.0：新增地名浏览器用例验证启动、20 条 CSV 导入、记录备份恢复、照片重新整理均不调用在线地名服务；明确同意后只发送九寨沟一个名称。既有工具栏（320–430px / 桌面）、127 张合成照片首次使用、四类卡片、12,000 行模拟 Android 相册回归通过。首次使用 / 卡片测试等待异步弹窗打开或启动遮罩移除，避免测试自身的时序竞态。
- I2-A/B 本地 Android：Java 编译、7 项 JVM 单测、Lint 通过；未本地构建 APK。CI 的 Node 20 / 24、Android APK 与 Release 逐字节比较以本任务 PR Checks 为准，合入前必须全绿。
- I2-A/B 分享回归：完整故事浏览器用例通过（故事编辑、重叠阶段与全量回放、隐私审查、457 文件静态 ZIP、独立 Viewer、移动布局、取消与关闭）。Viewer 在阻断外网时仍可观看，私有存储读取 0 次。新增静态 Life 模块依赖闭包测试先发现 ZIP 漏模块，再补齐精确白名单与清单后通过；不向 Viewer 打包私人媒体模块。
- I2-A/B 帧率：全球镜头中位数 60 → 60 FPS、P95 17.1 → 17.1 ms；高山镜头 115 → 120 FPS、P95 10.2 → 9.4 ms。固定全球 / 高山镜头的主干与当前版本对比写入 `cn-policy-performance.json`。桌面 Chrome 软件渲染与合成夹具不代表 Android 性能；真实设备、真实相册、真实用户、国内网络的境外服务连通性和争议映射法务复核均未测。机制说明见 [CN_REGION_POLICY.md](CN_REGION_POLICY.md)。

- 首次使用：197 项 Life 领域测试通过。127 张 JPEG / EXIF 合成夹具在 Chrome 中覆盖自动导入、最多三问、刷新续答、改判 / 跳过 / 撤销、阶段起名与重整保护，以及首次短回放与暂停恢复。Android 模拟端口 12,000 行回归通过（7,918 个有效照片观测）；高级逐条审核 / 备份恢复路径回归通过。均不是真机或真实相册证据，见 [FIRST_USE.md](FIRST_USE.md)。
- 统一卡片：184 项 Life 领域测试通过，新增四类卡片和城市 / 年份分享范围、隐藏删除等 11 项测试。Chrome 实际界面覆盖改名、改类型、合并 / 拆分、撤销 / 重做、删除、照片分页、回放返回、阶段 / 居住 / 城市分享及窄屏布局。原生缩略图端口为模拟，不是真机证据。
- I0：渲染与性能逻辑检查通过，145 个 Life 领域测试通过。I1 新增 16 个编辑命令测试和 1 个桥接测试，Life 用例合计 162 个。5k 合成照片改名与撤销验证 ID 和关系保留，不是真机或真实相册证据。
- `npm run test:publishing`：6 个发布协议测试通过。
- `npm run test:production`：3 个生产构建 / 边界 / Android 名称测试通过。名称回归先在旧实现失败，再在修改后通过。
- `npm run build`：Editor、Viewer、Android Web 资源均构建成功；生产测试验证两次构建清单与内容哈希一致。
- Android 云端验证：[主干运行记录](https://github.com/voyokee/ohmytrace/actions/runs/40508957619)。7 个 JVM 单测、Lint、Debug / 测试 / 未签名 Release APK 构建、Release 重跑逐字节一致性检查全部通过。`gradlew` 已设置 Unix 执行权限。
- Android CI 增加禁用构建缓存、重跑所有 Release 任务并逐字节比较 APK 的检查；当前结果以 [PR #3 的 Checks](https://github.com/voyokee/ohmytrace/pull/3/checks) 为准。
- Android SDK 安装显式指定 `platform-tools`，避免旧安装器默认请求已下线的 `tools` 包。
- `node tests/life/toolbar-browser.mjs`：Chrome 156 下 320–430px 与桌面布局、触控安全区、全部 / 年份 / 旅程 / 阶段 / 预览分享通过。
- `node tests/life/android-photo-browser.mjs`：模拟原生端口 12,000 行（7,918 个有效照片观测）、权限拒绝、重复导入、重新整理与照片 ID 保留通过。JS 流程 1,608 ms，明确不含真机 EXIF 时间。
- 真机性能、原生权限、两设备恢复、真实用户试用：未测。

## 可复验命令

```sh
npm test
npm run test:publishing
npm run test:production
npm run build
# JDK 17、Android SDK 35；配置 JAVA_HOME 与 ANDROID_HOME
npm run build:android -- lintDebug assembleDebugAndroidTest assembleRelease
```

Debug APK 用于试装，未签名 Release APK 供后续签名与发布验证。Debug 签名取决于本机密钥，不能用两台构建机的 Debug APK 哈希相等来宣称可复现。CI 从干净检出构建未签名 Release，并在同一锁定工具环境重跑全部任务、比较产物；跨操作系统、不同 JDK 补丁版本和正式签名流程仍需另验。

## Beta 试用记录

仅在用户同意时从本地导出匿名汇总，不自动上报。记录每个匿名试用者所属人群、导入开始 / 完成、轻确认展示 / 跳过 / 回答、修正次数、阶段起名和首次分享。完成率以导入开始人数为分母；跳过率以展示轻确认人数为分母；起名率以有阶段草稿人数为分母；首次分享率以导入完成人数为分母。尚未采集真实试用记录。
