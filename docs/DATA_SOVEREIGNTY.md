# 记录导出、备份与本机存储（I2-C/D/E）

## 入口（`index.html`、`src/ui/my-panel.js`、`styles.css`）

工具栏保留分享、添加照片、我的。回到地球移到浮动按钮，Esc 与 N 继续可用。
“我的”包含备份恢复、导出、人生阶段、显示、隐私说明、记录列表；高级默认折叠，
保留 CSV / JSON、模板、表格编辑和地点校正。原来的主要元素 ID 继续使用。
手机是可滚动的底部抽屉，桌面是右侧面板。照片管理中的原有备份入口也保留。

## 开放导出（`src/life/export-open.js`）

`exportGeoJSON(data, {scope, now})`、`exportGPX(data, {scope, now})` 返回字符串；
`exportFileName` 生成 OnceHere-足迹-范围-日期的文件名。范围为全部、年份、阶段。
函数不写数据或设置；隐藏地点、到访、旅程、阶段和照片不会作为对应实体导出。
年份按记录的时间相交选取，选中的旅程保留完整的已知地点顺序，不把日期精度补成日。

GeoJSON 依据 [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)，坐标为 WGS84 的
`[经度, 纬度]`。地点含名称、地区、到访类型、首末到访、照片数与来源状态；
阶段以空几何保存关联。旅程连接明确写为推测顺序，并注明“地点顺序已知，实际经过路径未知”。
**只有一个有效停靠点的旅程使用空几何**：合法 LineString 至少需要两个位置，
不能为满足类型而复制一个点、编造线段。它仍保留旅程 ID 与起止。
没有已知来源状态的地点按推断导出，并另带 `sourceUncertain: true`，不冒充照片观测。

GPX 使用 [Topografix GPX 1.1](https://www.topografix.com/GPX/1/1/) 的命名空间、
版本与 creator；地点是 wpt，旅程是 rte / rtept，**不用实测轨迹 trk**。
元数据有 OnceHere 与导出时间；原始年 / 月 / 日精度留在扩展字段中。
XML 文本与属性转义；经度 180 在 GPX 中写为同一条经线的 -180。
导出前说明文件含地点坐标，用户可以取消。

## 共用保存通道（`src/platform/document-save.js`、`android-bridge.js`、`MainActivity.java`、`DocumentWriteSession.java`）

代码审查确认旧 WebView 没有 DownloadListener 或保存桥，blob 链接不能作为 Android
可用的保存方案。备份、开放导出、CSV / 记录文件与分享文件现在共用保存通道。
Web 发起本机下载；Android 通过原有仅本地主页面可访问的 WebMessageListener
调用 `saveDocument`，由系统 ACTION_CREATE_DOCUMENT 让用户选择位置。

选好后每块最多 192 KiB，原生验证偏移、总量和 256 KiB 单块上限；
`finishDocument` 只在字节数完整且流成功关闭时返回成功。取消或失败关闭文件并尽力
删除未完成文档。完整备份不会一次跨桥发送几十 MB 的 base64。
文件名清理路径字符，保存不需要全盘存储权限。契约见 `contracts.d.ts`。
共享端口按 request ID 路由，第二个消费者不会接管第一个消费者尚未完成的回复。

Web 能确认下载已发起，无法确认用户随后是否在浏览器下载界面保留文件；
Android 以写入完成为准，取消不会记录成成功备份。
SAF 真机文件选择器、真实提供方、磁盘满和生命周期行为仍未测。

## 设置、保护与提醒（`src/life/local-settings.js`、`backup-guide.js`、`app.js`）

设置独立于 Canonical schema v1，读写及 localStorage getter 都有异常兜底。
成功导入提交之后请求一次 navigator.storage.persist，结果和 estimate 显示在“我的”。
未保护不影响导入；缺少存储 API 时仍可导出和备份。

首次有记录后提示一次“建议现在备份一次”并显示提示点；距上次备份超过 30 天且有修改，
再次提示一次。稍后静默 7 天。成功备份记录数据 ID / revision、时间和大小；
只有时间变旧而记录未改，不提醒。状态不进入备份的 Canonical 数据。

## 跨设备原图（`library-backup.js`、`thumbnail-store.js`、`android-auto-import.js`、`MediaLibrary.java`）

完整备份仍包含规范记录、媒体索引与已保留缩略图，不含原图。
恢复到空配置时，实体与 ID 不改；本机提交 revision 按已有仓库事务规则处理。

MediaStore 的数字编号不是跨设备照片身份。新原生指针带应用安装的本地随机标识，
原生缩略图读取在访问相册前校验来源；它不是硬件标识。
恢复来的无来源旧指针记入缩略图库的独立元数据，默认不读取本机相同编号。
此元数据随恢复日志提交、回滚和重启收敛，不改规范记录或 ID。
本机旧扫描检查点证明归属时保留原有旧指针，避免升级复制已有照片。
新安装的同编号照片用新来源指针，不会被旧记录当作重复而丢弃。

卡片读取不到原图时显示“原图不在本机，或尚未授权读取”，不创建破图。
跨安装按内容重新关联原图尚未实现；清数据 / 重装后，即使相册仍在，旧来源也不能
直接证明归属。再次扫描按新来源识别照片，可能保留两份观测；不能用时间地点相同
自动冒充内容相同。真机检查步骤见 `ANDROID_PHOTO_IMPORT.md`。

## 验证（`tests/life/*`、`docs/BETA_0_3.md`）

领域覆盖范围、隐藏过滤、日期精度、XML 独立解析、转义、500 地点 / 5k 照片规模；
备份提醒覆盖伪造时钟、30 天、有无修改、7 天静默、存储拒绝。
跨层回归先复现旧原生端口丢回复、跨设备同编号丢照片与无归属标记，再修复。
真实 IndexedDB 用例覆盖内联键、恢复反馈、跨配置实体 / ID 一致和缺原图占位。
原生写入状态机有 JVM 单测；桌面浏览器模拟端口不是真机证据。
实际运行结果、截图与帧率记录以验收台账为准。
