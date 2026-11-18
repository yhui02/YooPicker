/**
 * 开发模式专用的「全站元素圈选」（仅 development 渲染）。
 *
 * 与业务预览里的圈选（青绿色，改应用配置）完全无关：这里面向**开发者自己**，
 * 用于把任意页面元素的「精确位置」复制出来，喂给大模型让它定位代码/组件。
 *
 * - 覆盖整个系统的所有页面（框架页 + 业务应用），不区分应用；
 * - 可多选累计，托盘里提供「复制路径」入口，点单行只复制这一项；
 * - 高亮候选支持 ↑ 扩大到父元素 / ↓ 缩小回子元素（沿同一条祖先链调整，标签显示第 N/M 层）；
 * - Esc / 右键 / 再点开关 / 托盘 × 均可退出圈选态（右键同时压掉浏览器原生菜单）；
 * - 紫色主题，与平台青绿色圈选区分；
 * - 纯前端 DOM 信息，不发任何请求。
 */
export interface DevPick {
    route: string;
    /** 可辨识名称：优先取元素自身文字，其次 aria-label/标题/标识，最后回退标签+类名 */
    name: string;
    /** 名称来源，便于判断可靠性 */
    nameFrom?: 'self-text' | 'inner-text' | 'aria' | 'heading' | 'attr' | 'ancestor' | 'fallback';
    tag: string;
    classes: string[];
    /** 可直接用于 document.querySelector 的短选择器 */
    selector: string;
    /** 从 body 起的完整层级路径（含 nth-child） */
    domPath: string;
    text?: string;
    role?: string;
    ariaLabel?: string;
    /** 应用元数据节点 id（若元素在 data-node-id 内） */
    nodeId?: string;
    /** 最近的标题文本（h1/h2/h3 或卡片头） */
    heading?: string;
    /** 原生 title 属性 */
    title?: string;
    /** 按钮 type / 链接 type 等 */
    type?: string;
    /** 链接地址（截断） */
    href?: string;
    /** 其它 data-* 属性（最多 3 条，已格式化） */
    dataAttrs?: string[];
    /** 最近的语义容器 + 标题，如 header.arco-layout-header > 「活动信息」 */
    context?: string;
}
/** 短选择器：id > data-node-id > 标签.首个类名 > 末段 nth-child 路径 */
export declare function shortSelector(el: Element): string;
/** 从 body 到目标的完整 nth-child 路径（最长 12 段，够定位） */
export declare function cssPath(el: Element, root?: Element | null): string;
/** 抓取一个元素的结构信息（不含业务数据以外的东西；text 仅截断用于人读） */
/**
 * 为圈选项取一个「一眼能认出来」的名称：
 * ① 元素自身的直接文本节点（不含子元素，最精准） ② aria-label ③ 最近标题
 * ④ innerText 首行（容器类兜底） ⑤ data-node-id / data-nav / id ⑥ 标签.类名。
 */
export declare function pickName(el: Element): {
    name: string;
    from: NonNullable<DevPick['nameFrom']>;
};
/**
 * 最近的语义容器 + 标题：`header.arco-layout-header > 「活动信息」`。
 * 只用于「这元素在哪个区域」，不参与精确定位，因此类名取第一个非构建哈希类。
 */
export declare function pickContext(el: Element): string | undefined;
export declare function describeDevPick(el: Element, route: string): DevPick;
/** 把多条圈选整理成可直接发给大模型的文本 */
export declare function formatDevPicks(picks: DevPick[]): string;
/**
 * 从 el 向上的祖先链（不含 root），供方向键 ↑/↓ 在「同一条链」上扩大 / 缩小选区。
 * 组件传 document.body 作 root —— 最大选区是 body 的直接子容器，不会扩到整页；
 * 与 cssPath 同取 12 段上限，避免深 DOM 里一路按 ↑ 走太远。
 */
export declare function ancestorChain(el: Element, root?: Element | null): Element[];
/** 在祖先链上按方向移动层级，越界保持不动（delta: +1 扩大到父 / -1 缩小回子） */
export declare function shiftDepth(depth: number, delta: number, length: number): number;
export interface DevPickerProps {
    /** 生产环境也渲染（默认只在非 production 渲染） */
    force?: boolean;
    /** 停靠位置存储键；同一域名下多个项目可各用各的 */
    storageKey?: string;
    /** 首次使用的停靠侧 */
    defaultSide?: 'left' | 'right';
    /** 按钮文案 */
    label?: string;
    /** 复制成功后的回调（内置反馈照常显示） */
    onCopy?: (text: string) => void;
}
/** 样式只注入一次：宿主无需配置 CSS 管线 */
export declare function ensureDevPickerStyles(): void;
export declare function DevElementPicker({ force, storageKey, defaultSide, label, onCopy, }?: DevPickerProps): import("react").ReactPortal | null;
