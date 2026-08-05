# 头像框管理器

本插件为二次修改版本，原版作者：毛毛雨。

这是一个标准酒馆扩展目录，可通过 GitHub 安装。

仓库地址：<https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend>

在酒馆扩展管理中选择从 GitHub 安装，填入：

`https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend`

扩展入口由 `manifest.json` 指向 `index.js`。原始酒馆助手脚本 JSON 文件保留在仓库中作为备份。

## 头像框预设

“预设”页只保存当前 User、Char 头像框和伪元素选择。预设列表提供切换、保存覆盖、修改名称和删除操作；当前使用的预设会显示绿色指示灯。设置页的 User、Char 位置数值为全局固定值，不会被预设切换或覆盖保存修改；旧版本预设中的专用数值会在首次读取时自动清除。

## 美化绑定

在头像框管理器中打开“绑定”页，可为酒馆“UI Theme”里的 CSS 美化主题保存 User、Char 任一侧或两侧头像框。扩展使用与主题一键换图一致的当前主题识别逻辑，同时监听 `#themes`、`#theme`、主题链接和 `settings.visual_theme`。切换到没有绑定的美化时会自动清空 User、Char 选择，切回已绑定美化时恢复对应头像框；设置页的 User、Char 位置数值始终使用同一套全局值，不跟随主题变化。预设当前项再次点击“默认”会清除头像框选择；管理器标题下方会实时显示当前主题。

## 后端存储

本扩展支持酒馆服务器插件 [`Avatar-Frame-Manager-Backend`](https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Backend)。安装后端并开启 `enableServerPlugins` 后，扩展会自动检测 `/api/plugins/avatar-frame-manager`：头像框配置和绑定保存在服务器，图片按内容哈希去重；后端不可用时自动回退到浏览器 IndexedDB。首次检测到空后端时，会自动迁移现有本地数据。

美化绑定使用当前账户 `data/<账户>/themes/*.json` 的文件名作为主题 ID，并与酒馆顶部 `#themes` 选择器保持一致。

## GIF ZIP 批量导入

列表页的“从相册/文件导入”支持直接选择普通 ZIP。扩展会递归读取压缩包中扩展名为 GIF（大小写均可）的文件，以文件名作为头像框名称，然后统一选择导入到 User、Char 或两边。部分素材虽然使用 `.gif` 文件名，实际内容是 PNG/APNG；扩展会按真实文件头识别并正常导入。设置页的插件备份 ZIP 导入逻辑保持不变。后端可用时，导入图片会先由后端按内容哈希落盘，前端只保存图片 URL。
