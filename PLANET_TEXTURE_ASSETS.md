# EARTH ONE — 行星纹理资产与程序化合成架构标准
## (PLANET TEXTURE ASSETS & PROCEDURAL SYNTHESIS SPECIFICATION)

---

## 1. 核心设计原则 (Core Principles)

1. **绝对零 404 外部依赖 (Zero 404 Guarantee)**:
   - 生产环境中严禁引用未托管或外部未知的第三方 CDN 图片链接（如维基媒体原始大图、未打包的 GitHub raw 链接）。
   - 全部行星、光环、云层、星空背景均通过 `HTML5 Canvas` 在内存中实时程序化生成（Procedural Texture Synthesis），转化为 Three.js `CanvasTexture`。
2. **天体物理真实感 (Astrophysical Fidelity)**:
   - 基于 NASA Visible Earth / Blue Marble、Black Marble、Cassini-Huygens（卡西尼-惠更斯号）、Juno（朱诺号）与 Perseverance（毅力号）的科学测绘光谱特征与反照率数据。
3. **内存与显存复用 (Texture Cache)**:
   - 全局内存单例字典缓存，确保每个天体在整个会话生命周期内仅合成一次，无额外 GC 抖动。

---

## 2. 土星光环高精度合成架构 (Saturn Rings Synthesis)
*参考资料：卡西尼-惠更斯探测器成像 `/public/assets/aistudio/image_4845819a.png`*

### 2.1 环系剖面与径向反照率模型 (Radial Albedo & Opacity Model)

| 环系区域 (Ring Zone) | 相对径向区间 $[r_{inner}, r_{outer}]$ | 物理宽度 (km) | 光学透明度与色调特征 |
| :--- | :--- | :--- | :--- |
| **C 环 (Crepe Ring)** | 0.00 – 0.20 | ~17,500 km | 半透灰褐色尘埃带，微弱反照率 (Albedo ~0.08) |
| **B 环 (Main Dense B Ring)**| 0.21 – 0.56 | ~25,500 km | 极高反射率高密冰晶层，金色微光，微结构条纹密集 (Albedo ~0.85–0.98) |
| **卡西尼环缝 (Cassini Division)**| **0.57 – 0.65** | **~4,800 km** | **由于土卫一(Mimas)引力共振形成的暗空隙，接近绝对透明/近黑 (Opacity < 0.02)** |
| **A 环 (Outer A Ring)** | 0.66 – 0.94 | ~14,600 km | 中等反射率淡黄褐色层，内部含恩克环缝(Encke Gap)痕迹 |
| **F 环边界 (F Ring Boundary)**| 0.95 – 1.00 | ~500 km | 细微外边缘光斑耗散 |

### 2.2 UV 坐标极坐标映射算法
在 Three.js `RingGeometry` 中，默认 UV 并非纯同心径向。系统通过重写顶点属性中的 UV 缓冲：
$$u = \frac{\sqrt{x^2 + y^2} - R_{inner}}{R_{outer} - R_{inner}}, \quad v = 0.5$$
确保 1D 线性梯度画布能够完美沿同心圆无缝展开，呈现与真实航天照片一致的同心微环结构。

---

## 3. 地球双模纹理合成体系 (Earth Dual-Mode Texture System)

### 3.1 昼半球：NASA Blue Marble 蓝理石合成
- **深海梯度**: 高纬度极地洋深青蓝 (`#0a2342`) 到赤道深海 (`#062852`)。
- **大陆架浅海浅滩**: 环绕各大洲边缘的绿松石浅蓝色漫射晕 (`rgba(12, 120, 160, 0.45)`)。
- **植被陆块**: 欧亚大陆森林绿、亚马逊盆地热带翡翠绿、西欧温带植被。
- **干旱沙漠带**: 沿北纬 20°–30° 生成贯穿撒哈拉、阿拉伯半岛、中亚及戈壁沙漠的金黄至赭石色带。
- **极地冰盖**: 格陵兰与南极洲的高反照率纯白椭圆冰穹。

### 3.2 夜半球：NASA Black Marble 黑理石城市灯火
- **特大城市群金琥珀辐射**:
  - 东亚沿海经济带（京津冀、长三角、大湾区、东京湾、首尔圈）
  - 北美波士华大都市圈与西海岸科技带
  - 欧洲蓝香蕉工业经济走廊
  - 恒河平原与印度次大陆聚落
  - 尼罗河谷及中东三角洲绿洲
- **散布微光点群**: 900+ 次级城市与交通干线夜间发光点。

### 3.3 动力学气旋云层 (Earth Cloud & Weather System)
- 赤道低气压带 (ITCZ) 浓云带。
- 温带气旋涡旋与冷暖锋面云系。
- 独立于地表自转角速度 ($+20\%$)，产生逼真的云陆相对位移。

---

## 4. 太阳系其它天体合成规范

- **太阳 (Sun Photosphere & Corona)**:
  - 动态对流米粒组织 (Convective Granulation)。
  - 太阳边缘临边昏暗与背向大气光晕 (BackSide Corona Mesh)。
- **木星 (Jupiter)**:
  - 14 条深浅交替的氨冰云带与急流带 (Harmonic Belt Modulation)。
  - 南温带大红斑 (Great Red Spot) 逆时针反气旋涡旋。
- **火星 (Mars)**:
  - 氧化铁锈红土壤背景 (`#b34d28`)。
  - 大流沙 (Syrtis Major) 与子午线高原深色玄武岩反照率特征。
  - 二氧化碳干冰与水冰构成的南北两极冰冠。
- **月球与水星 (Moon & Mercury)**:
  - 撞击坑反光外壁、暗色玄武岩月海 (Lunar Maria) 区域。
