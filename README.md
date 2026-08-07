# 头像框管理器

本插件为二次修改版本，原版作者：毛毛雨。

这是一个标准酒馆扩展目录，可通过 GitHub 安装。

仓库地址：<https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend>

在酒馆扩展管理中选择从 GitHub 安装，填入：

`https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend`

扩展入口由 `manifest.json` 指向 `index.js`。原始酒馆助手脚本 JSON 文件保留在仓库中作为备份。

## 头像框预设

“预设”页按当前 CSS 美化分别保存 User、Char 头像框和伪元素选择，逻辑与主题一键换图一致。保存新预设或覆盖保存后，该预设会成为当前美化的启用预设；切换美化时自动加载对应的启用预设，没有启用预设时自动清空 User、Char 选择。预设列表提供切换、保存覆盖、修改名称和删除操作，当前使用的预设显示绿色指示灯，再次点击“默认”会恢复未选择状态。

设置页的 User、Char 位置数值为全局固定值，不会写入预设。旧版本的美化绑定会在首次读取时自动合并到对应美化的预设中；已有相同头像框组合的预设会直接复用，不重复保存。

设置页最上方显示扩展更新状态和检查按钮。关闭插件面板会取消仍在进行的更新检查，避免检测请求卡住；已经开始执行的扩展更新不会被中断。

## 后端存储

本扩展支持酒馆服务器插件 [`Avatar-Frame-Manager-Backend`](https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Backend)。安装后端并开启 `enableServerPlugins` 后，扩展会自动检测 `/api/plugins/avatar-frame-manager`：头像框配置和按美化保存的预设保存在服务器，图片按内容哈希去重；后端不可用时自动回退到浏览器 IndexedDB。首次检测到空后端时，会自动迁移现有本地数据。

## GIF ZIP 批量导入

列表页的“从相册/文件导入”支持直接选择普通 ZIP。扩展会递归读取压缩包中扩展名为 GIF（大小写均可）的文件，以文件名作为头像框名称，然后统一选择导入到 User、Char 或两边。部分素材虽然使用 `.gif` 文件名，实际内容是 PNG/APNG；扩展会按真实文件头识别并正常导入。设置页的插件备份 ZIP 导入逻辑保持不变。后端可用时，导入图片会先由后端按内容哈希落盘，前端只保存图片 URL。
