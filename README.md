# 头像框管理器

本插件为二次修改版本，原版作者：毛毛雨。

这是一个标准酒馆扩展目录，可通过 GitHub 安装。

仓库地址：<https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend>

在酒馆扩展管理中选择从 GitHub 安装，填入：

`https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend`

扩展入口由 `manifest.json` 指向 `index.js`。原始酒馆助手脚本 JSON 文件保留在仓库中作为备份。

## 头像框预设

“预设”页可将当前 User、Char 头像框、两侧位置参数和伪元素设置保存为一套完整预设。预设列表提供切换、修改名称和删除操作；当前使用的预设会显示绿色指示灯。手动更换头像框或调整参数后，如果当前配置已不再匹配该预设，指示灯会自动取消。

## 美化绑定

在头像框管理器中打开“绑定”页，可为酒馆“UI Theme”里的 CSS 美化主题保存 User、Char 任一侧或两侧头像框，并分别保存定位数值。切换 `#themes` 中的 CSS 美化时会自动应用对应绑定；绑定中未选择的一侧以及没有绑定的美化会自动清除头像框选择。

## 后端存储

本扩展支持酒馆服务器插件 [`Avatar-Frame-Manager-Backend`](https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Backend)。安装后端并开启 `enableServerPlugins` 后，扩展会自动检测 `/api/plugins/avatar-frame-manager`：头像框配置和绑定保存在服务器，图片按内容哈希去重；后端不可用时自动回退到浏览器 IndexedDB。首次检测到空后端时，会自动迁移现有本地数据。

美化绑定使用当前账户 `data/<账户>/themes/*.json` 的文件名作为主题 ID，并与酒馆顶部 `#themes` 选择器保持一致。

## GIF ZIP 批量导入

列表页的“从相册/文件导入”支持直接选择普通 ZIP。扩展会递归读取压缩包中扩展名为 GIF（大小写均可）的文件，以文件名作为头像框名称，然后统一选择导入到 User、Char 或两边。部分素材虽然使用 `.gif` 文件名，实际内容是 PNG/APNG；扩展会按真实文件头识别并正常导入。设置页的插件备份 ZIP 导入逻辑保持不变。后端可用时，导入图片会先由后端按内容哈希落盘，前端只保存图片 URL。
