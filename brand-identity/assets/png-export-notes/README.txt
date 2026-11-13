独一 ONE 品牌资产导出说明

- 矢量源文件：../svg/*.svg（可在 Figma / Illustrator / Inkscape / Affinity 中编辑）
- PNG 透明背景导出建议尺寸：1024, 512, 256, 128, 64, 32, 16
- macOS 可用命令示例（如安装 librsvg）：
  rsvg-convert -w 1024 -h 1024 ../svg/final-origin-app-icon.svg -o final-origin-app-icon-1024.png
- macOS QuickLook 预览导出示例：
  qlmanage -t -s 1024 -o . ../svg/final-origin-app-icon.svg
- 交付建议：提供 symbol-only、lockup（横/竖）、深/浅/单色/反白 全套 PNG。

说明：本环境如无位图转换工具，SVG 为正式可编辑母版。
