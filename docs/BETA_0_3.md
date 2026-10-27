# OnceHere Beta 0.3 验收台账

2026-10-27。用户体验以 [PRODUCT.md](PRODUCT.md) 为准，迭代范围见 [ROADMAP.md](ROADMAP.md)。本台账区分自动化验证、桌面浏览器验证、真实 Android 和真实用户验证；后一类不能由前一类替代。

## 代码基线与交付

- 已获取远端：`origin/main` 为 `f7f1330`，已通过 PR #2 合入 Life Atlas 基线。
- 最新照片导入分支：`feat/photo-first-onboarding` 为 `cac3e97`，比主干多 18 个提交。
- 新开发分支：`beta/0.3-foundation`，从 `cac3e97` 创建。
- 本轮准备：Web / Android / 分享入口统一为 OnceHere；保留 Android applicationId、IndexedDB 库名、原有备份与分享格式标识，以兼容既有数据。
- Web CI 覆盖 Node 20 / 24；Android CI 使用 JDK 17、SDK 35、锁定且校验 SHA-256 的 Gradle 8.11.1，运行 JVM 单测、Lint，构建 Debug、测试 APK 和未签名 Release APK。
- 基线 PR：[PR #3](https://github.com/voyokee/ohmytrace/pull/3)。主干 CI、基线标签与最终 `v0.3.0` 仍需分别验收；未达到退出标准前不打最终发布标签。

## 退出标准追踪

| 标准 | 当前状态 | 所需证据 |
|---|---|---|
| PR 合入 main、CI 全绿、可复现 Web / APK、v0.3.0 | 进行中 | PR、主干运行链接、构建清单与校验和、标签 |
| 至少两台 Android，包含 vivo 和中档机 | 未测，目前无可用设备 | 下表的真机记录、系统版本和 WebView 版本 |
| 1k / 5k+ 真实相册，首城 ≤ 60 s，无崩溃 | 未测 | 原始计时、导入计数、异常日志 |
| 中档机全球中位数 ≥ 30 FPS、P95 帧间隔 | 未测 | 测量场景、样本数量、原始帧间隔与汇总 |
| 切后台 / 恢复、杀进程后续扫 | 未测 | 中断前后计数与稳定 ID、检查点和权限状态 |
| 用户可见名称统一，无系统词进入主流程 | 进行中 | 已有入口名称检查；后续统一卡片与首次使用验收 |
| 最多三问、生成阶段草稿、无需输入日期格式 | 待实现 | 领域与浏览器用例，首次使用计时 |
| 城市 / 常驻 / 旅程来源、统一卡片纠错、撤销与重新整理保留修改 | 待完成 | 各实体编辑命令、撤销、重新整理回归 |
| 完整备份跨设备恢复实体和 ID 零差异 | 未测 | 两台设备恢复前后的规范数据与 ID 对比 |
| GPX / GeoJSON 开放导出、持久存储与备份提醒 | 待实现 | 标准解析验证与浏览器用例 |
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

- `npm test`：渲染与性能逻辑检查通过，145 个 Life 领域测试通过。
- `npm run test:publishing`：6 个发布协议测试通过。
- `npm run test:production`：3 个生产构建 / 边界 / Android 名称测试通过。名称回归先在旧实现失败，再在修改后通过。
- `npm run build`：Editor、Viewer、Android Web 资源均构建成功；生产测试验证两次构建清单与内容哈希一致。
- Android 云端验证：[运行记录](https://github.com/voyokee/ohmytrace/actions/runs/40507798375)。7 个 JVM 单测、Lint、Debug / 测试 / 未签名 Release APK 构建通过；随后重复构建步骤暴露了仓库中 `gradlew` 缺少 Unix 执行权限，本轮已修正为可执行，完整 CI 重新验证。
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
