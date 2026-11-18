# @orchard/YooPicker

开发模式专用的**全站元素圈选浮框**。选中页面元素后，可把「能直接喂给 AI / 让自己回找源码」的定位信息复制出来。

- 只依赖 React（`react` / `react-dom` 为 peerDependency），无 UI 库依赖；
- 样式运行时自动注入，**不需要任何 CSS 构建配置**；
- 仅开发环境渲染（`NODE_ENV=production` 时默认不挂载，也不会加载样式）。

## 安装

包尚未发布到公共 registry，推荐按目录 / git 引用：

```bash
# 同级目录（本仓库放在 orchard-app-framework 旁边时）
pnpm add @orchard/YooPicker@file:../YooPicker

# 或走 git（构建产物 dist/ 已随仓库提交，安装时不需要执行构建脚本）
pnpm add git+ssh://git@github.com/yhui02/YooPicker.git
pnpm add git+https://github.com/yhui02/YooPicker.git
```

需要锁定版本时在末尾加 `#v0.1.0` 或 `#<commit>`。

> 改完 `src/` 记得 `pnpm build` 并一并提交 `dist/`，否则 git 引用方拿到的还是旧产物。

## 用法（Next.js App Router）

```tsx
// src/components/dev/DevTools.tsx
'use client';
import dynamic from 'next/dynamic';

const DevElementPicker = dynamic(
  () => import('@orchard/YooPicker').then((m) => ({ default: m.DevElementPicker })),
  { ssr: false },
);

export function DevTools() {
  if (process.env.NODE_ENV === 'production') return null;
  return <DevElementPicker />;
}
```

```tsx
// src/app/layout.tsx
<DevTools />
```

Vite / CRA 等同样适用：`<DevElementPicker />` 是一个普通客户端组件，`useEffect` 里注入样式。

## Props

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `force` | `boolean` | `false` | 生产环境也渲染（调试用，慎开） |
| `storageKey` | `string` | `'yoopicker:pos'` | 停靠位置存储键；同域名多项目可各用各的 |
| `defaultSide` | `'left' \| 'right'` | `'left'` | 首次使用的停靠侧 |
| `label` | `string` | `'开发圈选'` | 按钮文案 |
| `onCopy` | `(text: string) => void` | — | 复制成功回调（内置提示照常） |

主题可选用 CSS 变量覆盖：`--dvp-z`（层级基准，默认 `2147482000`）。

## 交互

- 点击 / 拖动（4px 阈值区分）：拖动可停靠到屏幕左/右，位置记在 `localStorage`；
- `↑` / `↓`：在同一条祖先链上扩大 / 缩小选区，标签显示「第 N/M 层」；
- 点击页面元素加入结果列表；点列表行 = 只复制该项（框上方提示 + 行闪动）；
- 重复点同一元素：不新增，已有行琥珀色抖动提示；
- `Esc` / 右键 / 再点开关 / 托盘 `×`：退出圈选；
- 列表最多展示 10 条，第 11 条开始滚动。

## 复制内容格式

```
页面: /model-designer/crmActivity
1) 保存
   路径: body > div:nth-child(2) > header:nth-child(1) > span:nth-child(6) > button:nth-child(1)
   属性: class="arco-btn arco-btn-secondary"; type="button"
   上下文: header.dsg-topbar
```

- `页面` 按出现顺序分组，编号跨页面连续；
- `路径` 只留一条从 `body` 起的完整路径（不再重复输出短 selector）；
- `属性` 取 class（前 6 个）、aria-label（与名称相同则省）、title、type、href、data-node-id、其它 `data-*`；
  点到按钮内文字/图标时，属性会借用最近的可交互祖先；
- `上下文` = 最近的 `header/section/main/nav/article/aside` 容器 + 容器内标题。

## 开发

```bash
pnpm install
pnpm typecheck   # 类型检查
pnpm test        # 纯逻辑单测（vitest）
pnpm build       # 生成 dist（含 .d.ts）+ 由 styles.css 生成 styles.generated.ts
```

`src/styles.css` 是样式真源；`src/styles.generated.ts` 由 `scripts/build-styles.mjs` 生成，不要手改。
