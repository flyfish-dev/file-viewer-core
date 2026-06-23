import type { FileRenderExportAdapter, FileRenderExportMode, FileRenderExportOptions } from '../contracts/types';
export interface BuildExportHtmlDocumentOptions {
    contentHtml: string;
    includeDocumentStyles?: boolean;
    printStyle?: string;
    title: string;
    watermarkInlineStyle?: string;
}
export declare const collectDocumentStyles: () => string;
export declare const buildExportHtmlDocument: ({ contentHtml, includeDocumentStyles, printStyle, title, watermarkInlineStyle }: BuildExportHtmlDocumentOptions) => string;
export interface BuildFileViewerRenderedHtmlDocumentOptions {
    source: HTMLElement;
    mode?: FileRenderExportMode;
    title: string;
    adapter?: FileRenderExportAdapter | null;
    watermarkInlineStyle?: string;
}
export declare const triggerFileViewerBlobDownload: (blob: Blob, name: string) => void;
export declare const triggerFileViewerUrlDownload: (url: string, name: string) => void;
export declare const replaceFileViewerCanvasWithImages: (source: HTMLElement, clone: HTMLElement) => void;
export declare const waitForFileViewerNextPaint: (targetWindow?: Partial<Pick<Window, "requestAnimationFrame" | "setTimeout">>) => Promise<void>;
export declare const waitForFileViewerImages: (root: ParentNode) => Promise<void>;
export declare const waitForFileViewerPrintWindowReady: (printWindow: Window) => Promise<void>;
export declare const resolveFileViewerPrintStyle: (adapter: FileRenderExportAdapter | null, options: FileRenderExportOptions) => Promise<string>;
export declare const prepareFileViewerRenderedContentForSnapshot: (source: HTMLElement, adapter?: FileRenderExportAdapter | null) => Promise<void>;
export declare const buildFileViewerRenderedHtmlDocument: ({ source, mode, title, adapter, watermarkInlineStyle }: BuildFileViewerRenderedHtmlDocumentOptions) => Promise<string>;
