import type { FileRenderContext, FileViewerRenderedInstance } from '../contracts/types'
import type Hls from 'hls.js'

const videoStyle = `
.fv-video-viewer{width:100%;min-height:100%;display:flex;align-items:center;justify-content:center;padding:28px;background:#eef1f4;box-sizing:border-box}
.fv-video-shell{width:min(100%,960px);border-radius:8px;border:1px solid rgba(15,23,42,.1);background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.14);overflow:hidden}
.fv-video-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid rgba(15,23,42,.08)}
.fv-video-heading span{color:#0f766e;font-size:12px;font-weight:800}
.fv-video-heading strong{color:#132235;font-size:16px}
.fv-video-player{display:block;width:100%;aspect-ratio:16/9;background:#05070a}
.fv-video-hint{margin:0;padding:12px 18px 16px;color:#64748b;font-size:13px;line-height:1.7}
`

const VIDEO_MIME_MAP: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  mp4: 'video/mp4',
  webm: 'video/webm'
}

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
  style.textContent = videoStyle
  return style
}

const createRenderedInstance = (
  target: HTMLDivElement,
  cleanup: () => void
): FileViewerRenderedInstance => ({
  $el: target,
  unmount() {
    cleanup()
    target.replaceChildren()
  }
})

const getMimeType = (type: string) => {
  return VIDEO_MIME_MAP[type] || 'video/*'
}

const createLocalUrl = (buffer: ArrayBuffer, type: string) => {
  return URL.createObjectURL(new Blob([buffer], { type: getMimeType(type) }))
}

/**
 * Pure TypeScript video renderer.
 *
 * MP4/WebM use the native `<video>` element. HLS uses native browser support
 * first and imports `hls.js` only when the current browser needs it.
 */
export default async function renderVideo(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
) {
  const normalizedType = (type || 'mp4').toLowerCase()
  let disposed = false
  let objectUrl = ''
  let hls: Hls | null = null

  const root = createElement('div', 'fv-video-viewer')
  const shell = createElement('section', 'fv-video-shell')
  const heading = createElement('div', 'fv-video-heading')
  heading.append(
    createElement('span', '', normalizedType.toUpperCase() || 'VIDEO'),
    createElement('strong', '', '视频预览')
  )

  const video = createElement('video', 'fv-video-player')
  video.controls = true
  video.preload = 'metadata'
  video.textContent = '当前浏览器不支持该视频格式。'
  shell.append(heading, video)

  if (normalizedType === 'm3u8') {
    shell.append(createElement(
      'p',
      'fv-video-hint',
      'HLS 会优先使用原始 URL 加载分片；如果传入的是本地单文件清单，请确保分片地址可被浏览器访问。'
    ))
  }

  root.append(shell)
  target.replaceChildren(createStyle(), root)

  const resolveSource = () => {
    if (normalizedType === 'm3u8' && context?.url) {
      return context.url
    }
    objectUrl = createLocalUrl(buffer, normalizedType)
    return objectUrl
  }

  const mountVideo = async () => {
    const source = resolveSource()
    if (normalizedType === 'm3u8') {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source
        return
      }
      const { default: HlsConstructor } = await import('hls.js')
      if (disposed) {
        return
      }
      if (HlsConstructor.isSupported()) {
        hls = new HlsConstructor({ enableWorker: true, lowLatencyMode: false })
        hls.loadSource(source)
        hls.attachMedia(video)
        return
      }
    }
    video.src = source
  }

  void mountVideo()

  return createRenderedInstance(target, () => {
    disposed = true
    hls?.destroy()
    hls = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
  })
}
