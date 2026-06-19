# solo-6600029: 无人机 3D 航线规划与地形避障

## 技术栈
- Frontend: Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + Leaflet
- Backend: Java 17 + Spring Boot 3.2.0

## 核心特性
1. **Leaflet 交互式地图**：拖拽航点、点击添加航点
2. **A* 路径规划**：网格化 A* 寻路，禁飞区避障
3. **RRT 快速随机树**：随机采样路径规划算法
4. **Catmull-Rom 平滑**：航线样条曲线平滑处理
5. **地形高程剖面图**：Canvas 渲染航线纵断面
6. **禁飞区可视化**：机场/军事/限制区红色半透明圆
7. **KML 导出**：Google Earth 兼容格式
8. **飞行模拟**：航线进度动画模拟
