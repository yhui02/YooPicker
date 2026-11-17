import { describe, expect, it } from 'vitest';
import { ancestorChain, cssPath, describeDevPick, formatDevPicks, pickContext, pickName, shiftDepth, shortSelector, type DevPick } from './DevElementPicker';

/** 轻量 DOM 桩：只实现圈选逻辑用到的字段/方法 */
function mk(tag: string, opts: { id?: string; cls?: string[]; attrs?: Record<string, string>; children?: any[]; text?: string; parent?: any } = {}) {
  const el: any = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: opts.id ?? '',
    classList: opts.cls ?? [],
    children: opts.children ?? [],
    childNodes: opts.text ? [{ nodeType: 3, textContent: opts.text }] : [],
    parentElement: opts.parent ?? null,
    textContent: opts.text ?? '',
    innerText: opts.text ?? '',
    getAttribute: (n: string) => opts.attrs?.[n] ?? null,
    querySelector: (sel: string) => {
      const tags = sel.split(',').map((x: string) => x.trim().toUpperCase());
      const find = (list: any[]): any => {
        for (const c of list) {
          if (tags.includes(c.tagName)) return c;
          const hit = find(c.children ?? []);
          if (hit) return hit;
        }
        return null;
      };
      return find(el.children ?? []);
    },
    closest: (sel: string) => {
      let cur: any = el;
      while (cur) {
        if (sel.includes('data-node-id') && cur.getAttribute('data-node-id')) return cur;
        if (/h1|h2|h3/.test(sel) && /^H[123]$/.test(cur.tagName)) return cur;
        if (sel.split(',').map((x: string) => x.trim().toUpperCase()).includes(cur.tagName)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
  };
  return el;
}

function link(parent: any, tag: string, opts: Parameters<typeof mk>[1] = {}) {
  const el = mk(tag, { ...opts, parent });
  parent.children.push(el);
  return el;
}

describe('↑/↓ 层级调整', () => {
  const doc: any = {};
  const html = mk('html');
  const body = mk('body');
  (html as any).ownerDocument = doc;
  (body as any).ownerDocument = doc;
  (body as any).parentElement = html;
  doc.documentElement = html;
  doc.body = body;
  const linkDoc = (parent: any, tag: string, opts: Parameters<typeof mk>[1] = {}) => {
    const el = link(parent, tag, opts);
    (el as any).ownerDocument = doc;
    return el;
  };
  const wrap = linkDoc(body, 'div', { cls: ['wrap'] });
  const card = linkDoc(wrap, 'div', { cls: ['card'] });
  const span = linkDoc(card, 'span', { cls: ['label'], text: '指标' });

  it('pickName：优先自身文字，回退 aria/标识/标签', () => {
    // 自身直接文本
    const btn = mk('button', { cls: ['op'], attrs: { 'aria-label': '打开预览' } });
    const txt = mk('span', { text: '预 览', parent: btn });
    btn.children.push(txt);
    expect(pickName(txt).name).toBe('预 览');
    expect(pickName(txt).from).toBe('self-text');
    // 无自身文字时取 aria-label
    expect(pickName(btn).name).toBe('打开预览');
    expect(pickName(btn).from).toBe('aria');
    // 都没有时取 data-node-id
    const node = mk('div', { attrs: { 'data-node-id': 'main-table' } });
    expect(pickName(node)).toEqual({ name: 'main-table', from: 'attr' });
    // 最后回退标签.类名
    expect(pickName(mk('div', { cls: ['card'] }))).toEqual({ name: 'div.card', from: 'fallback' });
  });

  it('ancestorChain：从最深元素到 body 的祖先链（不含 body），12 段封顶', () => {
    const chain = ancestorChain(span, doc.body);
    expect(chain).toEqual([span, card, wrap]);
    // 根（body）与 html 都不会进链：最大选区是 body 的直接子容器
    expect(chain).not.toContain(doc.body);
    // 无 root：默认整条链，含 body/html
    expect(ancestorChain(span)).toEqual([span, card, wrap, doc.body, doc.documentElement]);
  });

  it('shiftDepth：链上移动层级，越界保持不动', () => {
    // 链长 3：span(0) → card(1) → wrap(2)
    expect(shiftDepth(0, 1, 3)).toBe(1); // ↑ 扩大到父
    expect(shiftDepth(2, 1, 3)).toBe(2); // 已最外层，↑ 不动
    expect(shiftDepth(1, -1, 3)).toBe(0); // ↓ 缩小回子
    expect(shiftDepth(0, -1, 3)).toBe(0); // 已最深，↓ 不动
    expect(shiftDepth(0, 1, 0)).toBe(0); // 空链恒 0
  });
});

describe('DevElementPicker 纯逻辑', () => {
  it('cssPath 生成 nth-child 链', () => {
    const body = mk('body');
    const d1 = link(body, 'div');
    const d2 = link(d1, 'div');
    const btn = link(d2, 'button');
    link(d2, 'span'); // 让 button 是第 1 个，span 第 2 个
    expect(cssPath(btn, body)).toBe('div:nth-child(1) > div:nth-child(1) > button:nth-child(1)');
  });

  it('shortSelector 优先 id / data-node-id / 类名', () => {
    const body = mk('body');
    const a = link(body, 'div', { id: 'arco-tabs-1-panel-1' });
    expect(shortSelector(a)).toBe('#arco-tabs-1-panel-1');
    const b = link(body, 'div', { attrs: { 'data-node-id': 'main-table' } });
    expect(shortSelector(b)).toBe('div[data-node-id="main-table"]');
    const c = link(body, 'button', { cls: ['mdl-op-btn'] });
    expect(shortSelector(c)).toBe('button.mdl-op-btn');
  });

  it('describeDevPick 汇总 tag/类名/文本/角色/节点/标题', () => {
    const body = mk('body');
    const d = link(body, 'div', { attrs: { 'data-node-id': 'main-table' } });
    const btn = link(d, 'button', { cls: ['mdl-op'], attrs: { role: 'button', 'aria-label': '预览' }, text: '  预览  ' });
    const pick = describeDevPick(btn as unknown as Element, '/app-management/mini-crm?tab=pages');
    expect(pick.route).toBe('/app-management/mini-crm?tab=pages');
    expect(pick.tag).toBe('button');
    expect(pick.classes).toEqual(['mdl-op']);
    expect(pick.text).toBe('预览');
    expect(pick.role).toBe('button');
    expect(pick.ariaLabel).toBe('预览');
    expect(pick.nodeId).toBe('main-table'); // 祖先带 data-node-id
    expect(pick.selector).toBe('button.mdl-op');
  });

  it('formatDevPicks 输出可复制的定位文本', () => {
    const picks: DevPick[] = [
      { route: '/app-management/mini-crm', name: '预览', tag: 'button', classes: ['mdl-op'], selector: 'button.mdl-op', domPath: 'div:nth-child(1) > button:nth-child(2)', text: '预览', ariaLabel: '预览' },
      { route: '/app-management/mini-crm', name: '应用管理', tag: 'a', classes: [], selector: '#nav-apps', domPath: 'div:nth-child(1) > a:nth-child(1)', heading: '应用管理' },
    ];
    const text = formatDevPicks(picks);
    expect(text).toContain('页面: /app-management/mini-crm');
    expect(text).not.toContain('开发圈选');
    // 每项：名称 + 单条完整路径 + 可选属性 + 可选上下文
    expect(text).toContain('1) 预览');
    expect(text).toContain('   路径: div:nth-child(1) > button:nth-child(2)');
    expect(text).toContain('class="mdl-op"');
    expect(text).not.toContain('domPath');
    expect(text).not.toContain('selector:');
    // 与名称重复的 aria-label 不输出（避免冗余），不同的仍保留
    expect(text).not.toContain('aria-label=');
    const withAria = formatDevPicks([{ route: '/x', name: 'CRM', tag: 'button', classes: [], selector: '#a', domPath: 'body > button', ariaLabel: '打开预览' }]);
    expect(withAria).toContain('aria-label="打开预览"');
    expect(text).toContain('2) 应用管理');
    expect(text).toContain('   路径: div:nth-child(1) > a:nth-child(1)');
  });

  it('formatDevPicks：跨页面按页面分组、编号连续', () => {
    const picks: DevPick[] = [
      { route: '/app-management', name: '应用管理', tag: 'a', classes: [], selector: 'a[data-nav="apps"]', domPath: 'body > a:nth-child(1)', text: '应用' },
      { route: '/apps/mini-crm/p/m-crmContact', name: '预览', tag: 'button', classes: ['op'], selector: 'button.op', domPath: 'body > div > button:nth-child(2)', text: '预览' },
      { route: '/app-management', name: '新建应用', tag: 'button', classes: [], selector: '#new-app', domPath: 'body > button:nth-child(3)' },
    ];
    const text = formatDevPicks(picks);
    expect(text.match(/页面: /g)).toHaveLength(2);
    expect(text).toContain('页面: /app-management');
    expect(text).toContain('页面: /apps/mini-crm/p/m-crmContact');
    // 按页面首次出现顺序分组：同页第 2 项编号 2，另一页的项编号 3
    expect(text).toContain('2) 新建应用');
    expect(text).toContain('3) 预览');
  });

  it('formatDevPicks：上下文与原生属性（title/type/data-*）一并输出', () => {
    const text = formatDevPicks([
      {
        route: '/model-designer/crmActivity',
        name: '删除',
        tag: 'button',
        classes: ['arco-btn', 'arco-btn-danger'],
        selector: 'header > span:nth-child(6) > button:nth-child(2)',
        domPath: 'body > div:nth-child(2) > header:nth-child(1) > span:nth-child(6) > button:nth-child(2)',
        title: '删除活动',
        type: 'button',
        dataAttrs: ['data-testid="del-btn"'],
        context: 'header.arco-layout-header > 「活动信息」',
      },
    ]);
    expect(text).toContain('1) 删除');
    expect(text).toContain('路径: body > div:nth-child(2) > header:nth-child(1)');
    expect(text).toContain('class="arco-btn arco-btn-danger"');
    expect(text).toContain('title="删除活动"');
    expect(text).toContain('type="button"');
    expect(text).toContain('data-testid="del-btn"');
    expect(text).toContain('上下文: header.arco-layout-header > 「活动信息」');
  });

  it('pickContext：取最近的语义容器与标题', () => {
    const body = mk('body');
    const header = link(body, 'header', { cls: ['arco-layout-header', 'mdl-head'] });
    const h1 = link(header, 'h1', { text: '活动信息' });
    const btn = link(header, 'button', { text: '删除' });
    expect(pickContext(btn)).toBe('header.arco-layout-header > 「活动信息」');
  });

  it('formatDevPicks 空数组返回空串', () => {
    expect(formatDevPicks([])).toBe('');
  });
});
