'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEV_PICKER_CSS } from './styles.generated.js';
const MAX_TEXT = 60;
/** 停靠边距：左右与底部统一 16px（最左/最右 与 最下 的最小距离一致） */
const EDGE_X = 16;
const EDGE_BOTTOM = 16;
/** 短选择器：id > data-node-id > 标签.首个类名 > 末段 nth-child 路径 */
export function shortSelector(el) {
    if (el.id)
        return `#${el.id}`;
    const nodeId = el.getAttribute?.('data-node-id');
    const tag = el.tagName.toLowerCase();
    if (nodeId)
        return `${tag}[data-node-id="${nodeId}"]`;
    const navKey = el.getAttribute?.('data-nav') ?? el.getAttribute?.('data-nav-item');
    if (navKey)
        return `${tag}[data-nav="${navKey}"]`;
    const cls = Array.from(el.classList ?? []).filter((c) => !/^(css-|sc-|arco-|is-|cur$|on$|active$)/.test(c))[0];
    if (cls)
        return `${tag}.${cls}`;
    const segs = cssPath(el).split(' > ');
    return segs.slice(-3).join(' > ');
}
/** 从 body 到目标的完整 nth-child 路径（最长 12 段，够定位） */
export function cssPath(el, root = null) {
    const parts = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1 && parts.length < 12) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id) {
            parts.unshift(`#${cur.id}`);
            break;
        }
        const parent = cur.parentElement;
        if (parent) {
            const idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
            seg += `:nth-child(${idx})`;
        }
        parts.unshift(seg);
        cur = parent;
    }
    return parts.join(' > ');
}
/** 抓取一个元素的结构信息（不含业务数据以外的东西；text 仅截断用于人读） */
/**
 * 为圈选项取一个「一眼能认出来」的名称：
 * ① 元素自身的直接文本节点（不含子元素，最精准） ② aria-label ③ 最近标题
 * ④ innerText 首行（容器类兜底） ⑤ data-node-id / data-nav / id ⑥ 标签.类名。
 */
export function pickName(el) {
    const own = Array.from(el.childNodes ?? [])
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0)
        .join(' ')
        .slice(0, 40);
    if (own)
        return { name: own, from: 'self-text' };
    const aria = el.getAttribute?.('aria-label');
    if (aria?.trim())
        return { name: aria.trim().slice(0, 40), from: 'aria' };
    const head = el.closest?.('h1,h2,h3');
    const heading = head ? (head.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
    if (heading)
        return { name: heading.slice(0, 40), from: 'heading' };
    const inner = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    const first = inner.split(' ').slice(0, 6).join(' ');
    if (first)
        return { name: first.slice(0, 40), from: 'inner-text' };
    const attr = el.getAttribute?.('data-node-id') ??
        el.getAttribute?.('data-nav') ??
        el.getAttribute?.('data-nav-item') ??
        el.id;
    if (attr?.trim())
        return { name: attr.trim().slice(0, 40), from: 'attr' };
    // 图标类元素（svg/path/i）常没有文字：向上找最近祖先的标签/文字，保证可辨识
    let anc = el.parentElement ?? null;
    for (let depth = 0; anc && depth < 3 && anc.tagName.toLowerCase() !== 'body'; depth += 1) {
        const label = anc.getAttribute?.('aria-label') ?? anc.getAttribute?.('title');
        if (label?.trim())
            return { name: label.trim().slice(0, 40), from: 'ancestor' };
        const own = Array.from(anc.childNodes ?? [])
            .filter((n) => n.nodeType === 3)
            .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' ')
            .slice(0, 40);
        if (own)
            return { name: own, from: 'ancestor' };
        anc = anc.parentElement;
    }
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList ?? [])[0];
    return { name: cls ? `${tag}.${cls}` : tag, from: 'fallback' };
}
/**
 * 最近的语义容器 + 标题：`header.arco-layout-header > 「活动信息」`。
 * 只用于「这元素在哪个区域」，不参与精确定位，因此类名取第一个非构建哈希类。
 */
export function pickContext(el) {
    const host = el.closest?.('header,section,main,nav,article,aside') ?? null;
    const own = host && host !== el ? host : null;
    const tag = own ? own.tagName.toLowerCase() : '';
    const cls = own
        ? (Array.from(own.classList ?? []).find((c) => !/^(css-|sc-|is-)/.test(c)) ?? '')
        : '';
    // 标题优先取容器内的（按钮通常与标题同级，不是标题的子孙）
    const headEl = own?.querySelector?.('h1,h2,h3') ?? el.closest?.('h1,h2,h3') ?? null;
    const heading = headEl ? (headEl.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    const left = own ? `${tag}${cls ? `.${cls}` : ''}` : '';
    if (!left && !heading)
        return undefined;
    return [left, heading ? `「${heading}」` : ''].filter(Boolean).join(' > ');
}
export function describeDevPick(el, route) {
    // 点到按钮里的文字/图标（span）时，自身没有可用属性：借最近的可交互祖先的属性，
    // 否则 class / aria 全空，AI 拿到后仍无法在源码里定位。
    const ownCls = Array.from(el.classList ?? []);
    const attrEl = ownCls.length === 0
        ? (el.closest?.('button,a,input,textarea,select,[role="button"]') ?? el)
        : el;
    const cls = Array.from(attrEl.classList ?? []).slice(0, 6);
    const raw = el.innerText ?? '';
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) || undefined;
    const role = attrEl.getAttribute?.('role') ?? undefined;
    const ariaLabel = attrEl.getAttribute?.('aria-label') ?? undefined;
    const owner = el.closest?.('[data-node-id]');
    const nodeId = owner?.getAttribute?.('data-node-id') ?? undefined;
    const head = el.closest?.('h1,h2,h3') ?? null;
    const heading = head ? (head.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) : undefined;
    const title = attrEl.getAttribute?.('title') ?? undefined;
    const type = attrEl.getAttribute?.('type') ?? undefined;
    const rawHref = attrEl.getAttribute?.('href') ?? undefined;
    const href = rawHref ? rawHref.slice(0, 80) : undefined;
    const dataAttrs = Array.from(attrEl.attributes ?? [])
        .filter((a) => a.name.startsWith('data-') && !['data-node-id', 'data-nav', 'data-nav-item'].includes(a.name))
        .slice(0, 3)
        .map((a) => `${a.name}="${a.value.slice(0, 40)}"`);
    const named = pickName(el);
    const context = pickContext(el);
    return {
        route,
        name: named.name,
        nameFrom: named.from,
        tag: el.tagName.toLowerCase(),
        classes: cls,
        selector: shortSelector(el),
        domPath: (typeof document !== 'undefined' && document.body ? `body > ${cssPath(el, document.body)}` : cssPath(el)),
        ...(text ? { text } : {}),
        ...(role ? { role } : {}),
        ...(ariaLabel ? { ariaLabel } : {}),
        ...(nodeId ? { nodeId } : {}),
        ...(heading ? { heading } : {}),
        ...(title ? { title } : {}),
        ...(type ? { type } : {}),
        ...(href ? { href } : {}),
        ...(dataAttrs.length ? { dataAttrs } : {}),
        ...(context ? { context } : {}),
    };
}
/** 把多条圈选整理成可直接发给大模型的文本 */
export function formatDevPicks(picks) {
    if (picks.length === 0)
        return '';
    // 圈选可跨页面累计：按「出现的页面」分组，每项带自己的功能路径；编号全量连续
    const groups = [];
    for (const p of picks) {
        const g = groups.find((x) => x.route === p.route);
        if (g)
            g.items.push(p);
        else
            groups.push({ route: p.route, items: [p] });
    }
    const lines = [];
    let n = 0;
    for (const g of groups) {
        lines.push(`页面: ${g.route}`);
        for (const p of g.items) {
            n += 1;
            lines.push(`${n}) ${p.name}`);
            // 只留一条完整路径（从 body 起），不再重复输出短 selector
            lines.push(`   路径: ${p.domPath}`);
            const attrs = [
                p.classes.length ? `class="${p.classes.join(' ')}"` : '',
                p.ariaLabel && p.ariaLabel !== p.name ? `aria-label="${p.ariaLabel}"` : '',
                p.title ? `title="${p.title}"` : '',
                p.type ? `type="${p.type}"` : '',
                p.href ? `href="${p.href}"` : '',
                p.nodeId ? `data-node-id="${p.nodeId}"` : '',
                ...(p.dataAttrs ?? []),
            ].filter(Boolean);
            if (attrs.length)
                lines.push(`   属性: ${attrs.join('; ')}`);
            if (p.context)
                lines.push(`   上下文: ${p.context}`);
            lines.push('');
        }
    }
    return lines.join('\n').trimEnd();
}
/**
 * 从 el 向上的祖先链（不含 root），供方向键 ↑/↓ 在「同一条链」上扩大 / 缩小选区。
 * 组件传 document.body 作 root —— 最大选区是 body 的直接子容器，不会扩到整页；
 * 与 cssPath 同取 12 段上限，避免深 DOM 里一路按 ↑ 走太远。
 */
export function ancestorChain(el, root = null) {
    const chain = [];
    let cur = el;
    while (cur && cur !== root && cur.nodeType === 1 && chain.length < 12) {
        chain.push(cur);
        cur = cur.parentElement;
    }
    return chain;
}
/** 在祖先链上按方向移动层级，越界保持不动（delta: +1 扩大到父 / -1 缩小回子） */
export function shiftDepth(depth, delta, length) {
    if (length <= 0)
        return 0;
    return Math.min(Math.max(depth + delta, 0), length - 1);
}
/** 样式只注入一次：宿主无需配置 CSS 管线 */
export function ensureDevPickerStyles() {
    if (typeof document === 'undefined')
        return;
    if (document.getElementById('yoopicker-styles'))
        return;
    const el = document.createElement('style');
    el.id = 'yoopicker-styles';
    el.textContent = DEV_PICKER_CSS;
    document.head.appendChild(el);
}
export function DevElementPicker({ force = false, storageKey = 'yoopicker:pos', defaultSide = 'left', label = '开发圈选', onCopy, } = {}) {
    const [mounted, setMounted] = useState(false);
    const [active, setActive] = useState(false);
    const [picks, setPicks] = useState([]);
    const [trayOpen, setTrayOpen] = useState(false);
    const [hover, setHover] = useState(null);
    /** 复制成功时闪一下对应的行；重复选择时用另一种颜色闪已有行（都不弹文字） */
    const [flash, setFlash] = useState(null);
    const flashTimer = useRef(null);
    /** 复制成功的文字提示：贴在圈选框上方，不用全局 Message */
    const [notice, setNotice] = useState(null);
    const [noticeKind, setNoticeKind] = useState('ok');
    const noticeTimer = useRef(null);
    /** 停靠位置：左右贴边 + 距底高度，记在 localStorage，刷新后保持 */
    const [pos, setPos] = useState({ side: defaultSide, bottom: EDGE_BOTTOM });
    /** 拖拽中的临时自由位置（松手后吸附到最近一侧） */
    const [drag, setDrag] = useState(null);
    const dragStart = useRef(null);
    /** 拖拽结束的那次 pointerup 不应再触发切换圈选态 */
    const suppressClick = useRef(false);
    const hoverElRef = useRef(null);
    /** 当前 hover 元素向上的祖先链，↑/↓ 只在这条链上移动 */
    const chainRef = useRef([]);
    const depthRef = useRef(0);
    /** 最近一次选中的条目索引：>=0 时方向键就地调整该条，不新增 */
    const activePickRef = useRef(-1);
    const picksRef = useRef([]);
    picksRef.current = picks;
    const POS_KEY = storageKey;
    useEffect(() => {
        if (process.env.NODE_ENV === 'production' && !force)
            return;
        ensureDevPickerStyles();
        setMounted(true);
    }, [force]);
    // 恢复上次停靠位置（左右 + 距底高度）
    useEffect(() => {
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (!raw)
                return;
            const p = JSON.parse(raw);
            if ((p.side === 'left' || p.side === 'right') && typeof p.bottom === 'number' && Number.isFinite(p.bottom)) {
                setPos({ side: p.side, bottom: Math.max(EDGE_BOTTOM, Math.min(p.bottom, window.innerHeight - 120)) });
            }
        }
        catch {
            /* 读不到就用默认位置 */
        }
    }, []);
    // 窗口变矮时把按钮拉回可视范围
    useEffect(() => {
        const onResize = () => setPos((p) => ({ ...p, bottom: Math.max(EDGE_BOTTOM, Math.min(p.bottom, window.innerHeight - 120)) }));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    /** 让指定行闪一下：copy=紫色（复制成功）/ dup=琥珀色（已选过） */
    const flashRows = useCallback((rows, kind) => {
        setFlash({ rows, kind });
        if (flashTimer.current)
            clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 900);
    }, []);
    /** 复制成功的文字提示（框上方小胶囊，1.8s 自动消失） */
    const notify = useCallback((text, kind = 'ok') => {
        setNotice(text);
        setNoticeKind(kind);
        if (noticeTimer.current)
            clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 1800);
    }, []);
    useEffect(() => () => {
        if (flashTimer.current)
            clearTimeout(flashTimer.current);
        if (noticeTimer.current)
            clearTimeout(noticeTimer.current);
    }, []);
    const isOwn = useCallback((el) => !!el?.closest?.('[data-dev-ui]'), []);
    /** 只刷新高亮框与标签，不动祖先链与层级 */
    const applyHover = useCallback((el, depth, chainLength) => {
        hoverElRef.current = el;
        if (!el) {
            setHover(null);
            return;
        }
        const r = el.getBoundingClientRect();
        const p = describeDevPick(el, location.pathname + location.search);
        // 链长 >1 才有层级可言；正在调整已选条目时一并提示
        const level = chainLength > 1 ? `第 ${depth + 1}/${chainLength} 层` : '';
        const adjusting = activePickRef.current >= 0 ? ' · 已选项' : '';
        const hint = `${level}${adjusting}`.trim();
        setHover({
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
            label: `${p.name} · ${p.selector}`,
            hint: hint || undefined,
        });
    }, []);
    /** pointermove 入口：移到链外元素才重新拾取；仍停在链上时保留键盘调整过的层级 */
    const refreshHover = useCallback((el) => {
        if (!el) {
            chainRef.current = [];
            depthRef.current = 0;
            applyHover(null, 0, 0);
            return;
        }
        if (depthRef.current > 0 && chainRef.current.includes(el))
            return;
        const chain = ancestorChain(el, typeof document !== 'undefined' ? document.body : null);
        chainRef.current = chain;
        depthRef.current = 0;
        applyHover(el, 0, chain.length);
    }, [applyHover]);
    /** 退出圈选态：Esc / 开关 / 右键 / 托盘关闭统一走这里，清高亮并收起托盘 */
    const deactivate = useCallback(() => {
        setActive(false);
        setTrayOpen(false);
        refreshHover(null);
    }, [refreshHover]);
    /** 切到链上第 next 层：更新高亮；若正在调整已选条目则就地覆盖该条（编号/页面不变） */
    const moveDepth = useCallback((next) => {
        const total = chainRef.current.length;
        if (total === 0 || next === depthRef.current)
            return;
        depthRef.current = next;
        const el = chainRef.current[next] ?? null;
        applyHover(el, next, total);
        if (!el)
            return;
        const idx = activePickRef.current;
        if (idx < 0)
            return; // 尚未确认选中：只改变预览（覆盖上一次预览）
        const old = picksRef.current[idx];
        if (!old) {
            activePickRef.current = -1;
            return;
        }
        const nextPick = describeDevPick(el, old.route);
        setPicks((prev) => (prev[idx] ? prev.map((p, i) => (i === idx ? nextPick : p)) : prev));
    }, [applyHover]);
    useEffect(() => {
        if (!active)
            return;
        const onMove = (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el || isOwn(el)) {
                if (hoverElRef.current)
                    refreshHover(null);
                return;
            }
            // 鼠标移到别的元素 = 用户要重新选，退出「就地调整已选」模式
            if (activePickRef.current >= 0 && el !== hoverElRef.current)
                activePickRef.current = -1;
            if (el !== hoverElRef.current)
                refreshHover(el);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                deactivate();
                return;
            }
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')
                return;
            if (chainRef.current.length < 2)
                return;
            e.preventDefault();
            e.stopPropagation();
            moveDepth(shiftDepth(depthRef.current, e.key === 'ArrowUp' ? 1 : -1, chainRef.current.length));
        };
        const onClick = (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el || isOwn(el))
                return;
            e.preventDefault();
            e.stopPropagation();
            // 勾选当前高亮层（方向键调整后的层级），而不是光标处最深元素
            const pickEl = hoverElRef.current ?? el;
            const pick = describeDevPick(pickEl, location.pathname + location.search);
            // 完全相同的元素（selector + domPath 都一致）不重复添加，并明确提示
            const dup = picksRef.current.findIndex((p) => p.selector === pick.selector && p.domPath === pick.domPath);
            if (dup >= 0) {
                // 已选过：不弹文字，直接让托盘里那一条动一下，告诉用户「就是它」
                activePickRef.current = dup;
                flashRows([dup], 'dup');
                setTrayOpen(true);
                return;
            }
            activePickRef.current = picksRef.current.length;
            setPicks((prev) => [...prev, pick]);
            setTrayOpen(true);
        };
        const onDown = (e) => {
            if (isOwn(e.target))
                return;
            e.preventDefault();
            e.stopPropagation();
        };
        /** 右键 = 退出圈选（同时压掉浏览器原生右键菜单） */
        const onContextMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            deactivate();
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('contextmenu', onContextMenu, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [active, isOwn, refreshHover, deactivate, moveDepth]);
    const pageCount = new Set(picks.map((p) => p.route)).size;
    /** 托盘里的页面短名（路径末段），便于区分跨页面来源 */
    const shortRoute = (route) => {
        const clean = (route.split('?')[0] ?? '').replace(/\/+$/, '');
        const seg = clean.split('/').filter(Boolean).at(-1);
        return seg || '/';
    };
    const copy = useCallback(async () => {
        const text = formatDevPicks(picks);
        if (!text)
            return;
        try {
            await navigator.clipboard.writeText(text);
            flashRows(picks.map((_, i) => i), 'copy');
            notify(`已复制 ${picks.length} 个元素的定位路径`);
            onCopy?.(text);
        }
        catch {
            notify('复制失败，请手动选择托盘里的文本', 'err');
        }
    }, [picks, flashRows, notify, onCopy]);
    /** 点单行只复制这一项；复用 formatDevPicks 保证与「复制路径」的格式完全一致 */
    const copyOne = useCallback(async (p, index) => {
        const text = formatDevPicks([p]);
        if (!text)
            return;
        try {
            await navigator.clipboard.writeText(text);
            flashRows([index], 'copy');
            notify(`已复制第 ${index + 1} 项的定位路径`);
            onCopy?.(text);
        }
        catch {
            notify('复制失败，请手动选择托盘里的文本', 'err');
        }
    }, [flashRows, notify, onCopy]);
    if (!mounted)
        return null;
    return createPortal(_jsxs(_Fragment, { children: [active && hover && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dvp-hover", "data-dev-ui": true, style: { left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height }, children: [_jsx("i", { className: "dvp-c-tl" }), _jsx("i", { className: "dvp-c-tr" }), _jsx("i", { className: "dvp-c-bl" }), _jsx("i", { className: "dvp-c-br" })] }), _jsxs("div", { className: "dvp-label", "data-dev-ui": true, style: { left: hover.rect.left, top: hover.rect.top }, children: [hover.label, hover.hint && _jsx("span", { className: "dvp-label-hint", children: hover.hint })] })] })), _jsxs("button", { type: "button", "data-dev-ui": true, className: `dvp-toggle${active ? ' on' : ''}${drag ? ' dragging' : ''}`, style: drag
                    ? { left: drag.x, top: drag.y, right: 'auto', bottom: 'auto' }
                    : { left: pos.side === 'left' ? EDGE_X : 'auto', right: pos.side === 'right' ? EDGE_X : 'auto', bottom: pos.bottom }, onPointerDown: (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    dragStart.current = { px: e.clientX, py: e.clientY, top: r.top, left: r.left, w: r.width, h: r.height, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                }, onPointerMove: (e) => {
                    const st = dragStart.current;
                    if (!st)
                        return;
                    const dx = e.clientX - st.px;
                    const dy = e.clientY - st.py;
                    if (!st.moved && Math.hypot(dx, dy) < 4)
                        return; // 抖动阈值：区分点击与拖拽
                    st.moved = true;
                    setDrag({ x: st.left + dx, y: st.top + dy, w: st.w, h: st.h });
                }, onPointerUp: (e) => {
                    const st = dragStart.current;
                    dragStart.current = null;
                    if (!st?.moved)
                        return;
                    // 松手吸附到最近一侧，垂直位置保留并夹进视口
                    const x = drag?.x ?? st.left;
                    const y = drag?.y ?? st.top;
                    const side = x + st.w / 2 < window.innerWidth / 2 ? 'left' : 'right';
                    const top = Math.max(8, Math.min(y, window.innerHeight - st.h - EDGE_BOTTOM));
                    // 距底不小于 EDGE_BOTTOM：左下角与右下角吸附后离底边距离一致
                    const bottom = Math.max(EDGE_BOTTOM, Math.round(window.innerHeight - top - st.h));
                    setPos({ side, bottom });
                    setDrag(null);
                    try {
                        localStorage.setItem(POS_KEY, JSON.stringify({ side, bottom }));
                    }
                    catch {
                        /* 存不了就只在本页生效 */
                    }
                    suppressClick.current = true;
                    window.setTimeout(() => {
                        suppressClick.current = false;
                    }, 0);
                    e.preventDefault();
                }, onClick: () => {
                    if (suppressClick.current)
                        return;
                    if (active) {
                        deactivate();
                    }
                    else {
                        setActive(true);
                        if (picks.length > 0)
                            setTrayOpen(true);
                    }
                }, title: active ? '退出开发圈选（Esc / 右键）；↑ 扩大到父元素、↓ 缩小回子元素；未确认时覆盖预览，已确认时调整该条' : '开发模式：圈选页面元素并复制定位路径（↑↓ 可调选区层级；可拖动到左右两侧）', children: [_jsxs("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("path", { d: "M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" }), _jsx("path", { d: "M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" }), _jsx("path", { d: "M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" }), _jsx("path", { d: "M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" }), _jsx("circle", { cx: "12", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" })] }), _jsx("span", { children: label }), picks.length > 0 && _jsx("i", { className: "dvp-count", children: picks.length })] }), trayOpen && picks.length > 0 && (_jsxs("div", { className: "dvp-tray", "data-dev-ui": true, style: {
                    left: pos.side === 'left' ? EDGE_X : 'auto',
                    right: pos.side === 'right' ? EDGE_X : 'auto',
                    bottom: pos.bottom + 42,
                }, children: [notice && (_jsx("div", { className: `dvp-notice${noticeKind === 'err' ? ' is-err' : ''}`, "data-dev-ui": true, role: "status", children: notice })), _jsxs("div", { className: "dvp-tray-hd", children: [_jsxs("b", { children: ["\u5DF2\u5708\u9009 ", picks.length, " \u9879"] }), _jsx("span", { className: "dvp-tray-route", children: pageCount > 1 ? `跨 ${pageCount} 个页面` : picks[0].route }), _jsx("button", { type: "button", "data-dev-ui": true, className: "dvp-tray-close", "aria-label": "\u5173\u95ED\u5E76\u9000\u51FA", title: "\u5173\u95ED\u5E76\u9000\u51FA", onClick: deactivate, children: "\u00D7" })] }), _jsx("ul", { className: "dvp-tray-list", children: picks.map((p, i) => (_jsxs("li", { className: flash?.rows.includes(i) ? (flash.kind === 'dup' ? 'is-dup' : 'is-flash') : undefined, title: "\u70B9\u51FB\u590D\u5236\u8FD9\u4E00\u9879\u7684\u5B9A\u4F4D\u8DEF\u5F84", onClick: () => void copyOne(p, i), children: [_jsx("span", { className: "dvp-idx", children: i + 1 }), _jsxs("span", { className: "dvp-name", title: `${p.route}\nselector: ${p.selector}`, children: [_jsx("b", { children: p.name }), _jsx("code", { children: p.selector })] }), pageCount > 1 && _jsx("span", { className: "dvp-page", title: p.route, children: shortRoute(p.route) }), _jsx("button", { type: "button", "data-dev-ui": true, "aria-label": "\u79FB\u9664", title: "\u79FB\u9664\u8FD9\u4E00\u9879", onClick: (e) => {
                                        e.stopPropagation(); // 别让「移除」冒泡成整行复制
                                        setPicks((prev) => prev.filter((_, idx) => idx !== i));
                                    }, children: "\u00D7" })] }, `${p.selector}#${i}`))) }), _jsxs("div", { className: "dvp-tray-ft", children: [_jsx("span", { className: "dvp-tip", children: "\u5F00\u542F\u9009\u62E9\u65F6\uFF0C\u6309\u9F20\u6807\u53F3\u952E\u53EF\u5173\u95ED\u5708\u9009" }), _jsx("button", { type: "button", "data-dev-ui": true, className: "dvp-btn", onClick: () => setPicks([]), children: "\u6E05\u7A7A" }), _jsx("button", { type: "button", "data-dev-ui": true, className: "dvp-btn primary", onClick: () => void copy(), children: "\u590D\u5236\u8DEF\u5F84" })] })] }))] }), document.body);
}
