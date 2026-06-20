# @file-viewer/core

Framework-neutral TypeScript foundation for Flyfish File Viewer.

This package is the migration base for the next architecture: one pure TypeScript core package with internal `headless`, `browser`, and `renderers` layers, plus multiple native standard component packages for Vue, React, pure JavaScript, jQuery and Svelte. Core owns the shared format matrix, source detection, renderer protocol, capability calculation, lifecycle context, operation/event/search/location/zoom/print/export contracts, heavy renderer asset manifests, option normalization, pure state models, and framework-neutral browser rendering engine.

Browser execution belongs inside core only when it remains framework-neutral TypeScript. DOM mounting, `HTMLElement` traversal, search highlights, zoom provider discovery, print windows, download triggers, Canvas, Worker and WASM renderers must not depend on Vue, React, Svelte or any component package. Framework component packages keep their own local controller, component lifecycle, toolbar/search/loading UI, and ecosystem interaction layer while depending on `@file-viewer/core` as the only shared base.

`@file-viewer/core` is the only shared foundation package. It owns the headless contracts plus browser/renderers layers for the direct `createViewer(container, options)` engine, renderer registry, DOM provider registry, print layout helpers, browser asset resolution, and framework-neutral DOM/Canvas/Worker/WASM rendering contracts. Core source is public; the private Gitea aggregate remains available for the complete workspace, unified release automation, sponsorship, and priority support.

Current migrated browser renderers include media, code, Markdown, images, UMD, geo data, Word DOCX/DOC, Excel/Spreadsheet, OpenDocument/RTF, PDF, OFD, email, EDA, CAD, Typst, PPTX, EPUB, 3D models, drawing files, data assets and archives. PPTX rendering is provided by the independent native `@file-viewer/pptx` engine. Component packages should reuse these handlers instead of carrying framework-specific renderer copies.

```bash
npm install @file-viewer/core
```

## Entry points

Use `@file-viewer/core/headless` when a component package, server-side helper or build script only needs framework-neutral contracts: format support, source normalization, renderer capability metadata, lifecycle/operation context, option normalization, state helpers and static asset resolution. This entry intentionally does not expose the DOM viewer engine or browser renderers.

```ts
import {
  DEFAULT_SUPPORTED_EXTENSIONS,
  normalizeSource,
  resolveFileViewerRendererAssets
} from '@file-viewer/core/headless'

const source = normalizeSource({ url: '/files/report.pdf' })
const pdfAssets = resolveFileViewerRendererAssets('pdf', {
  baseUrl: '/file-viewer/'
})
```

Use `@file-viewer/core/browser` when a native component package or a pure browser integration needs the direct DOM engine, renderer registry, search/zoom providers, print/export adapters and framework-neutral Canvas/Worker/WASM renderers.

```ts
import {
  createViewer,
  coreBrowserRendererHandlers
} from '@file-viewer/core/browser'

const viewer = createViewer(document.querySelector('#viewer')!, {
  options: {
    toolbar: true
  }
})

await viewer.load({ url: '/files/report.pdf' })
```

The root `@file-viewer/core` entry remains the complete compatibility entry for existing integrations. New component packages should prefer the narrowest explicit entry point they need: `headless` for contracts and build-time helpers, `browser` for real browser preview.

```ts
import {
  listFileViewerRendererAssetManifests,
  resolveFileViewerRendererAssets
} from '@file-viewer/core'

const manifests = listFileViewerRendererAssetManifests()
const cadAssets = resolveFileViewerRendererAssets('cad', {
  baseUrl: '/file-viewer/',
  options: {
    cad: {
      wasmPath: '/file-viewer/wasm/cad/'
    }
  }
})
```

The manifest API lets wrappers and deployment scripts discover archive, DOCX, Spreadsheet, CAD, Typst and data-asset worker/WASM resources from the same core contract instead of hard-coding per-framework paths.

Official documentation: https://doc.file-viewer.app/

Online demo: https://demo.file-viewer.app/

Public source repositories:

- GitHub: https://github.com/flyfish-dev/file-viewer-core
- Gitee: https://gitee.com/flyfish-dev/file-viewer-core

The GitHub/Gitee repositories are distributed public source packages. The private Gitea aggregate remains useful for the complete workspace, release automation, integration history, sponsorship, and priority support.

License: Apache-2.0. For second development or commercial use, keep clear Flyfish Viewer attribution and contribute shared compatibility improvements where possible.
