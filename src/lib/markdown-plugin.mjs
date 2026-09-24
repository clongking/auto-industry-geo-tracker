/**
 * Markdown 渲染后处理（Sätteri hast 插件，Astro 7 默认 Markdown 处理器）：
 * 1. 站内绝对路径（/regions/us/ 等）自动加上 base 前缀，保证部署到子路径时可用；
 * 2. 外部链接新开标签页并加 rel="noopener"；
 * 3. 形如 [[Reuters]](url) 的来源链接：去掉方括号并加 class="source"，由 CSS 渲染为小标签；
 * 4. 表格外包 <div class="table-wrap">，移动端可横向滚动。
 */
export function contentPlugin(options = {}) {
  const base = (options.base || '/').replace(/\/+$/, '');

  return {
    name: 'auto-geopolitics-content',
    element: [
      {
        filter: ['a'],
        visit(node, ctx) {
          const props = { ...(node.properties || {}) };
          const href = String(props.href || '');
          if (href.startsWith('/') && !href.startsWith('//')) {
            props.href = base + href;
          } else if (/^https?:\/\//i.test(href)) {
            props.target = '_blank';
            props.rel = ['noopener', 'noreferrer'];
          }

          let children = node.children;
          const only = children?.length === 1 && children[0].type === 'text' ? children[0].value : null;
          if (only && /^\[.+\]$/.test(only.trim())) {
            children = [{ type: 'text', value: only.trim().slice(1, -1) }];
            const cls = props.className;
            props.className = Array.isArray(cls) ? [...cls, 'source'] : cls ? [cls, 'source'] : ['source'];
          }

          ctx.replaceNode(node, { type: 'element', tagName: 'a', properties: props, children });
        },
      },
      {
        filter: ['table'],
        visit(node, ctx) {
          ctx.wrapNode(node, {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [],
          });
        },
      },
    ],
  };
}
