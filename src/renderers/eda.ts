import type { FileRenderContext, FileViewerRenderedInstance } from '../contracts/types';
import {
  parseEdaFile,
  type EdaDomainRole,
  type EdaEntity,
  type EdaParseResult,
  type EdaStreamKind,
  type EdaStreamView,
  type EdaTreeNode,
} from './edaParser';

interface TreeRow extends EdaTreeNode {
  depth: number;
}

const roleLabels: Record<EdaDomainRole, string> = {
  root: '根',
  library: '库',
  symbol: '元件符号',
  footprint: '封装',
  padstack: 'Padstack',
  drawing: '图纸',
  metadata: '元数据',
  property: '属性',
  geometry: '几何',
  net: '网络',
  unknown: '未知',
};

const confidenceLabels: Record<EdaParseResult['stats']['confidence'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const edaStyle = `
.eda-viewer{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:#edf1f5;color:#172033;box-sizing:border-box}
.eda-viewer *{box-sizing:border-box}
.eda-header{min-height:84px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 176px 18px 22px;border-bottom:1px solid rgba(23,32,51,.08);background:#fff}
.eda-header span,.eda-panel-head span{color:#0b7480;font-size:12px;font-weight:900;letter-spacing:0}
.eda-header h2{margin:4px 0 0;font-size:22px;line-height:1.2}
.eda-header dl{display:grid;grid-template-columns:repeat(4,minmax(70px,auto));gap:10px;margin:0}
.eda-header dt,.eda-header dd,.eda-entity-group dl,.eda-entity-group dt,.eda-entity-group dd{margin:0}
.eda-header dt{color:#718096;font-size:12px}
.eda-header dd{color:#172033;font-weight:900}
.eda-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,32%) minmax(0,1fr)}
.eda-sidebar{min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px;border-right:1px solid rgba(23,32,51,.08);background:rgba(255,255,255,.74)}
.eda-summary,.eda-warning,.eda-panel,.eda-error{border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px rgba(23,32,51,.06)}
.eda-summary,.eda-warning{padding:12px}
.eda-summary strong{display:block;color:#172033}
.eda-summary p,.eda-warning p,.eda-empty p,.eda-entity-group p{margin:6px 0 0;color:#64748b;line-height:1.55}
.eda-mini-grid,.eda-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.eda-mini-grid div,.eda-stat-grid div{min-width:0;padding:10px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 1px rgba(23,32,51,.06)}
.eda-mini-grid span,.eda-stat-grid span{display:block;color:#718096;font-size:12px}
.eda-mini-grid strong,.eda-stat-grid strong{display:block;margin-top:4px;overflow:hidden;color:#172033;font-size:18px;text-overflow:ellipsis;white-space:nowrap}
.eda-warning{background:#fff7e8;color:#8a4b00}
.eda-search{height:42px;padding:0 12px;border-radius:12px;border:1px solid rgba(23,32,51,.1);outline:none;background:#fff;font:inherit}
.eda-stream-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px}
.eda-stream{min-height:78px;display:grid;grid-template-columns:74px minmax(0,1fr);gap:8px 10px;align-items:center;padding:10px;border:1px solid rgba(23,32,51,.08);border-radius:13px;background:#fff;color:inherit;font:inherit;text-align:left;cursor:pointer}
.eda-stream:hover,.eda-stream.active,.eda-tree button:hover,.eda-tree button.active,.eda-entity-group button:hover{border-color:rgba(11,116,128,.3);box-shadow:0 10px 22px rgba(23,32,51,.08)}
.eda-stream span{grid-row:span 3;min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;border-radius:10px;background:rgba(11,116,128,.12);color:#0b7480;font-size:11px;font-weight:900}
.eda-stream span[data-role='symbol']{background:rgba(34,134,90,.14);color:#1d7a52}
.eda-stream span[data-role='footprint'],.eda-stream span[data-role='padstack']{background:rgba(111,87,190,.14);color:#5c47a5}
.eda-stream strong,.eda-stream em,.eda-tree strong,.eda-tree em,.eda-tree small,.eda-entity-group strong,.eda-entity-group span,.eda-entity-group dd{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eda-stream em,.eda-stream small{color:#718096;font-size:12px;font-style:normal}
.eda-preview{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px;padding:16px}
.eda-panel{min-height:0;overflow:hidden}
.eda-panel-head{min-height:54px;padding:12px 14px;border-bottom:1px solid rgba(23,32,51,.08)}
.eda-panel-head strong{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eda-panel--compact .eda-panel-head{min-height:auto}
.eda-stat-grid{padding:14px}
.eda-stat-grid div{background:#f6f9fb}
.eda-topology,.eda-bottom{min-height:300px;display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:14px}
.eda-topology>.eda-panel{min-height:360px;max-height:min(58vh,620px);display:flex;flex-direction:column}
.eda-tree,.eda-entities,.eda-diagnostics,.eda-string-grid{min-height:0;max-height:380px;overflow:auto;overscroll-behavior:contain}
.eda-tree{flex:1;max-height:none;padding:10px}
.eda-entities{flex:1;max-height:none;padding:12px}
.eda-tree button{width:100%;min-height:42px;display:grid;grid-template-columns:minmax(22px,auto) minmax(0,1fr) minmax(72px,auto) minmax(72px,auto);gap:8px;align-items:center;margin-bottom:6px;padding:8px;border:1px solid rgba(23,32,51,.06);border-radius:10px;background:#f8fafc;color:inherit;font:inherit;text-align:left;cursor:pointer}
.eda-tree span{color:#0b7480;font-weight:900}
.eda-tree em,.eda-tree small{color:#718096;font-size:12px;font-style:normal}
.eda-entity-group+.eda-entity-group{margin-top:16px}
.eda-entity-group h3{margin:0 0 8px;color:#172033;font-size:14px}
.eda-entity-group button{width:100%;display:block;margin-bottom:8px;padding:12px;border:1px solid rgba(23,32,51,.08);border-radius:12px;background:#f8fafc;color:inherit;font:inherit;text-align:left;cursor:pointer}
.eda-entity-group button>span{display:block;margin-top:4px;color:#718096;font-size:12px}
.eda-entity-group dl{display:grid;gap:6px;margin-top:10px}
.eda-entity-group dl div{min-width:0;display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;color:#475569;font-size:12px}
.eda-entity-group dt{color:#718096;font-weight:800}
.eda-selected-meta,.eda-property-grid,.eda-local-strings{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px 0}
.eda-selected-meta span,.eda-property-grid div,.eda-local-strings span{min-width:0;display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:#eef6f7;color:#0b7480;font-size:12px;font-weight:800}
.eda-selected-meta span,.eda-local-strings span{padding:6px 10px}
.eda-property-grid div{max-width:100%;padding:6px 10px}
.eda-property-grid span{color:#64748b;font-weight:700}
.eda-property-grid strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eda-panel pre{min-height:220px;max-height:440px;margin:12px 0 0;overflow:auto;padding:16px;border-top:1px solid rgba(23,32,51,.08);background:#101725;color:#d9e7ff;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.eda-empty{min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.eda-string-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));align-content:start;gap:8px;padding:14px}
.eda-string-grid span{min-width:0;padding:8px 10px;border-radius:10px;background:#f6f9fb;color:#334155;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eda-diagnostics{padding:14px}
.eda-diagnostics p{margin:0 0 8px;padding:10px;border-radius:10px;background:#f6f9fb;color:#475569;line-height:1.5}
.eda-diagnostics p[data-level='warning']{background:#fff7e8;color:#8a4b00}
.eda-diagnostics span{display:inline-flex;margin-right:8px;color:#0b7480;font-size:11px;font-weight:900;text-transform:uppercase}
.eda-local-strings{padding-bottom:14px}
.eda-local-strings strong{width:100%;color:#172033;font-size:13px}
.eda-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;background:rgba(237,241,245,.9);z-index:2}
.eda-state span{width:32px;height:32px;border-radius:999px;border:3px solid rgba(11,116,128,.16);border-top-color:#0b7480;animation:eda-spin .9s linear infinite}
.eda-error{position:absolute;right:18px;bottom:18px;width:min(440px,calc(100% - 36px));padding:14px;background:#fff7e8;color:#8a4b00;z-index:3}
@keyframes eda-spin{to{transform:rotate(360deg)}}
.file-viewer[data-viewer-theme='dark'] .eda-viewer{background:#172033;color:#e5eef8}
.file-viewer[data-viewer-theme='dark'] .eda-header,.file-viewer[data-viewer-theme='dark'] .eda-summary,.file-viewer[data-viewer-theme='dark'] .eda-panel,.file-viewer[data-viewer-theme='dark'] .eda-sidebar{background:#fff;color:#172033}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .eda-viewer{background:#172033;color:#e5eef8}.file-viewer[data-viewer-theme='system'] .eda-header,.file-viewer[data-viewer-theme='system'] .eda-summary,.file-viewer[data-viewer-theme='system'] .eda-panel,.file-viewer[data-viewer-theme='system'] .eda-sidebar{background:#fff;color:#172033}}
@media (max-width:980px){.eda-header,.eda-body,.eda-topology,.eda-bottom{grid-template-columns:1fr}.eda-header{align-items:flex-start;flex-direction:column;padding-right:22px}.eda-body{display:flex;flex-direction:column}.eda-sidebar{max-height:42vh;border-right:0;border-bottom:1px solid rgba(23,32,51,.08)}}
@media (max-width:640px){.eda-header dl,.eda-mini-grid,.eda-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.eda-tree button{grid-template-columns:minmax(22px,auto) minmax(0,1fr)}.eda-tree em,.eda-tree small{display:none}}
`;

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return '-';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const mb = value / 1024 / 1024;
  if (mb >= 1) {
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  }
  return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
};

const roleLabel = (role: EdaDomainRole) => roleLabels[role] || role;

const kindLabel = (kind: EdaStreamKind) => {
  return kind === 'storage' ? '目录' : kind === 'text' ? '文本' : '二进制';
};

const normalizePath = (value: string) => value.replace(/^\/+/, '').toLowerCase();

const flattenTree = (nodes: EdaTreeNode[], depth = 0): TreeRow[] => {
  return nodes.flatMap(node => [
    { ...node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
};

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = edaStyle;
  return style;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
) => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const appendDefinition = (list: HTMLDListElement, label: string, value: string) => {
  const item = document.createElement('div');
  item.append(createElement('dt', undefined, label), createElement('dd', undefined, value));
  list.append(item);
};

const appendPanelHead = (panel: HTMLElement, title: string, value: string) => {
  const head = createElement('div', 'eda-panel-head');
  head.append(createElement('span', undefined, title), createElement('strong', undefined, value));
  panel.append(head);
};

const buildStatsCards = (parsed: EdaParseResult) => {
  const stats = parsed.stats;
  return [
    { label: '文本流', value: stats.textStreams },
    { label: '二进制流', value: stats.binaryStreams },
    { label: '目录', value: stats.storageEntries },
    { label: '属性', value: stats.propertyCount },
    { label: '符号', value: stats.symbolCount },
    { label: '封装', value: stats.footprintCount },
    { label: 'Padstack', value: stats.padstackCount },
    { label: '可信度', value: confidenceLabels[stats.confidence] },
  ];
};

const buildEntityGroups = (entities: EdaEntity[]) => {
  const groups: Array<{ role: EdaDomainRole; label: string; items: EdaEntity[] }> = [
    { role: 'symbol', label: '元件符号', items: [] },
    { role: 'footprint', label: '封装图形', items: [] },
    { role: 'padstack', label: 'Padstack', items: [] },
    { role: 'drawing', label: '图纸信息', items: [] },
  ];
  groups.forEach(group => {
    group.items = entities.filter(entity => entity.role === group.role);
  });
  return groups.filter(group => group.items.length);
};

const appendStatGrid = (target: HTMLElement, items: Array<{ label: string; value: string | number }>, className: string) => {
  const grid = createElement('div', className);
  items.forEach(item => {
    const cell = document.createElement('div');
    cell.append(createElement('span', undefined, item.label), createElement('strong', undefined, String(item.value)));
    grid.append(cell);
  });
  target.append(grid);
};

const createEmpty = (title: string, description: string) => {
  const empty = createElement('div', 'eda-empty');
  empty.append(createElement('strong', undefined, title), createElement('p', undefined, description));
  return empty;
};

export default async function renderEda(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type = 'olb',
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const normalizedType = type === 'dra' ? 'dra' : 'olb';
  const filename = context?.filename || `preview.${normalizedType}`;
  const root = createElement('section', 'eda-viewer');
  const style = createStyle();
  const cleanups: Array<() => void> = [];
  let selectedStream: EdaStreamView | null = null;
  let parsedResult: EdaParseResult | null = null;

  target.replaceChildren(style, root);

  const listen = <K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    event: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ) => {
    element.addEventListener(event, listener as EventListener);
    cleanups.push(() => element.removeEventListener(event, listener as EventListener));
  };

  const showLoading = () => {
    const state = createElement('div', 'eda-state');
    state.append(createElement('span'), createElement('strong', undefined, `正在解析 ${normalizedType.toUpperCase()}...`));
    root.append(state);
    return state;
  };

  const showError = (message: string) => {
    const error = createElement('div', 'eda-error');
    error.append(createElement('strong', undefined, 'EDA 预览提示'), createElement('p', undefined, message));
    root.append(error);
  };

  const renderParsed = (parsed: EdaParseResult) => {
    parsedResult = parsed;
    selectedStream = parsed.streams.find(stream => stream.properties.length)
      || parsed.streams.find(stream => stream.kind === 'text')
      || parsed.streams[0]
      || null;

    const statsCards = buildStatsCards(parsed);
    const treeRows = flattenTree(parsed.tree);
    const entityGroups = buildEntityGroups(parsed.entities);

    root.replaceChildren();

    const header = createElement('header', 'eda-header');
    const headerTitle = document.createElement('div');
    headerTitle.append(
      createElement('span', undefined, parsed.parser === 'cfb' ? 'CFB STRUCTURE VIEWER' : 'BINARY STRUCTURE VIEWER'),
      createElement('h2', undefined, filename)
    );
    const headerStats = document.createElement('dl');
    appendDefinition(headerStats, '格式', parsed.type.toUpperCase());
    appendDefinition(headerStats, '大小', formatBytes(parsed.byteLength));
    appendDefinition(headerStats, '条目', String(parsed.streamCount));
    appendDefinition(headerStats, '可信度', confidenceLabels[parsed.stats.confidence]);
    header.append(headerTitle, headerStats);

    const body = createElement('div', 'eda-body');
    const sidebar = createElement('aside', 'eda-sidebar');
    const summary = createElement('div', 'eda-summary');
    summary.append(
      createElement('strong', undefined, parsed.title),
      createElement('p', undefined, 'OLB / DRA 属于 OrCAD / Allegro 生态的私有设计数据。预览器优先解析 CFB 结构、对象候选、属性和可读文本，并在纯前端安全退化。')
    );
    sidebar.append(summary);
    appendStatGrid(sidebar, statsCards.slice(0, 4), 'eda-mini-grid');

    if (parsed.warnings.length) {
      const warning = createElement('div', 'eda-warning');
      parsed.warnings.forEach(item => warning.append(createElement('p', undefined, item)));
      sidebar.append(warning);
    }

    const search = createElement('input', 'eda-search') as HTMLInputElement;
    search.type = 'search';
    search.placeholder = '筛选路径、角色、属性或文本';
    sidebar.append(search);

    const streamList = createElement('div', 'eda-stream-list');
    const preview = createElement('main', 'eda-preview');
    let streamButtons: Array<{ path: string; button: HTMLButtonElement }> = [];

    const currentPanel = createElement('section', 'eda-panel');
    const selectedHead = createElement('div', 'eda-panel-head');
    const selectedTitle = createElement('span', undefined, '当前条目');
    const selectedPath = createElement('strong', undefined, '未选择');
    selectedHead.append(selectedTitle, selectedPath);
    const selectedMeta = createElement('div', 'eda-selected-meta');
    const selectedProperties = createElement('div', 'eda-property-grid');
    const selectedPreviewContainer = document.createElement('div');
    currentPanel.append(selectedHead, selectedMeta, selectedProperties, selectedPreviewContainer);

    const localStrings = createElement('div', 'eda-local-strings');

    const syncSelection = () => {
      streamButtons.forEach(({ path, button }) => {
        button.classList.toggle('active', normalizePath(path) === normalizePath(selectedStream?.path || ''));
      });
      selectedPath.textContent = selectedStream?.path || '未选择';
      selectedMeta.replaceChildren();
      selectedProperties.replaceChildren();
      selectedPreviewContainer.replaceChildren();
      localStrings.replaceChildren();

      if (!selectedStream) {
        selectedPreviewContainer.append(createEmpty('目录条目', '该节点用于组织下级流，没有可直接展示的文本或十六进制片段。'));
        return;
      }

      selectedMeta.append(
        createElement('span', undefined, roleLabel(selectedStream.role)),
        createElement('span', undefined, kindLabel(selectedStream.kind)),
        createElement('span', undefined, formatBytes(selectedStream.size))
      );

      selectedStream.properties.forEach(property => {
        const item = document.createElement('div');
        item.append(createElement('span', undefined, property.key), createElement('strong', undefined, property.value));
        selectedProperties.append(item);
      });

      const previewText = selectedStream.sample || selectedStream.hex || '';
      if (previewText) {
        selectedPreviewContainer.append(createElement('pre', undefined, previewText));
      } else {
        selectedPreviewContainer.append(createEmpty('目录条目', '该节点用于组织下级流，没有可直接展示的文本或十六进制片段。'));
      }

      if (selectedStream.strings.length) {
        localStrings.append(createElement('strong', undefined, '当前条目字符串'));
        selectedStream.strings.forEach(item => localStrings.append(createElement('span', undefined, item)));
      }
    };

    const selectStream = (stream: EdaStreamView) => {
      selectedStream = stream;
      syncSelection();
    };

    const selectTreeRow = (row: TreeRow) => {
      const rowPath = normalizePath(row.path);
      const stream = parsed.streams.find(item => normalizePath(item.path) === rowPath);
      if (stream) {
        selectStream(stream);
      }
    };

    const selectEntity = (entity: EdaEntity) => {
      const entityPath = normalizePath(entity.path);
      const stream = parsed.streams.find(item => {
        const streamPath = normalizePath(item.path);
        return streamPath === entityPath || streamPath.startsWith(`${entityPath}/`);
      });
      if (stream) {
        selectStream(stream);
      }
    };

    const matchesFilter = (stream: EdaStreamView, keyword: string) => {
      if (!keyword) {
        return true;
      }
      const propertyText = stream.properties.map(property => `${property.key}=${property.value}`).join('\n');
      const text = `${stream.path}\n${stream.name}\n${stream.kind}\n${stream.role}\n${stream.sample || ''}\n${stream.strings.join('\n')}\n${propertyText}`.toLowerCase();
      return text.includes(keyword);
    };

    const renderStreams = () => {
      const keyword = search.value.trim().toLowerCase();
      streamList.replaceChildren();
      streamButtons = [];
      parsed.streams.filter(stream => matchesFilter(stream, keyword)).forEach(stream => {
        const button = createElement('button', 'eda-stream') as HTMLButtonElement;
        button.type = 'button';
        const role = createElement('span', undefined, roleLabel(stream.role));
        role.dataset.role = stream.role;
        button.append(
          role,
          createElement('strong', undefined, stream.name || stream.path),
          createElement('em', undefined, stream.path),
          createElement('small', undefined, `${kindLabel(stream.kind)} · ${formatBytes(stream.size)}`)
        );
        listen(button, 'click', () => selectStream(stream));
        streamButtons.push({ path: stream.path, button });
        streamList.append(button);
      });
      syncSelection();
    };

    listen(search, 'input', renderStreams);
    sidebar.append(streamList);

    const overview = createElement('section', 'eda-panel eda-panel--compact');
    appendPanelHead(overview, '解析概览', `${parsed.parser.toUpperCase()} · ${formatBytes(parsed.totalStreamBytes)}`);
    appendStatGrid(overview, statsCards, 'eda-stat-grid');

    const topology = createElement('section', 'eda-topology');
    const treePanel = createElement('div', 'eda-panel');
    appendPanelHead(treePanel, '结构树', `${treeRows.length} 节点`);
    const tree = createElement('div', 'eda-tree');
    treeRows.forEach(row => {
      const button = createElement('button') as HTMLButtonElement;
      button.type = 'button';
      const twist = createElement('span', undefined, row.children.length ? '▸' : '•');
      twist.style.paddingLeft = `${row.depth * 14}px`;
      button.append(
        twist,
        createElement('strong', undefined, row.name),
        createElement('em', undefined, roleLabel(row.role)),
        createElement('small', undefined, row.size ? formatBytes(row.size) : kindLabel(row.kind))
      );
      listen(button, 'click', () => selectTreeRow(row));
      tree.append(button);
    });
    treePanel.append(tree);

    const entityPanel = createElement('div', 'eda-panel');
    appendPanelHead(entityPanel, 'EDA 对象', `${parsed.entities.length} 项`);
    if (entityGroups.length) {
      const entityRoot = createElement('div', 'eda-entities');
      entityGroups.forEach(group => {
        const groupRoot = createElement('div', 'eda-entity-group');
        groupRoot.append(createElement('h3', undefined, group.label));
        group.items.forEach(entity => {
          const button = createElement('button') as HTMLButtonElement;
          button.type = 'button';
          button.append(
            createElement('strong', undefined, entity.name),
            createElement('span', undefined, `${formatBytes(entity.byteLength)} · ${entity.streamCount} 条目`)
          );
          if (entity.description) {
            button.append(createElement('p', undefined, entity.description));
          }
          const detail = document.createElement('dl');
          const addDetail = (label: string, values: string | string[] | undefined) => {
            const normalized = Array.isArray(values) ? values.join(', ') : values;
            if (!normalized) {
              return;
            }
            appendDefinition(detail, label, normalized);
          };
          addDetail('Footprint', entity.footprint);
          addDetail('Pins', entity.pins);
          addDetail('Layers', entity.layers);
          addDetail('Keywords', entity.keywords);
          button.append(detail);
          listen(button, 'click', () => selectEntity(entity));
          groupRoot.append(button);
        });
        entityRoot.append(groupRoot);
      });
      entityPanel.append(entityRoot);
    } else {
      entityPanel.append(createEmpty('没有明确对象候选', '仍可从结构树、属性和字符串索引中查看可读内容。'));
    }
    topology.append(treePanel, entityPanel);

    const bottom = createElement('section', 'eda-bottom');
    const stringsPanel = createElement('div', 'eda-panel');
    appendPanelHead(stringsPanel, '可读字符串', `${parsed.strings.length} 项`);
    const stringGrid = createElement('div', 'eda-string-grid');
    parsed.strings.forEach(item => stringGrid.append(createElement('span', undefined, item)));
    stringsPanel.append(stringGrid);

    const diagnosticsPanel = createElement('div', 'eda-panel');
    appendPanelHead(diagnosticsPanel, '诊断', `${parsed.diagnostics.length} 条`);
    const diagnostics = createElement('div', 'eda-diagnostics');
    parsed.diagnostics.forEach(diagnostic => {
      const item = createElement('p');
      item.dataset.level = diagnostic.level;
      item.append(createElement('span', undefined, diagnostic.level), document.createTextNode(diagnostic.message));
      diagnostics.append(item);
    });
    diagnosticsPanel.append(diagnostics, localStrings);
    bottom.append(stringsPanel, diagnosticsPanel);

    preview.append(overview, topology, currentPanel, bottom);
    body.append(sidebar, preview);
    root.append(header, body);
    renderStreams();
  };

  const loading = showLoading();
  try {
    const parsed = await parseEdaFile(buffer, normalizedType);
    renderParsed(parsed);
  } catch (nextError) {
    console.error(nextError);
    root.replaceChildren();
    showError(nextError instanceof Error ? nextError.message : String(nextError));
  } finally {
    loading.remove();
  }

  return {
    $el: root,
    unmount() {
      cleanups.splice(0).forEach(cleanup => cleanup());
      parsedResult = null;
      selectedStream = null;
      target.replaceChildren();
    },
  };
}
