# Phase 3 — Photo History Reconstruction

Development stays on `feat/life-atlas-mvp`, starting at `480ea69`.

## Boundaries and data flow

Selected File objects → bounded worker EXIF extraction + content hash → separate
versioned media manifest → explainable visit/trip candidates → saved human review
→ dry run → one verified Life Repository update → existing Renderer Adapter.

Original files are never uploaded or persisted. No thumbnail Blob store is used
in this MVP. File objects and object URLs last only for the current page session;
metadata and review drafts survive reload, and files must be reselected to preview.

Canonical schema v1 remains unchanged: photo metadata is held in Evidence.source,
Memory.kind is `photo`, and Memory.uri is `media:<assetId>`. Manifest schema version
is independent of Canonical and IndexedDB database versions. Existing canonical
JSON remains valid and does not include the separate media manifest or originals.
The UI must explicitly label backup coverage and provide media-index JSON export.

## Implemented modules

- `src/life/media/exif.js`: bounded JPEG/TIFF EXIF reading and explicit time semantics.
- `manifest.js`: incremental, transactional metadata/batch/review persistence.
- `scanner.js`, `scan-worker.js`: cancelable bounded local File processing.
- `reconstruction.js`, `config.js`: pure spatial/temporal heuristics and thresholds.
- `integration.js`: dry-run, canonical commit and recoverable manifest acknowledgement.
- `photo-ui.js`: selection, progress, diagnosis, edit/delete/merge/split and confirmation.

## Evidence and temporal semantics

DateTimeOriginal without OffsetTimeOriginal is not an instant. Preserve the raw
EXIF string, local date/time, optional offset and optional derived UTC instant.
GPS time, when present, is separate evidence and never silently supplies a timezone.
File modification time is file metadata, never an invented capture time.

Photo GPS means the photo location; candidate visit spans are observed photo
coverage. Trip arrival/departure and transport remain unknown until reviewed.
Renderer connections between photo stops must be labeled as inferred connections.
No ResidencePeriod or Chapter is synthesized from photo data.

## Standards checked

Tag meanings were checked against the [CIPA EXIF/XMP mapping](https://www.cipa.jp/std/documents/e/DC-X010-2017.pdf)
and the author-maintained [ExifTool GPS tag reference](https://exiftool.org/TagNames/GPS.html).

## 使用流程

工具栏 **照** → 选择照片 → 查看诊断及候选 → 修改标题/地点名称、关联已有 Trip
或选择只保存记忆 → 按地点/照片拆分，或选中多个候选合并 → 选择已有 Chapter →
**预览变更 / Dry Run** → **确认写入人生数据**。排除候选可以恢复。

照片只提供拍摄时刻和位置的证据。城市名称只复用空间匹配到的已有 Place；新位置
显示“城市未知 + 经纬度”，可以人工命名，不调用在线逆地理编码或 LLM 猜城市。
实际旅行开始、结束可以按年/月/日手动填写，默认 unknown；交通方式保持 unknown。

没有 GPS 的有效 JPEG 可由用户确认保存为未定位 Memory，不创建地图地点或 Trip。
不支持格式、超限文件、损坏元数据仅保留索引诊断，不生成虚假地点、日期或行程。

## 数据与迁移

Canonical schema 仍为 **v1**，没有增加或重定义持久化实体字段：

- `Memory.kind='photo'`，`Memory.uri='media:<SHA-256 assetId>'`；稳定 Memory ID 由内容标识生成。
- `Evidence.source.kind='photo-exif'` 保存原始标签、文件元信息、时区语义、GPS、海拔和方向；
  能解析的原始元数据为 observed，缺失信息保持 unknown。
- `photo-reconstruction` / `photo-visit` Evidence 为 inferred，记录规则、照片覆盖时段、
  前后相片约束形成的到达/离开窗口和推测连接；不把窗口边界当作实际到达/离开时刻。
- `photo-review` 为 manual，保留确认操作以及修改、合并、拆分前后内容。修改候选不修改原始 EXIF。
- 新 Trip 的实际起止默认 unknown。Adapter 从 Visit 的照片观测日期生成仅供显示的日期，
  标为“照片观测，旅行起止未完全确认”，不累计为“在路上天数”，也不据此制造出发住所。
- 原有 CSV Trip 的标题、起止、类型、备注和用户校正的 Place 坐标保留。照片优先关联已有 Trip，
  只追加 Memory、证据及确有需要的新 Visit。同日 A→B→A 保留三条 Visit、两个 Place；地图按 Trip ID 计数。
- 关联多个已有 Chapter 时，写入 `relatedTripIds/memoryIds`。不创建 ResidencePeriod 或 Chapter。

独立数据库 `ohmytrace.media` 的 IndexedDB 版本为 1，Manifest 格式版本为 1。
`assets` 以 assetId 为主键，保存原始文件元信息、提取时间、坐标、海拔、方向、诊断、
metadataEvidence、deduplicationKey、processingStatus、批次引用、linkedMemoryId 和
空 thumbnailReference。`batches` 保存选择清单、进度游标、去重/失败数、审核草稿、指标和提交状态。
不保存 File、ArrayBuffer、原图、缩略图或 base64 图片。

旧 Canonical JSON 可继续导入导出，原有 `footprints.v1` 迁移流程不变。照片模块首次打开时
独立创建媒体数据库，不借机写 Canonical。新的媒体备份有显式 kind/version 校验；未知版本、
伪造的无时区 UTC 值、损坏批次或审核关系在替换存储前被拒绝。

## 规则与边界

所有阈值集中在 `config.js`，距离采用 haversine 和最短经差，正确跨越 ±180°。

| 规则 | 默认值 | 语义 |
| --- | --- | --- |
| 同地点半径 | 1 km | 连续照片相对本 Visit 第一张位置的距离，不按名称合并 |
| 同 Visit 时间间隔 | ≤18 h | 超出则生成新的到访候选 |
| 相邻 Trip 间隔 | ≤96 h | 超出则分开候选；返回已知居住地也切断离家候选 |
| 住所附近半径 | ≤15 km | 仅在照片日期落入明确 ResidencePeriod 时提示日常照片 |
| 已有 Place 匹配 | ≤1 km | 复用现有地点，不覆盖坐标 |
| 已有 Trip 日期宽容 | 1 day | 日期覆盖重叠且至少一个地点匹配时优先提出关联 |

已知偏移的照片按 UTC instant 排序。只要存在无偏移拍摄时间，就用明确标注不确定的
相机本地日历顺序提案；不会把无时区 DateTimeOriginal 填上 Z。跨时区、跨年时保留
各照片本地日期和原始偏移；GPS 的 UTC 日期/时间单独保留，不反推相机时区。

到访只合并连续的邻近照片，因此 A→B→A、跨日重访、一天多个地点可以区分。
单张照片也可形成待确认候选，但不会声称掌握完整旅程。无拍摄时间的 GPS 观测单独提案，
日期未知；无 GPS 的照片不参与空间聚合。相邻照片形成的边界窗口只表达可能区间，
不能证明两次拍照间一直停留或走过直线路线。

用户可以调整候选分组，关联任意已有 Trip 或选择仅存 Memory；自动匹配只是建议。
推测路线使用虚线，并在 Trip 卡片和审核界面标明“推测连接、交通方式未知”。

## 崩溃恢复、取消及原子性

每 20 张保存一批 assets 和同事务的批次游标。持久化失败不会把游标推进到未保存文件。
取消终止当前 Worker，只保留已完成的媒体诊断/观测，不提交 Canonical。
刷新或意外关闭后，未完成批次标为 interrupted；从历史批次重新选择原文件可续扫。
名称、大小、修改时间和顺序须匹配，并重新校验已处理文件的内容哈希，恢复本次页面预览。

两套 IndexedDB 无法共享事务，因此确认使用可恢复意图：

1. Dry Run 在 clone 上校验整份图谱，返回明确的新增/关联摘要；Canonical 不变。
2. 保存 prepared 批次与审核签名，检查当前 Canonical revision。
3. 通过现有 Life Repository 一次写入并回读验证整份 Canonical。
4. 最后确认媒体关联。若步骤 4 失败，明确提示“人生数据已保存，媒体索引待修复”。
5. 重开照片入口时，用 Canonical 中的 Memory URI 与 photo-review Evidence 补齐确认。
   去重依赖当前 Canonical，而不盲信可能过期的 linkedMemoryId。

确认前任一步失败不改人生数据；数据或审核内容变化后必须重新预览。Canonical 回读失败
沿用已有 Repository 的“刷新确认后再继续写”策略。重复导入相同内容、改名的相同文件和
已提交批次均不重复建 Memory/Trip；无变更时不重写 Canonical。新用户首次保存前的临时
Dataset ID 可以安全重定位审核草稿，真实数据被另一份备份替换时则要求重新审核。

## 备份范围

**人生数据 JSON**：完整 Canonical、照片 Memory、原始/推断/人工 Evidence、关系；
不含独立媒体索引或原始照片。原有格式和恢复入口继续有效。

**媒体索引 JSON**：assets、batches、进度、诊断和审核草稿；不含原图或缩略图。
此备份恢复仅替换媒体索引，不替换人生数据。界面两处明确标注范围；迁移到其他浏览器时
应同时保留人生 JSON、媒体索引 JSON 和原始照片。恢复索引不意味着网页获得文件访问权。

## 性能与内存预算

- 单 Worker、单活动文件；每文件最大 64 MiB、最多检查 4 MiB JPEG 头部；TIFF entry/value 数量有界。
- 每批最多 10,000 个文件，20 个一批写 Manifest，不逐照片校验/重写完整 Canonical。
- 原图仅通过当前 File 读取，哈希与解析在 Worker；Worker 不可用时逐文件让出主线程后分析，记录 fallback 模式。
- 同时最多 2 张预览，每张最多 16 MP，关闭/重绘释放 object URL。更大或未知尺寸只显示元数据。
- 活动文件缓冲估计上界按 `2×有界文件大小 + 64 KiB` 报告；预览解码预算约 `2×16MP×4` 字节。
  这不是浏览器进程总内存保证，File/Blob、GPU、浏览器及原生解码器仍有额外开销。
- 原图、缩略图持久化字节数为 0。超限/读取失败文件没有可靠内容哈希，重复尝试可产生独立诊断，
  但不会变成重复人生记录。

### 实测：2026-10-26，Windows Chrome，真实 Worker + IndexedDB

生成的可解码 64×48 JPEG，含合法 EXIF，补齐至每张 64 KiB；**不是用户真实照片库 benchmark**。
原始 fixture 的 JPEG、方向、日期和 GPS 也由 Pillow 独立读取检查。页面仍运行现有 3D 应用。
原始实测输出保存于 `PHOTO_HISTORY_PERFORMANCE.json`。

| 张数 | 扫描 | 首结果 | 首批 20 张持久化 | 审核草稿 | Dry Run | 确认写入 | Canonical 写次数 | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 84.8 ms | 18.3 ms | 51.8 ms | 4.9 ms | 5.9 ms | 27.6 ms | 1 | 0 |
| 1,000 | 846.5 ms | 29.8 ms | 217.7 ms | 27.3 ms | 56.4 ms | 273.6 ms | 1 | 0 |

两组分别确认了 100、1,000 条 Memory。活动文件缓冲估计均为 192 KiB；主线程 JS heap
采样高水位约 100.7 / 106.4 MiB，含既有页面且不含 Worker/原生/GPU 总开销；不能把 192 KiB
说成导入的总内存。扫描期间分别观察到 8 / 105 个 RAF，最大帧间隔 24.7 / 166.7 ms。
仍有短时抖动；真实高像素、大文件、上万资产、移动端硬件需要另行实测。

## 自动化与浏览器验证

`npm test` 的完整 test 脚本包含原有 18 组与所有 `tests/life/*.test.mjs`。
本机运行环境提供 pnpm；以 `pnpm run test` 执行同一脚本，原有 18 组和 48 项 Life 测试全部通过。可单独运行
`node --test tests/life/photo-*.test.mjs`。

`tests/life/photo-browser.mjs` 使用真实 Chrome、生成的有效 EXIF JPEG、独立临时 profile，
自行启动/关闭静态服务器，验证：

- Worker 解析、方向预览、诊断、删除/恢复候选、拆分/合并/改名、Dry Run 与确认。
- 新 Trip 自动进入既有地球、列表、年份和 Chapter；刷新后关系保留。
- CSV 内容和手动校正不被覆盖；无 GPS 不上地图；重复/改名文件不产生新人生记录。
- 真 IndexedDB 事务中止、确认后媒体确认失败与刷新补齐、媒体索引备份恢复。
- 扫描取消；在 20 张持久化后中途刷新，再次选择磁盘原文件续扫到 30 张。
- 新用户纯 demo 状态扫描后刷新、恢复审核、首次确认，以及既有 Canonical JSON 的照片关系恢复。
- 手机窗口对话框边界；100/1,000 张扫描、重建、预览及一次性 Canonical 提交的真实指标。

`tests/life/browser.mjs` 另行回归旧 CSV、重叠 Chapter、年份、坐标校正、昼夜、飞入、Replay、
JSON 备份恢复及迁移中止恢复。Node 测试覆盖时区、日界线、阈值边界、A-B-A、重复导入、
元数据损坏和未知日期；正确性修复使用 RED/GREEN 或隔离副本中的受控旧策略负验证。

浏览器测试运行方式与旧测试一致：设置 `PLAYWRIGHT_MODULE`（若无法按包名解析）、
可选 `LIFE_BROWSER_EXECUTABLE` 和 `LIFE_BROWSER_OUTPUT`，然后运行上述 `.mjs` 文件。

## 已知限制与后续 Native Bridge

- 最低支持 JPEG 的常用 EXIF IFD/GPS 标签；PNG/WebP/HEIC/HEIF/RAW 不解析元数据。
  不读取 MakerNotes；非常规或厂商私有 EXIF 需后续增加独立 fixture，GPS 高度不认识的参考值保持未知。
- 无偏移的拍摄先后与跨时区分组不能完全确定，算法不会补时区；相机本身时间/GPS 错误也需人工校正。
- 没有离线城市词典，不保证自动城市名。不会把 GPS 相近当成已确认的交通轨迹。
- 单标签页扫描是推荐路径；不提供跨标签页扫描租约或后台相册监控，Canonical 仍用 revision 防覆盖。
- 两个数据库是可恢复协议而非跨库原子事务；必须保留两个索引备份及原图。关闭前未落盘的最后一小批可能重扫。
- 旧 CSV 是足迹交换格式，不能替代包含照片 Evidence/未知起止语义的完整 JSON 备份。
- 原有近景植被未就绪现象仍可在基线复现，本阶段没有改动受保护的渲染、植被、性能目录。

未来 Android/iOS Native Bridge 才适合在系统授权范围内提供持久相册资产引用、增量变更通知、
后台扫描、原生 HEIC 解码与系统缩略图、低内存内容哈希。Web 不宣称拥有整个相册的持续访问权。
