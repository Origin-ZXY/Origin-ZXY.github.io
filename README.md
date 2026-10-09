# 张逍煜的个人主页

原生 HTML、CSS 和 JavaScript 静态主页，适配现有的 GitHub Pages 仓库。

## 预览

在此目录运行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4173/`。

## 星尘 Hero

- 姓名由 Canvas 粒子实时绘制。移动指针时散开，离开后通过弹簧阻尼缓慢归位。
- 首屏参考用户提供的 Yuri.WG 主页：横向大标题、淡网格、角落定位线和缓慢漂浮的几何花朵。
- 颗粒具有不同的大小、位置与明暗，混合少量蓝色颗粒。移动指针时会出现短暂绽放的几何花朵。
- 角落标签反映真实状态：静止、散开、聚拢，以及声音开关。
- 点击「开启声音」后，在标题上移动指针可触发原创的三音短句。声音由 Web Audio 合成，使用柔和的钟声音色、低音量背景音与混响。
- 旋律触发有间隔限制，声音不会随每一次鼠标事件重复播放；离开 Hero 或切换标签页后，音频会淡出并暂停。
- 标题支持触屏与键盘。聚焦标题后，方向键拨动粒子，Escape 归位。
- 系统启用「减少动态效果」时，文字粒子与背景保持静止。Canvas 不可用时保留可读标题。
- 默认黑色主题，支持切换浅色模式并记住选择；主题同步影响整个页面。

## 修改

- `index.html`：姓名、简介、研究方向、项目经历与联系方式。
- `hero.css`：空间配色、首屏排版、角落标签。
- `hero.js`：粒子形状、散开与归位参数、音色和旋律。
- `styles.css`、`site.js`：其他栏目、导航、主题与邮箱复制。
- `assets/`：本地字体、图标、头像、项目截图和分享图。

项目经历按要求留空，后续补充真实经历。研究方向仍标记为「待补充」，需要根据真实求职资料填写。

## GitHub Pages

将本目录内容上传到 `Origin-ZXY/Origin-ZXY.github.io` 的发布分支根目录，保留 `assets/` 目录结构。若从分支发布，设置为 `Settings → Pages → Deploy from a branch → main → / (root)`。

参考：[GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

字体为 Plus Jakarta Sans，OFL 许可证在 `assets/fonts/OFL.txt`；图标为 Tabler Icons，MIT 许可证在 `assets/icons/LICENSE.txt`。项目预览与分享图来自实际页面截图。
