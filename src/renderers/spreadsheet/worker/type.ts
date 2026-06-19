export interface CellMerge {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export interface SheetImage {
  id: string;
  src: string;
  contentType?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  row: number;
  col: number;
}

export interface SheetStructure {
  merge?: CellMerge[];
  colWidths?: number | number[];
  rowHeights?: number | number[];
  columns?: SheetColumn[];
  images?: SheetImage[];
}

export interface SheetColumn {
  key: number;
  title: string;
  hidden?: boolean;
  editor: false;
  className: string;
  renderer: 'styleRender';
}

export interface SheetDefinition {
  id: number;
  name: string;
  hidden?: boolean;
  rowCount?: number;
  colCount?: number;
}

export interface SheetWindow {
  startRow: number;
  endRow: number;
  pageSize: number;
  totalRows: number;
  totalCols: number;
}

export interface SheetModel {
  get defaults(): any;
  get data(): string[][];
  get cell(): Record<string, unknown>;
  get merge(): CellMerge[];
  get rowHeights(): number | number[];
  get colWidths(): number | number[];
  get columns(): SheetColumn[];
  readonly structure?: SheetStructure;
  readonly meta?: SheetWindow;
}
