import type {
  FileViewerRenderedInstance,
} from '../contracts/types';
import {
  parseUmdBook,
  type UmdBook,
  type UmdChapter,
  type UmdImage,
} from './umd/parser';

const umdStyle = `
.umd-viewer{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;background:#eef1f4;color:#172033;box-sizing:border-box}
.umd-toolbar{flex-shrink:0;display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.94);box-sizing:border-box}
.umd-title{min-width:0;display:flex;flex-direction:column;gap:3px}
.umd-title strong,.umd-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.umd-title strong{font-size:14px}.umd-title span{color:#64748b;font-size:12px}
.umd-icon-button,.umd-button{height:36px;border:1px solid rgba(15,23,42,.08);background:#fff;color:#172033;font:inherit;cursor:pointer}
.umd-icon-button{width:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px}
.umd-icon-button span,.umd-icon-button span::before,.umd-icon-button span::after{width:16px;height:2px;display:block;border-radius:999px;background:currentColor}
.umd-icon-button span{position:relative}.umd-icon-button span::before,.umd-icon-button span::after{content:'';position:absolute;left:0}.umd-icon-button span::before{top:-5px}.umd-icon-button span::after{top:5px}
.umd-icon-button.active{border-color:rgba(2,132,199,.24);background:rgba(2,132,199,.08);color:#0369a1}
.umd-actions{display:flex;align-items:center;gap:8px}.umd-button{min-width:68px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:700}.umd-button:disabled{color:#94a3b8;cursor:not-allowed}
.umd-progress{min-width:58px;color:#64748b;font-size:12px;text-align:center}
.umd-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr)}
.umd-viewer--toc-hidden .umd-body{grid-template-columns:minmax(0,1fr)}
.umd-toc{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid rgba(15,23,42,.08);background:rgba(255,255,255,.82)}
.umd-viewer--toc-hidden .umd-toc{display:none}
.umd-toc-head{flex-shrink:0;display:flex;justify-content:space-between;gap:8px;padding:12px;color:#172033;font-size:13px}.umd-toc-head span{color:#64748b}
.umd-toc-list{flex:1;min-height:0;overflow:auto;padding:0 8px 10px}
.umd-toc-item{width:100%;min-height:34px;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:#475569;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.umd-toc-item:hover,.umd-toc-item.active{background:rgba(2,132,199,.08);color:#0369a1}
.umd-stage-wrap{position:relative;min-width:0;min-height:0;padding:18px;overflow:hidden;box-sizing:border-box}
.umd-stage{width:100%;height:100%;overflow:auto;border-radius:8px;background:#fffef8;box-shadow:0 18px 45px rgba(15,23,42,.12),inset 0 0 0 1px rgba(15,23,42,.06);box-sizing:border-box}
.umd-book-head{display:flex;gap:20px;max-width:820px;margin:0 auto;padding:32px 34px 8px;box-sizing:border-box}.umd-book-head img{width:96px;max-height:136px;object-fit:cover;border-radius:6px;box-shadow:0 12px 26px rgba(15,23,42,.16)}.umd-book-head div{min-width:0}
.umd-book-head h1{margin:0;color:#111827;font-size:24px;line-height:1.3}.umd-book-head p{margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.6}
.umd-chapter{max-width:820px;margin:0 auto;padding:28px 34px 56px;box-sizing:border-box}.umd-chapter h2{margin:0 0 22px;color:#111827;font-size:22px;line-height:1.35}
.umd-text{color:#1f2937;font-family:Georgia,'Times New Roman','Songti SC',SimSun,serif;font-size:17px;line-height:1.86;white-space:pre-wrap;word-break:break-word}
.umd-image-list{display:grid;gap:18px}.umd-image-list figure{margin:0;text-align:center}.umd-image-list img{max-width:100%;height:auto;border-radius:6px;box-shadow:0 10px 24px rgba(15,23,42,.12)}
.umd-empty,.umd-warning{color:#64748b;font-size:14px;line-height:1.7}.umd-warning{max-width:820px;margin:-28px auto 36px;padding:0 34px;color:#b45309;box-sizing:border-box}
.umd-state{position:absolute;inset:18px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.92);color:#64748b;font-size:14px}.umd-state[hidden]{display:none!important}.umd-state.error{color:#b42318}
.file-viewer[data-viewer-theme='dark'] .umd-viewer{background:#101820;color:#e5edf6}.file-viewer[data-viewer-theme='dark'] .umd-toolbar,.file-viewer[data-viewer-theme='dark'] .umd-toc{background:rgba(15,23,42,.92);border-color:rgba(148,163,184,.18)}
.file-viewer[data-viewer-theme='dark'] .umd-stage{background:#111827;box-shadow:0 18px 45px rgba(0,0,0,.35),inset 0 0 0 1px rgba(148,163,184,.16)}
.file-viewer[data-viewer-theme='dark'] .umd-book-head h1,.file-viewer[data-viewer-theme='dark'] .umd-chapter h2,.file-viewer[data-viewer-theme='dark'] .umd-text,.file-viewer[data-viewer-theme='dark'] .umd-toc-head{color:#e5edf6}
.file-viewer[data-viewer-theme='dark'] .umd-title span,.file-viewer[data-viewer-theme='dark'] .umd-book-head p,.file-viewer[data-viewer-theme='dark'] .umd-toc-head span,.file-viewer[data-viewer-theme='dark'] .umd-progress{color:#94a3b8}
.file-viewer[data-viewer-theme='dark'] .umd-button,.file-viewer[data-viewer-theme='dark'] .umd-icon-button{background:#172033;color:#e5edf6;border-color:rgba(148,163,184,.18)}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .umd-viewer{background:#101820;color:#e5edf6}.file-viewer[data-viewer-theme='system'] .umd-toolbar,.file-viewer[data-viewer-theme='system'] .umd-toc{background:rgba(15,23,42,.92);border-color:rgba(148,163,184,.18)}.file-viewer[data-viewer-theme='system'] .umd-stage{background:#111827;box-shadow:0 18px 45px rgba(0,0,0,.35),inset 0 0 0 1px rgba(148,163,184,.16)}.file-viewer[data-viewer-theme='system'] .umd-book-head h1,.file-viewer[data-viewer-theme='system'] .umd-chapter h2,.file-viewer[data-viewer-theme='system'] .umd-text,.file-viewer[data-viewer-theme='system'] .umd-toc-head{color:#e5edf6}.file-viewer[data-viewer-theme='system'] .umd-title span,.file-viewer[data-viewer-theme='system'] .umd-book-head p,.file-viewer[data-viewer-theme='system'] .umd-toc-head span,.file-viewer[data-viewer-theme='system'] .umd-progress{color:#94a3b8}.file-viewer[data-viewer-theme='system'] .umd-button,.file-viewer[data-viewer-theme='system'] .umd-icon-button{background:#172033;color:#e5edf6;border-color:rgba(148,163,184,.18)}}
@media (max-width:720px){.umd-toolbar{grid-template-columns:40px minmax(0,1fr)}.umd-actions{grid-column:1/-1;justify-content:space-between}.umd-body{position:relative;grid-template-columns:minmax(0,1fr)}.umd-toc{position:absolute;z-index:5;top:0;bottom:0;left:0;width:min(82vw,280px);box-shadow:18px 0 40px rgba(15,23,42,.16)}.umd-stage-wrap{padding:12px}.umd-book-head{padding:24px 20px 0}.umd-chapter{padding:24px 20px 42px}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = umdStyle;
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

const createButton = (label: string, className: string) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
};

const buildMetaLine = (book: UmdBook | null, chapter?: UmdChapter) => {
  if (!book) {
    return chapter?.title || '阅读中';
  }
  return [
    book.author,
    book.category,
    book.publishedAt,
  ].filter(Boolean).join(' / ') || chapter?.title || '阅读中';
};

const copyImageBytes = (image: UmdImage) => {
  const copy = new Uint8Array(image.bytes.byteLength);
  copy.set(image.bytes);
  return copy;
};

export default async function renderUmd(
  buffer: ArrayBuffer,
  target: HTMLDivElement
): Promise<FileViewerRenderedInstance> {
  const objectUrls = new Map<string, string>();
  let book: UmdBook | null = null;
  let activeIndex = 0;
  let tocOpen = true;
  let disposed = false;

  const style = createStyle();
  const root = document.createElement('div');
  root.className = 'umd-viewer';

  const toolbar = document.createElement('div');
  toolbar.className = 'umd-toolbar';

  const tocButton = document.createElement('button');
  tocButton.type = 'button';
  tocButton.className = 'umd-icon-button active';
  tocButton.title = '目录';
  tocButton.appendChild(document.createElement('span'));

  const title = document.createElement('div');
  title.className = 'umd-title';
  const titleText = appendText(title, 'strong', 'UMD 电子书');
  const metaText = appendText(title, 'span', '阅读中');

  const actions = document.createElement('div');
  actions.className = 'umd-actions';
  const prevButton = createButton('上一章', 'umd-button');
  const progress = document.createElement('span');
  progress.className = 'umd-progress';
  progress.textContent = '0/0';
  const nextButton = createButton('下一章', 'umd-button');
  actions.append(prevButton, progress, nextButton);
  toolbar.append(tocButton, title, actions);

  const body = document.createElement('div');
  body.className = 'umd-body';
  const toc = document.createElement('aside');
  toc.className = 'umd-toc';
  const tocHead = document.createElement('div');
  tocHead.className = 'umd-toc-head';
  appendText(tocHead, 'strong', '目录');
  const tocCount = appendText(tocHead, 'span', '0 项');
  const tocList = document.createElement('div');
  tocList.className = 'umd-toc-list';
  toc.append(tocHead, tocList);

  const stageWrap = document.createElement('main');
  stageWrap.className = 'umd-stage-wrap';
  const stage = document.createElement('article');
  stage.className = 'umd-stage';
  const state = document.createElement('div');
  state.className = 'umd-state';
  state.textContent = '正在解析 UMD...';
  stageWrap.append(stage, state);
  body.append(toc, stageWrap);
  root.append(toolbar, body);
  target.replaceChildren(style, root);

  const revokeImageUrls = () => {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();
  };

  const getImageUrl = (image?: UmdImage) => {
    if (!image) {
      return '';
    }
    const existing = objectUrls.get(image.id);
    if (existing) {
      return existing;
    }
    const url = URL.createObjectURL(new Blob([copyImageBytes(image)], { type: image.mimeType }));
    objectUrls.set(image.id, url);
    return url;
  };

  const getCurrentChapter = () => book?.chapters[activeIndex];

  const updateChrome = () => {
    const chapter = getCurrentChapter();
    const total = book?.chapters.length || 0;
    titleText.textContent = book?.title || 'UMD 电子书';
    metaText.textContent = buildMetaLine(book, chapter);
    progress.textContent = total ? `${activeIndex + 1}/${total}` : '0/0';
    prevButton.disabled = !book || activeIndex <= 0;
    nextButton.disabled = !book || !total || activeIndex >= total - 1;
    tocButton.classList.toggle('active', tocOpen);
    root.classList.toggle('umd-viewer--toc-hidden', !tocOpen);
    tocCount.textContent = `${total} 项`;
  };

  const scrollToTop = () => {
    stage.scrollTo({ top: 0 });
  };

  const renderToc = () => {
    tocList.replaceChildren();
    book?.chapters.forEach((chapter, index) => {
      const item = createButton(chapter.title, 'umd-toc-item');
      item.classList.toggle('active', index === activeIndex);
      item.addEventListener('click', () => {
        activeIndex = index;
        tocOpen = false;
        renderReady();
        scrollToTop();
      });
      tocList.appendChild(item);
    });
  };

  const renderBookHead = (host: HTMLElement) => {
    if (!book) {
      return;
    }
    const coverUrl = getImageUrl(book.cover);
    const metaLine = buildMetaLine(book);
    if (!coverUrl && !metaLine) {
      return;
    }
    const head = document.createElement('header');
    head.className = 'umd-book-head';
    if (coverUrl) {
      const image = document.createElement('img');
      image.src = coverUrl;
      image.alt = book.title;
      head.appendChild(image);
    }
    const info = document.createElement('div');
    appendText(info, 'h1', book.title);
    if (metaLine) {
      appendText(info, 'p', metaLine);
    }
    const publisher = [book.publisher, book.vendor].filter(Boolean).join(' / ');
    if (publisher) {
      appendText(info, 'p', publisher);
    }
    head.appendChild(info);
    host.appendChild(head);
  };

  const renderChapter = (chapter: UmdChapter) => {
    const section = document.createElement('section');
    section.className = 'umd-chapter';
    section.dataset.viewerAnchorId = chapter.id;
    appendText(section, 'h2', chapter.title);

    if (chapter.images.length) {
      const images = document.createElement('div');
      images.className = 'umd-image-list';
      chapter.images.forEach(image => {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = getImageUrl(image);
        img.alt = chapter.title;
        figure.appendChild(img);
        images.appendChild(figure);
      });
      section.appendChild(images);
    }

    if (chapter.content) {
      appendText(section, 'div', chapter.content, 'umd-text');
    } else if (!chapter.images.length) {
      appendText(section, 'div', '未解析到正文内容', 'umd-empty');
    }

    return section;
  };

  const renderReady = () => {
    updateChrome();
    renderToc();
    state.hidden = true;
    stage.replaceChildren();

    renderBookHead(stage);
    const chapter = getCurrentChapter();
    if (chapter) {
      stage.appendChild(renderChapter(chapter));
    }

    const warningText = book?.warnings.filter(Boolean).join('；') || '';
    if (warningText) {
      appendText(stage, 'div', warningText, 'umd-warning');
    }
  };

  const renderError = (message: string) => {
    updateChrome();
    state.hidden = false;
    state.classList.add('error');
    state.textContent = message;
  };

  const toggleToc = () => {
    tocOpen = !tocOpen;
    updateChrome();
  };
  const goPrev = () => {
    if (!book || activeIndex <= 0) {
      return;
    }
    activeIndex -= 1;
    renderReady();
    scrollToTop();
  };
  const goNext = () => {
    const total = book?.chapters.length || 0;
    if (!book || activeIndex >= total - 1) {
      return;
    }
    activeIndex += 1;
    renderReady();
    scrollToTop();
  };

  tocButton.addEventListener('click', toggleToc);
  prevButton.addEventListener('click', goPrev);
  nextButton.addEventListener('click', goNext);

  try {
    book = parseUmdBook(buffer.slice(0));
    if (!disposed) {
      activeIndex = 0;
      renderReady();
    }
  } catch (error) {
    if (!disposed) {
      console.error(error);
      renderError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    $el: target,
    unmount() {
      disposed = true;
      tocButton.removeEventListener('click', toggleToc);
      prevButton.removeEventListener('click', goPrev);
      nextButton.removeEventListener('click', goNext);
      revokeImageUrls();
      target.replaceChildren();
    },
  };
}
