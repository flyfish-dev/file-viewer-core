import { normalizeFileViewerToolbar } from './operations';
import { normalizeFileViewerTheme } from './options';
import { getExtension, resolveFileViewerSourceFilename } from './source';
import type {
  FileViewerFileRef,
  FileViewerOptions,
  FileViewerThemeMode,
  FileViewerToolbarOptions,
} from './types';

export interface ResolveFileViewerPresentationStateInput {
  filename?: string;
  file?: FileViewerFileRef;
  url?: string;
  options?: FileViewerOptions;
}

export interface FileViewerPresentationState {
  displayFilename: string;
  extension: string;
  toolbar: FileViewerToolbarOptions;
  theme: FileViewerThemeMode;
}

export const resolveFileViewerPresentationState = ({
  filename,
  file,
  url,
  options,
}: ResolveFileViewerPresentationStateInput): FileViewerPresentationState => {
  const displayFilename = resolveFileViewerSourceFilename({
    filename,
    file,
    url,
  });

  return {
    displayFilename,
    extension: getExtension(displayFilename),
    toolbar: normalizeFileViewerToolbar(options),
    theme: normalizeFileViewerTheme(options?.theme),
  };
};
