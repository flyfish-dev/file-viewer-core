import { resolveFileViewerDataSqlWasmUrl } from '../platform/assets';
import type {
  FileRenderContext,
  FileViewerRenderedInstance,
} from '../contracts/types';

declare global {
  interface Window {
    __FLYFISH_DATA_SQL_WASM_URL__?: string;
  }
}

interface DataPreview {
  title: string;
  summary: Array<{ label: string; value: string }>;
  rows?: Array<Record<string, unknown>>;
  text?: string;
  image?: string;
  fontFamily?: string;
}

const dataStyle = `
.data-viewer{min-height:100%;padding:28px;background:#eef1f4;color:#132235}
.data-card{max-width:1080px;margin:0 auto;overflow:hidden;border:1px solid rgba(15,23,42,.08);border-radius:8px;background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.12)}
.data-header{padding:20px 24px;border-bottom:1px solid rgba(15,23,42,.08)}
.data-header span{color:#0f766e;font-size:12px;font-weight:800}
.data-header h2{margin:6px 0 0;font-size:24px}
.data-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:rgba(15,23,42,.08)}
.data-summary div{min-width:0;padding:15px 18px;background:#f8fafc}
.data-summary span{display:block;color:#64748b;font-size:12px}
.data-summary strong{display:block;margin-top:5px;overflow:hidden;color:#132235;font-size:15px;text-overflow:ellipsis;white-space:nowrap}
.font-preview{padding:34px 28px;border-top:1px solid rgba(15,23,42,.08);font-size:42px;line-height:1.45;word-break:break-word}
.asset-image{padding:24px;border-top:1px solid rgba(15,23,42,.08);background:#f8fafc;text-align:center}
.asset-image img{max-width:100%;max-height:70vh;box-shadow:0 10px 30px rgba(15,23,42,.16)}
.asset-text{margin:0;padding:18px 24px;overflow:auto;border-top:1px solid rgba(15,23,42,.08);background:#111827;color:#e5e7eb;font-size:13px;line-height:1.7}
.data-table-wrap{max-height:520px;overflow:auto;border-top:1px solid rgba(15,23,42,.08)}
.data-table{width:100%;border-collapse:collapse;font-size:13px}
.data-table th,.data-table td{max-width:260px;padding:10px 12px;border-bottom:1px solid rgba(15,23,42,.08);overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}
.data-table th{position:sticky;top:0;background:#f8fafc;color:#64748b;z-index:1}
`;

const fontMimeMap: Record<string, string> = {
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const sampleText = 'Flyfish Viewer 轻量预览 AaBbCc 1234567890';

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = dataStyle;
  return style;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: K,
  className?: string,
  text?: string
) => {
  const element = documentRef.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const makeRows = (rows: Array<Record<string, unknown>>) => {
  return rows.slice(0, 30).map(row => {
    const next: Record<string, unknown> = {};
    Object.entries(row).slice(0, 24).forEach(([key, value]) => {
      if (typeof value === 'bigint') {
        next[key] = value.toString();
      } else if (value instanceof Uint8Array) {
        next[key] = `[bytes:${value.byteLength}]`;
      } else if (value && typeof value === 'object') {
        next[key] = JSON.stringify(value).slice(0, 180);
      } else {
        next[key] = value;
      }
    });
    return next;
  });
};

const extractReadableText = (buffer: ArrayBuffer, max = 8000) => {
  const bytes = new Uint8Array(buffer);
  const ascii = Array.from(bytes.slice(0, Math.min(bytes.length, max)))
    .map(byte => (byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9
      ? String.fromCharCode(byte)
      : ' ')
    .join('')
    .replace(/[ \t]{3,}/g, ' ');
  return ascii.trim().slice(0, max);
};

const readMagic = (buffer: ArrayBuffer, length = 12) => {
  return String.fromCharCode(...new Uint8Array(buffer.slice(0, length)));
};

const imageDataToUrl = (documentRef: Document, imageData: ImageData) => {
  const canvas = documentRef.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext('2d');
  context?.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const getWindowSqlWasmOverride = (documentRef: Document) => {
  return documentRef.defaultView?.__FLYFISH_DATA_SQL_WASM_URL__ ||
    (typeof window !== 'undefined' ? window.__FLYFISH_DATA_SQL_WASM_URL__ : undefined);
};

const renderFont = async (
  documentRef: Document,
  buffer: ArrayBuffer,
  type: string
): Promise<DataPreview> => {
  const family = `FlyfishPreviewFont-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownerWindow = documentRef.defaultView || (typeof window !== 'undefined' ? window : undefined);
  const FontFaceConstructor = ownerWindow?.FontFace || (typeof FontFace !== 'undefined' ? FontFace : undefined);
  if (!FontFaceConstructor) {
    throw new Error('当前浏览器不支持 FontFace API');
  }

  const face = new FontFaceConstructor(family, buffer);
  await face.load();
  documentRef.fonts?.add(face);
  return {
    title: '字体文件预览',
    fontFamily: family,
    summary: [
      { label: '格式', value: type.toUpperCase() },
      { label: '大小', value: formatBytes(buffer.byteLength) },
      { label: '渲染方式', value: 'Browser FontFace API' },
    ],
  };
};

const renderPsd = async (documentRef: Document, buffer: ArrayBuffer): Promise<DataPreview> => {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(buffer, { useImageData: true });
  const image = psd.imageData ? imageDataToUrl(documentRef, psd.imageData as ImageData) : undefined;
  return {
    title: 'PSD 图像结构预览',
    image,
    summary: [
      { label: '画布', value: `${psd.width || 0} x ${psd.height || 0}` },
      { label: '图层', value: String(psd.children?.length || 0) },
      { label: '渲染方式', value: 'ag-psd' },
    ],
    rows: makeRows((psd.children || []).map((layer: any) => ({
      name: layer.name || '-',
      left: layer.left,
      top: layer.top,
      right: layer.right,
      bottom: layer.bottom,
      hidden: Boolean(layer.hidden),
    }))),
  };
};

const renderSqlite = async (
  documentRef: Document,
  buffer: ArrayBuffer,
  context?: FileRenderContext
): Promise<DataPreview> => {
  const { default: initSqlJs } = await import('sql.js');
  const sqlWasmUrl = resolveFileViewerDataSqlWasmUrl(context?.options?.data, [
    getWindowSqlWasmOverride(documentRef),
  ], documentRef.baseURI);
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const db = new SQL.Database(new Uint8Array(buffer));
  try {
    const tableResult = db.exec("select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by type, name");
    const tables = tableResult[0]?.values || [];
    const firstTable = String(tables[0]?.[0] || '');
    const rows = firstTable
      ? db.exec(`select * from "${firstTable.replace(/"/g, '""')}" limit 30`)[0]
      : null;
    return {
      title: 'SQLite 数据库预览',
      summary: [
        { label: '对象数', value: String(tables.length) },
        { label: '示例表', value: firstTable || '-' },
        { label: '渲染方式', value: 'sql.js WASM' },
      ],
      rows: rows
        ? makeRows((rows.values as unknown[][]).map((values: unknown[]) => Object.fromEntries(
          rows.columns.map((column: string, index: number) => [column, values[index]])
        )))
        : makeRows((tables as unknown[][]).map((value: unknown[]) => ({ name: value[0], type: value[1] }))),
    };
  } finally {
    db.close();
  }
};

const renderParquet = async (buffer: ArrayBuffer): Promise<DataPreview> => {
  const { parquetMetadataAsync, parquetReadObjects } = await import('hyparquet');
  const file = {
    byteLength: buffer.byteLength,
    slice: (start: number, end?: number) => buffer.slice(start, end),
  };
  const metadata = await parquetMetadataAsync(file);
  const rows = await parquetReadObjects({ file, rowFormat: 'object', rowEnd: 30 });
  return {
    title: 'Parquet 列式数据预览',
    summary: [
      { label: '行数', value: metadata.num_rows?.toString?.() || '-' },
      { label: '列数', value: String(metadata.schema?.filter(item => item.name).length || 0) },
      { label: '渲染方式', value: 'hyparquet' },
    ],
    rows: makeRows(rows),
  };
};

const renderAvro = async (buffer: ArrayBuffer): Promise<DataPreview> => {
  const avro = await import('avsc/etc/browser/avsc.js');
  const decoder = (avro as any).createBlobDecoder(new Blob([buffer]));
  const rows: Array<Record<string, unknown>> = [];
  let schema = '';
  await new Promise<void>((resolve, reject) => {
    decoder.on('metadata', (type: any) => {
      schema = type?.toString?.() || '';
    });
    decoder.on('data', (value: Record<string, unknown>) => {
      if (rows.length < 30) {
        rows.push(value);
      }
    });
    decoder.on('end', resolve);
    decoder.on('error', reject);
  });
  return {
    title: 'Avro 对象容器预览',
    summary: [
      { label: '示例行', value: String(rows.length) },
      { label: 'Schema', value: schema ? '已读取' : '未读取' },
      { label: '渲染方式', value: 'avsc' },
    ],
    rows: makeRows(rows),
    text: schema.slice(0, 6000),
  };
};

const renderWasm = async (buffer: ArrayBuffer): Promise<DataPreview> => {
  const module = await WebAssembly.compile(buffer.slice(0));
  const imports = WebAssembly.Module.imports(module);
  const exports = WebAssembly.Module.exports(module);
  return {
    title: 'WebAssembly 模块预览',
    summary: [
      { label: '导入', value: String(imports.length) },
      { label: '导出', value: String(exports.length) },
      { label: '渲染方式', value: 'WebAssembly.Module' },
    ],
    rows: makeRows([
      ...imports.map(item => ({ kind: 'import', module: item.module, name: item.name, type: item.kind })),
      ...exports.map(item => ({ kind: 'export', module: '-', name: item.name, type: item.kind })),
    ]),
  };
};

const renderPostScriptLike = async (buffer: ArrayBuffer, type: string): Promise<DataPreview> => ({
  title: type === 'eps' ? 'EPS 矢量文件摘要' : 'Illustrator 文件摘要',
  summary: [
    { label: 'Magic', value: readMagic(buffer).replace(/\s/g, ' ') },
    { label: '大小', value: formatBytes(buffer.byteLength) },
    { label: '说明', value: type === 'ai' ? '非 PDF-compatible AI 按摘要展示' : 'PostScript 摘要展示' },
  ],
  text: extractReadableText(buffer),
});

const renderWebArchive = async (buffer: ArrayBuffer): Promise<DataPreview> => ({
  title: 'WebArchive 摘要预览',
  summary: [
    { label: '容器', value: readMagic(buffer).startsWith('bplist') ? 'Binary plist' : 'WebArchive' },
    { label: '大小', value: formatBytes(buffer.byteLength) },
    { label: '说明', value: '安全提取可读片段，不执行网页脚本' },
  ],
  text: extractReadableText(buffer),
});

const buildPreview = async (
  documentRef: Document,
  buffer: ArrayBuffer,
  type: string,
  context?: FileRenderContext
): Promise<DataPreview> => {
  if (type in fontMimeMap) {
    return renderFont(documentRef, buffer, type);
  }
  if (type === 'psd') {
    return renderPsd(documentRef, buffer);
  }
  if (type === 'sqlite') {
    return renderSqlite(documentRef, buffer, context);
  }
  if (type === 'parquet') {
    return renderParquet(buffer);
  }
  if (type === 'avro') {
    return renderAvro(buffer);
  }
  if (type === 'wasm') {
    return renderWasm(buffer);
  }
  if (type === 'ai' || type === 'eps') {
    return renderPostScriptLike(buffer, type);
  }
  if (type === 'webarchive') {
    return renderWebArchive(buffer);
  }
  return {
    title: '数据资产摘要',
    summary: [
      { label: '格式', value: type.toUpperCase() },
      { label: '大小', value: formatBytes(buffer.byteLength) },
    ],
    text: extractReadableText(buffer),
  };
};

const appendSummary = (
  documentRef: Document,
  parent: HTMLElement,
  summary: DataPreview['summary']
) => {
  const summaryRoot = createElement(documentRef, 'div', 'data-summary');
  summary.forEach(item => {
    const cell = createElement(documentRef, 'div');
    cell.append(
      createElement(documentRef, 'span', undefined, item.label),
      createElement(documentRef, 'strong', undefined, item.value)
    );
    summaryRoot.appendChild(cell);
  });
  parent.appendChild(summaryRoot);
};

const appendRows = (
  documentRef: Document,
  parent: HTMLElement,
  rows: Array<Record<string, unknown>> | undefined
) => {
  if (!rows?.length) {
    return;
  }

  const keys = Object.keys(rows[0]);
  const wrap = createElement(documentRef, 'div', 'data-table-wrap');
  const table = createElement(documentRef, 'table', 'data-table');
  const thead = createElement(documentRef, 'thead');
  const headRow = createElement(documentRef, 'tr');
  keys.forEach(key => {
    headRow.appendChild(createElement(documentRef, 'th', undefined, key));
  });
  thead.appendChild(headRow);

  const tbody = createElement(documentRef, 'tbody');
  rows.forEach(row => {
    const tr = createElement(documentRef, 'tr');
    keys.forEach(key => {
      tr.appendChild(createElement(documentRef, 'td', undefined, String(row[key] ?? '')));
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  wrap.appendChild(table);
  parent.appendChild(wrap);
};

const renderPreviewDom = (
  documentRef: Document,
  preview: DataPreview,
  type: string
) => {
  const root = createElement(documentRef, 'div', 'data-viewer');
  const card = createElement(documentRef, 'section', 'data-card');
  const header = createElement(documentRef, 'header', 'data-header');
  header.append(
    createElement(documentRef, 'span', undefined, type.toUpperCase()),
    createElement(documentRef, 'h2', undefined, preview.title)
  );
  card.appendChild(header);
  appendSummary(documentRef, card, preview.summary);

  if (preview.fontFamily) {
    const fontPreview = createElement(documentRef, 'div', 'font-preview', sampleText);
    fontPreview.style.fontFamily = preview.fontFamily;
    card.appendChild(fontPreview);
  }

  if (preview.image) {
    const imageWrap = createElement(documentRef, 'div', 'asset-image');
    const image = createElement(documentRef, 'img') as HTMLImageElement;
    image.src = preview.image;
    image.alt = '资产预览';
    imageWrap.appendChild(image);
    card.appendChild(imageWrap);
  }

  if (preview.text) {
    card.appendChild(createElement(documentRef, 'pre', 'asset-text', preview.text));
  }

  appendRows(documentRef, card, preview.rows);
  root.appendChild(card);
  return root;
};

export default async function renderDataAsset(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type = 'bin',
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const documentRef = target.ownerDocument || document;
  const normalizedType = type.toLowerCase();

  if (normalizedType === 'ai' && readMagic(buffer, 5) === '%PDF-' && context?.renderNestedBuffer) {
    const rendered = await context.renderNestedBuffer(buffer, 'pdf', target, context);
    if (rendered) {
      return rendered;
    }
  }

  const preview = await buildPreview(documentRef, buffer, normalizedType, context);
  const root = renderPreviewDom(documentRef, preview, normalizedType);
  target.replaceChildren(createStyle(documentRef), root);

  return {
    $el: root,
    unmount() {
      target.replaceChildren();
    },
  };
}
