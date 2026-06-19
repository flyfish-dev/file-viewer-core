export interface ParseOfdOptions {
  ofd: File | Blob | ArrayBuffer;
  success?: (documents: unknown[]) => void;
  fail?: (reason: unknown) => void;
}

export function parseOfdDocument(options: ParseOfdOptions): void;
export function renderOfd(screenWidth: number, ofdDocument: unknown): HTMLElement[];
export function renderOfdByScale(ofdDocument: unknown): HTMLElement[];
export function setPageScale(scale: number): void;
export function getPageScale(): number;
