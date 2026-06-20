import JSZip from 'jszip';
import type { FileViewerRenderedInstance } from '../contracts/types';

interface OpenDocumentPage {
  title: string;
  blocks: string[];
}

const openDocumentStyle = `
.odf-viewer{min-height:100%;padding:28px;overflow:auto;background:#dfe5eb;box-sizing:border-box}
.odf-shell{width:min(100%,980px);margin:0 auto}.odf-shell>header{margin-bottom:18px;padding:18px 22px;border-radius:8px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.1);box-sizing:border-box}
.odf-shell>header span{color:#0f766e;font-size:12px;font-weight:800}.odf-shell>header h2{margin:6px 0 0;color:#132235;font-size:24px}
.odf-page{min-height:360px;margin:0 auto 18px;padding:42px 48px;border-radius:4px;background:#fff;box-shadow:0 16px 38px rgba(15,23,42,.12);color:#1f2937;box-sizing:border-box}
.odf-page h3{margin:0 0 20px;color:#334155;font-size:18px}.odf-page p{margin:0 0 12px;font-size:15px;line-height:1.85;white-space:pre-wrap}
.flyfish-rtf-viewer{min-height:100%;padding:28px;overflow:auto;background:#dfe5eb;color:#1f2937;box-sizing:border-box}
.flyfish-rtf-header{width:min(100%,900px);margin:0 auto 18px;padding:18px 22px;border-radius:8px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.1);box-sizing:border-box}
.flyfish-rtf-header span{display:block;color:#0f766e;font-size:12px;font-weight:800}.flyfish-rtf-header strong{display:block;margin-top:6px;color:#132235;font-size:24px}
.flyfish-rtf-paper{width:min(100%,900px);min-height:980px;margin:0 auto;padding:54px 62px;background:#fff;box-shadow:0 16px 38px rgba(15,23,42,.12);line-height:1.75;box-sizing:border-box}.flyfish-rtf-paper p{margin:0 0 12px}
.file-viewer[data-viewer-theme='dark'] .odf-viewer,.file-viewer[data-viewer-theme='dark'] .flyfish-rtf-viewer{background:#111827}.file-viewer[data-viewer-theme='dark'] .odf-shell>header,.file-viewer[data-viewer-theme='dark'] .odf-page,.file-viewer[data-viewer-theme='dark'] .flyfish-rtf-header,.file-viewer[data-viewer-theme='dark'] .flyfish-rtf-paper{background:#f8fafc;color:#1f2937}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .odf-viewer,.file-viewer[data-viewer-theme='system'] .flyfish-rtf-viewer{background:#111827}.file-viewer[data-viewer-theme='system'] .odf-shell>header,.file-viewer[data-viewer-theme='system'] .odf-page,.file-viewer[data-viewer-theme='system'] .flyfish-rtf-header,.file-viewer[data-viewer-theme='system'] .flyfish-rtf-paper{background:#f8fafc;color:#1f2937}}
@media (max-width:720px){.odf-viewer,.flyfish-rtf-viewer{padding:14px}.odf-page{padding:28px 24px}.flyfish-rtf-paper{padding:36px 28px}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = openDocumentStyle;
  return style;
};

const appendText = (parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, className?: string) => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  parent.appendChild(element);
  return element;
};

const nodeText = (node: Element) => {
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
};

const parseOdf = async (buffer: ArrayBuffer, type: string): Promise<OpenDocumentPage[]> => {
  const zip = await JSZip.loadAsync(buffer);
  const content = await zip.file('content.xml')?.async('text');
  if (!content) {
    throw new Error('ODF 文件缺少 content.xml');
  }
  const doc = new DOMParser().parseFromString(content, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(parseError.textContent || 'ODF XML 解析失败');
  }
  if (type === 'odp') {
    const slides = Array.from(doc.getElementsByTagName('draw:page'));
    return slides.map((slide, index) => {
      const blocks = Array.from(slide.getElementsByTagName('text:p'))
        .map(nodeText)
        .filter(Boolean);
      return { title: `第 ${index + 1} 页`, blocks: blocks.length ? blocks : ['该页没有可提取文本'] };
    });
  }
  const blocks = [
    ...Array.from(doc.getElementsByTagName('text:h')).map(nodeText),
    ...Array.from(doc.getElementsByTagName('text:p')).map(nodeText),
  ].filter(Boolean);
  return [{ title: '正文', blocks: blocks.length ? blocks : ['没有提取到可读文本'] }];
};

const renderOdfPages = (type: string, title: string, pages: OpenDocumentPage[]) => {
  const root = document.createElement('div');
  root.className = 'odf-viewer';
  const shell = document.createElement('section');
  shell.className = 'odf-shell';
  const header = document.createElement('header');
  appendText(header, 'span', type.toUpperCase());
  appendText(header, 'h2', title);
  shell.appendChild(header);

  pages.forEach(page => {
    const article = document.createElement('article');
    article.className = 'odf-page';
    appendText(article, 'h3', page.title);
    page.blocks.forEach(block => appendText(article, 'p', block));
    shell.appendChild(article);
  });

  root.appendChild(shell);
  return root;
};

const resolveRtfJs = async () => {
  const rtfModule = await import('rtf.js/dist/RTFJS.bundle.js');
  return rtfModule.RTFJS || rtfModule.default || rtfModule;
};

const renderRtf = async (buffer: ArrayBuffer, target: HTMLDivElement): Promise<FileViewerRenderedInstance> => {
  const RTFJS = await resolveRtfJs();
  RTFJS.loggingEnabled?.(false);
  const doc = new RTFJS.Document(buffer, {});
  const meta = doc.metadata?.() || {};
  const elements = await doc.render();

  const stage = document.createElement('div');
  stage.className = 'flyfish-rtf-viewer';
  const header = document.createElement('div');
  header.className = 'flyfish-rtf-header';
  appendText(header, 'span', 'RTF');
  appendText(header, 'strong', meta.title || 'RTF 文档预览');
  const paper = document.createElement('article');
  paper.className = 'flyfish-rtf-paper';
  elements.forEach((element: HTMLElement) => paper.appendChild(element));
  stage.append(header, paper);
  target.replaceChildren(createStyle(), stage);

  return {
    $el: target,
    unmount() {
      target.replaceChildren();
    },
  };
};

export default async function renderOpenDocument(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> {
  const normalizedType = (type || 'odt').toLowerCase();
  if (normalizedType === 'rtf') {
    return renderRtf(buffer, target);
  }
  const pages = await parseOdf(buffer, normalizedType);
  const title = normalizedType === 'odp' ? 'OpenDocument 演示文稿预览' : 'OpenDocument 文档预览';
  target.replaceChildren(createStyle(), renderOdfPages(normalizedType, title, pages));

  return {
    $el: target,
    unmount() {
      target.replaceChildren();
    },
  };
}
