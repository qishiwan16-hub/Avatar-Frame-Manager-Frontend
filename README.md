# 头像框管理器

这是一个标准酒馆扩展目录，可通过 GitHub 安装。

仓库地址：<https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend>

在酒馆扩展管理中选择从 GitHub 安装，填入：

`https://github.com/qishiwan16-hub/Avatar-Frame-Manager-Frontend`

扩展入口由 `manifest.json` 指向 `index.js`。原始酒馆助手脚本 JSON 文件保留在仓库中作为备份。

## 美化绑定

在头像框管理器中打开“绑定”页，可为酒馆“UI Theme”里的 CSS 美化主题保存 User、Char 任一侧或两侧头像框，并分别保存定位数值。切换 `#themes` 中的 CSS 美化时会自动应用对应绑定；绑定中未选择的一侧以及没有绑定的美化会自动清除头像框选择。

## 后端存储

本扩展支持酒馆服务器插件 `Avatar-Frame-Manager-Backend`。安装后端并开启 `enableServerPlugins` 后，扩展会自动检测 `/api/plugins/avatar-frame-manager`：头像框配置和绑定保存在服务器，图片按内容哈希去重；后端不可用时自动回退到浏览器 IndexedDB。首次检测到空后端时，会自动迁移现有本地数据。
