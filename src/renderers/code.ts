import { createFileViewerZoomChangeEmitter as createZoomChangeEmitter } from '../features/document/zoom'
import { readFileViewerText as readText } from '../source'
import type {
  FileViewerRenderedInstance,
  FileViewerZoomState
} from '../contracts/types'
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider
} from '../features/document/dom'
import type { HLJSApi, LanguageFn } from 'highlight.js'

const languageMap: Record<string, string> = {
  bash: 'bash',
  c: 'cpp',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  diff: 'diff',
  gv: 'plaintext',
  go: 'go',
  h: 'cpp',
  hcl: 'plaintext',
  hpp: 'cpp',
  html: 'xml',
  htm: 'xml',
  http: 'http',
  ini: 'ini',
  ipynb: 'json',
  java: 'java',
  js: 'javascript',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  log: 'plaintext',
  md: 'markdown',
  markdown: 'markdown',
  mjs: 'javascript',
  php: 'php',
  proto: 'protobuf',
  py: 'python',
  rb: 'ruby',
  react: 'javascript',
  rs: 'rust',
  sh: 'bash',
  sql: 'sql',
  swift: 'swift',
  tex: 'latex',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  vue: 'xml',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml'
}

const languageLoaders: Record<string, () => Promise<{ default: LanguageFn }>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  go: () => import('highlight.js/lib/languages/go'),
  http: () => import('highlight.js/lib/languages/http'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  latex: () => import('highlight.js/lib/languages/latex'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  php: () => import('highlight.js/lib/languages/php'),
  protobuf: () => import('highlight.js/lib/languages/protobuf'),
  python: () => import('highlight.js/lib/languages/python'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml')
}

const codeStyle = `
.code-viewer{min-height:100%;--code-bg:#f6f8fa;--code-toolbar-bg:rgba(255,255,255,.92);--code-border:rgba(31,35,40,.12);--code-text:#24292f;--code-muted:#57606a;--code-keyword:#cf222e;--code-title:#8250df;--code-string:#0a3069;--code-number:#0550ae;--code-comment:#6e7781;--code-attr:#953800;--code-built-in:#116329;background:var(--code-bg);color:var(--code-text);box-sizing:border-box}
.code-toolbar{position:sticky;top:0;z-index:1;display:flex;height:42px;align-items:center;justify-content:space-between;gap:16px;padding:0 16px;border-bottom:1px solid var(--code-border);background:var(--code-toolbar-bg);backdrop-filter:blur(12px);box-sizing:border-box}
.code-toolbar span,.code-toolbar strong{color:var(--code-muted);font-size:12px;font-weight:700;letter-spacing:0}
.code-area{display:block;min-width:min-content;margin:0;padding:18px 20px 28px;overflow:auto;background:transparent;box-sizing:border-box}
.code-area code{display:block;padding:0;overflow:visible;background:transparent;color:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:var(--code-font-size,13px);line-height:1.7;tab-size:2;white-space:pre}
.code-area .hljs-comment,.code-area .hljs-quote{color:var(--code-comment)}
.code-area .hljs-keyword,.code-area .hljs-selector-tag,.code-area .hljs-subst{color:var(--code-keyword)}
.code-area .hljs-string,.code-area .hljs-doctag,.code-area .hljs-regexp{color:var(--code-string)}
.code-area .hljs-title,.code-area .hljs-section,.code-area .hljs-selector-id{color:var(--code-title);font-weight:700}
.code-area .hljs-number,.code-area .hljs-literal,.code-area .hljs-variable,.code-area .hljs-template-variable{color:var(--code-number)}
.code-area .hljs-attr,.code-area .hljs-attribute,.code-area .hljs-name,.code-area .hljs-selector-class{color:var(--code-attr)}
.code-area .hljs-built_in,.code-area .hljs-type,.code-area .hljs-class .hljs-title{color:var(--code-built-in)}
.file-viewer[data-viewer-theme='dark'] .code-viewer{--code-bg:#0d1117;--code-toolbar-bg:rgba(13,17,23,.92);--code-border:rgba(139,148,158,.24);--code-text:#e6edf3;--code-muted:#8b949e;--code-keyword:#ff7b72;--code-title:#d2a8ff;--code-string:#a5d6ff;--code-number:#79c0ff;--code-comment:#8b949e;--code-attr:#ffa657;--code-built-in:#7ee787}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .code-viewer{--code-bg:#0d1117;--code-toolbar-bg:rgba(13,17,23,.92);--code-border:rgba(139,148,158,.24);--code-text:#e6edf3;--code-muted:#8b949e;--code-keyword:#ff7b72;--code-title:#d2a8ff;--code-string:#a5d6ff;--code-number:#79c0ff;--code-comment:#8b949e;--code-attr:#ffa657;--code-built-in:#7ee787}}
`

let highlighterPromise: Promise<HLJSApi> | null = null
const registeredLanguages = new Set<string>()

const createElement = <TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  className?: string,
  text?: string
) => {
  const element = document.createElement(tagName)
  if (className) {
    element.className = className
  }
  if (typeof text === 'string') {
    element.textContent = text
  }
  return element
}

const createStyle = () => {
  const style = document.createElement('style')
  style.textContent = codeStyle
  return style
}

const resolveLanguage = (type: string) => {
  return languageMap[type.trim().toLowerCase()] || 'plaintext'
}

const escapeHtml = (value: string) => {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[char]
  })
}

const loadHighlighter = async () => {
  if (!highlighterPromise) {
    highlighterPromise = import('highlight.js/lib/core').then(module => module.default)
  }
  return highlighterPromise
}

const registerLanguageOnce = async (hljs: HLJSApi, name: string) => {
  if (registeredLanguages.has(name)) {
    return true
  }
  const loader = languageLoaders[name]
  if (!loader) {
    return false
  }
  const { default: language } = await loader()
  hljs.registerLanguage(name, language)
  registeredLanguages.add(name)
  return true
}

const clampZoom = (value: number) => {
  return Math.min(2.6, Math.max(0.6, Number(value.toFixed(2))))
}

const lineCountOf = (value: string) => {
  return value.split(/\r\n|\r|\n/).length
}

/**
 * Framework-neutral text/code renderer.
 *
 * highlight.js core and language definitions are loaded lazily by format. HTML
 * and XML are highlighted as escaped source text, never executed as real DOM.
 * @param buffer 文本二进制内容
 * @param target 目标
 * @param type 文件扩展名，用于选择 highlight.js 语言
 */
export default async function renderText(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> {
  const text = await readText(buffer)
  const extension = type || 'txt'
  const language = resolveLanguage(extension)
  let disposed = false
  let zoom = 1
  const zoomEmitter = createZoomChangeEmitter()
  const root = createElement('div', 'code-viewer')
  root.dataset.viewerZoomProvider = 'code'
  const toolbar = createElement('div', 'code-toolbar')
  toolbar.append(
    createElement('span', '', extension.toUpperCase()),
    createElement('strong', '', `${lineCountOf(text)} lines`)
  )

  const pre = createElement('pre', 'code-area')
  const code = createElement('code', `hljs language-${language}`)
  code.innerHTML = language === 'plaintext'
    ? escapeHtml(text)
    : '正在加载高亮...'
  pre.append(code)
  root.append(toolbar, pre)
  root.style.setProperty('--code-font-size', `${13 * zoom}px`)
  target.replaceChildren(createStyle(), root)

  const updateHighlighted = async () => {
    if (language === 'plaintext') {
      return
    }
    try {
      const hljs = await loadHighlighter()
      const hasLanguage = await registerLanguageOnce(hljs, language)
      if (disposed) {
        return
      }
      code.innerHTML = hasLanguage
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : escapeHtml(text)
    } catch {
      if (!disposed) {
        code.innerHTML = escapeHtml(text)
      }
    }
  }

  void updateHighlighted()

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < 2.6,
    canZoomOut: zoom > 0.6,
    canReset: zoom !== 1,
    minScale: 0.6,
    maxScale: 2.6
  })

  const setZoom = (scale: number) => {
    zoom = clampZoom(scale)
    root.style.setProperty('--code-font-size', `${13 * zoom}px`)
    zoomEmitter.emit()
    return getZoomState()
  }

  registerFileViewerZoomProvider(root, {
    zoomIn: () => setZoom(zoom + 0.1),
    zoomOut: () => setZoom(zoom - 0.1),
    resetZoom: () => setZoom(1),
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe
  })

  return {
    $el: target,
    unmount() {
      disposed = true
      unregisterFileViewerZoomProvider(root)
      target.replaceChildren()
    }
  }
}
