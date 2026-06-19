import type {
  Align,
  CellHeaderStyleMethod,
  CellStyleMethod,
  Column,
  ConfigType,
  SpanMethod,
  VerticalAlign
} from 'e-virt-table'
import tinycolor from 'tinycolor2'
import type { SheetModel } from './worker/type'
import {
  displayCellKey,
  getDataKey,
  getRowState,
  INDEX_COLUMN_KEY,
  ROW_KEY_FIELD,
  type CellBorderCache,
  type CellStyleCache,
  type SheetDefaults,
  type VirtualRow,
  type VirtualSheetState,
  RowState
} from './state'

export const INDEX_COLUMN_WIDTH = 68
const TABLE_FONT_FAMILY = 'Aptos, Calibri, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const TABLE_FONT_SIZE = 11
const MIN_RENDERABLE_ROW_HEIGHT = 8
const HIDDEN_ROW_HEIGHT = 0.1
const CELL_PADDING = 2
const CELL_LINE_HEIGHT = 1.2
export const HEADER_HEIGHT = 34
const EXCEL_HEADER_BG = '#f3f3f3'
const EXCEL_HEADER_TEXT = '#5f6368'
const EXCEL_GRID = '#d7dbe0'
const EXCEL_GREEN = '#21a366'
const EXCEL_GREEN_SOFT = 'rgba(33, 163, 102, 0.1)'
const DATA_AREA_MIN_COL_INDEX = 1
const BORDER_SIDE_KEYS = ['Top', 'Right', 'Bottom', 'Left'] as const
const DEFAULT_BORDER_COLOR = '#000000'
const BORDER_STYLE_PRIORITY: Record<string, number> = {
  double: 8,
  solid: 7,
  dashed: 5,
  dotted: 4
}

const HEADER_FONT = `bold 12px ${TABLE_FONT_FAMILY}`
const BODY_FONT = `${TABLE_FONT_SIZE}px ${TABLE_FONT_FAMILY}`
const MAX_OVERFLOW_SCAN_COLS = 32
const INDEX_CELL_STYLE: CellStyleCache = {
  backgroundColor: EXCEL_HEADER_BG,
  color: EXCEL_HEADER_TEXT,
  font: HEADER_FONT
}
const LOADING_CELL_STYLE: CellStyleCache = {
  backgroundColor: '#f4f7f9',
  color: '#73808d',
  font: `italic ${TABLE_FONT_SIZE}px ${TABLE_FONT_FAMILY}`
}

interface TableConfigOptions {
  hostHeight: number
  sheetDefaults: SheetDefaults
  virtualState: VirtualSheetState
  zoomScale?: number
}

interface TextOverflowLayout {
  left: number
  width: number
}

let measureCanvas: HTMLCanvasElement | undefined
const textWidthCache = new Map<string, number>()

const normalizeZoomScale = (scale = 1) => {
  return Number.isFinite(scale) ? Math.min(2.5, Math.max(0.5, scale)) : 1
}

const scaleNumber = (value: number, zoomScale: number) => {
  return Math.max(1, Math.round(value * normalizeZoomScale(zoomScale)))
}

const scaleFont = (font: string | undefined, zoomScale: number) => {
  if (!font) {
    return font
  }
  const normalizedScale = normalizeZoomScale(zoomScale)
  return font.replace(/(\d+(?:\.\d+)?)px/g, (_, size: string) => {
    return `${Number(size) * normalizedScale}px`
  })
}

const scaleBorder = (border: CellBorderCache | undefined, zoomScale: number) => {
  if (!border) {
    return undefined
  }
  return {
    ...border,
    width: Math.max(0.5, border.width * normalizeZoomScale(zoomScale))
  }
}

const scaleCellStyle = (style: CellStyleCache | undefined, zoomScale: number) => {
  if (!style) {
    return undefined
  }
  return {
    ...style,
    font: scaleFont(style.font, zoomScale),
    borderTop: scaleBorder(style.borderTop, zoomScale),
    borderRight: scaleBorder(style.borderRight, zoomScale),
    borderBottom: scaleBorder(style.borderBottom, zoomScale),
    borderLeft: scaleBorder(style.borderLeft, zoomScale)
  }
}

const getHeaderFont = (zoomScale: number) => scaleFont(HEADER_FONT, zoomScale) || HEADER_FONT
const getBodyFont = (zoomScale: number) => scaleFont(BODY_FONT, zoomScale) || BODY_FONT

const getIndexCellStyle = (zoomScale: number): CellStyleCache => ({
  ...INDEX_CELL_STYLE,
  font: getHeaderFont(zoomScale)
})

const getLoadingCellStyle = (zoomScale: number): CellStyleCache => ({
  ...LOADING_CELL_STYLE,
  font: scaleFont(LOADING_CELL_STYLE.font, zoomScale)
})

const cloneColumns = (columns: Column[]): Column[] => {
  return columns.map(column => ({
    ...column,
    ...(column.children?.length ? { children: cloneColumns(column.children) } : {})
  }))
}

const buildFont = (style: Record<string, any>) => {
  if (typeof style.font === 'string' && style.font.trim()) {
    return style.font
  }

  const hasFont =
    style.fontFamily !== undefined ||
    style.fontSize !== undefined ||
    style.fontWeight !== undefined ||
    style.fontStyle !== undefined

  if (!hasFont) {
    return undefined
  }

  const normalizedWeight = (() => {
    const { fontWeight } = style
    if (typeof fontWeight === 'number') {
      return fontWeight >= 600 ? 'bold' : 'normal'
    }
    if (typeof fontWeight === 'string') {
      const trimmed = fontWeight.trim()
      if (/^\d+$/.test(trimmed)) {
        return Number(trimmed) >= 600 ? 'bold' : 'normal'
      }
      return trimmed
    }
    return 'normal'
  })()

  return [
    style.fontStyle || 'normal',
    normalizedWeight,
    `${Number.parseInt(style.fontSize, 10) || TABLE_FONT_SIZE}px`,
    style.fontFamily || TABLE_FONT_FAMILY
  ].join(' ')
}

const alignFromClassName = (className?: string): Align | undefined => {
  if (!className) {
    return undefined
  }
  if (className.includes('htLeft')) {
    return 'left'
  }
  if (className.includes('htRight')) {
    return 'right'
  }
  if (className.includes('htCenter')) {
    return 'center'
  }
  return undefined
}

const verticalAlignFromClassName = (className?: string): VerticalAlign | undefined => {
  if (!className) {
    return undefined
  }
  if (className.includes('htTop')) {
    return 'top'
  }
  if (className.includes('htBottom')) {
    return 'bottom'
  }
  if (className.includes('htMiddle')) {
    return 'middle'
  }
  return undefined
}

const hasClassName = (className: string | undefined, value: string) => {
  return !!className?.split(/\s+/).includes(value)
}

const getColumnWidth = (
  widths: number | number[] | undefined,
  index: number,
  fallback: number
) => {
  if (typeof widths === 'number') {
    return widths
  }
  return widths?.[index] ?? fallback
}

const getRenderColumnWidth = (column: Column | undefined) => {
  const width = Number((column as any)?.width)
  return Number.isFinite(width) && width > 0 ? width : 0
}

const isVisibleDataColumn = (column: Column | undefined) => {
  return !!column && !(column as any).hide && getRenderColumnWidth(column) > 0
}

const getSheetColumnsMeta = (ws: SheetModel) => {
  return ws.structure?.columns?.length ? ws.structure.columns : ws.columns
}

const getSheetColWidths = (ws: SheetModel) => {
  return ws.structure?.colWidths ?? ws.colWidths
}

export const getRowHeight = (
  heights: number | number[] | undefined,
  index: number,
  fallback: number
) => {
  if (typeof heights === 'number') {
    return heights
  }
  return heights?.[index] ?? fallback
}

// Excel 已经给出了行高时，预览层不再二次猜测。
// 只有完全缺失时才回退到默认行高，同时给极小值留一个最小可渲染下限。
export const normalizeRowHeight = (height: number | undefined, fallback: number) => {
  if (typeof height === 'number' && Number.isFinite(height)) {
    if (height <= 0) {
      // e-virt-table 内部用 item._height || CELL_HEIGHT，0 会被误判为未设置。
      return HIDDEN_ROW_HEIGHT
    }
    return Math.max(Math.ceil(height), MIN_RENDERABLE_ROW_HEIGHT)
  }
  return Math.max(Math.ceil(fallback), MIN_RENDERABLE_ROW_HEIGHT)
}

const isPlainTextCell = (value: unknown) => {
  if (value === null || value === undefined) {
    return false
  }
  const text = `${value}`.trim()
  if (!text) {
    return false
  }
  return !/^\d+([./:-]\d+)*$/.test(text)
}

// 普通明细表通常会把第一行当成字段表头，而报表类工作表往往需要保留原始 Excel 行号。
// 这里只在“首行像简单字段头且没有合并单元格”时，才给左侧序号做 1 行偏移。
export const detectIndexOffset = (ws: SheetModel) => {
  const meta = ws.meta
  const rows = ws.data || []
  if (!meta || rows.length < 2 || (ws.merge || []).length) {
    return 0
  }

  const firstRow = rows[0] || []
  const secondRow = rows[1] || []
  const firstRowValues = firstRow.filter(value => `${value ?? ''}`.trim() !== '')
  const secondRowValues = secondRow.filter(value => `${value ?? ''}`.trim() !== '')

  if (firstRowValues.length < Math.min(Math.max(Math.floor(meta.totalCols / 2), 3), 6)) {
    return 0
  }
  if (!firstRowValues.every(isPlainTextCell) || secondRowValues.length < 2) {
    return 0
  }

  return 1
}

export const buildColumns = (ws: SheetModel) => {
  const columnsMeta = getSheetColumnsMeta(ws)
  const colWidths = getSheetColWidths(ws)
  const columns: Column[] = [{
    key: INDEX_COLUMN_KEY,
    title: '',
    type: 'index',
    fixed: 'left',
    width: INDEX_COLUMN_WIDTH,
    minWidth: INDEX_COLUMN_WIDTH,
    maxWidth: INDEX_COLUMN_WIDTH,
    widthFillDisable: true,
    headerAlign: 'center',
    align: 'center',
    headerVerticalAlign: 'middle',
    verticalAlign: 'middle',
    overflowTooltipShow: false,
    overflowTooltipHeaderShow: false
  }]

  const dataKeys: string[] = []
  for (let index = 0; index < (ws.meta?.totalCols || 0); index += 1) {
    const key = getDataKey(index)
    const column = columnsMeta?.[index]
    const width = getColumnWidth(colWidths, index, ws.defaults.colWidth)
    const hidden = !!column?.hidden || width <= 0
    const columnVerticalAlign = verticalAlignFromClassName(column?.className) || 'middle'
    dataKeys.push(key)
    columns.push({
      key,
      title: column?.title || `${index + 1}`,
      width: hidden ? 0 : Math.max(Math.ceil(width), 1),
      hide: hidden,
      widthFillDisable: true,
      renderType: 'both',
      headerAlign: 'center',
      headerVerticalAlign: 'middle',
      align: alignFromClassName(column?.className) || 'left',
      verticalAlign: columnVerticalAlign,
      overflowTooltipShow: true,
      overflowTooltipHeaderShow: true
    })
  }

  return { columns, dataKeys }
}

const scaleColumn = (column: Column, zoomScale: number): Column => {
  const nextColumn = {
    ...column,
    ...(column.children?.length ? { children: column.children.map(child => scaleColumn(child, zoomScale)) } : {})
  }
  const width = Number((column as any).width)
  if (Number.isFinite(width) && width > 0) {
    ;(nextColumn as any).width = scaleNumber(width, zoomScale)
  }
  const minWidth = Number((column as any).minWidth)
  if (Number.isFinite(minWidth) && minWidth > 0) {
    ;(nextColumn as any).minWidth = scaleNumber(minWidth, zoomScale)
  }
  const maxWidth = Number((column as any).maxWidth)
  if (Number.isFinite(maxWidth) && maxWidth > 0) {
    ;(nextColumn as any).maxWidth = scaleNumber(maxWidth, zoomScale)
  }
  return nextColumn
}

// Excel 预览优先忠实还原原始列宽，不再为了“铺满容器”二次拉伸列宽。
export const getDisplayColumns = (columns: Column[], zoomScale = 1) => {
  const normalizedScale = normalizeZoomScale(zoomScale)
  if (normalizedScale === 1) {
    return cloneColumns(columns)
  }
  return columns.map(column => scaleColumn(column, normalizedScale))
}

const toBorderWidth = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(value, 0)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
  }
  return 0
}

const toBorderStyle = (value: unknown) => {
  if (typeof value !== 'string') {
    return 'solid'
  }

  const style = value.trim()
  switch (style) {
    case 'double':
    case 'dashed':
    case 'dotted':
    case 'solid':
      return style
    default:
      return 'solid'
  }
}

const getBorderSide = (
  style: Record<string, any>,
  side: typeof BORDER_SIDE_KEYS[number]
) => {
  const width = toBorderWidth(style[`border${side}Width`])
  if (!width) {
    return undefined
  }

  return {
    width,
    style: toBorderStyle(style[`border${side}Style`]),
    color: style[`border${side}Color`] || DEFAULT_BORDER_COLOR
  }
}

const hasBorder = (style?: CellStyleCache) => {
  if (!style) {
    return false
  }
  return !!(style.borderTop || style.borderRight || style.borderBottom || style.borderLeft)
}

const hasTextLayout = (style?: CellStyleCache) => {
  if (!style) {
    return false
  }
  return !!(style.horizontalAlign || style.verticalAlign || style.wrapText || style.shrinkToFit)
}

const shouldRenderTextInOverlay = (style: CellStyleCache | undefined, column?: Column) => {
  if (!hasTextLayout(style)) {
    return false
  }

  // e-virt-table 的列级 align 可以交给 canvas；只有单元格级布局差异才用 DOM 覆盖层补齐。
  return !!(
    style?.wrapText ||
    style?.shrinkToFit ||
    (style?.horizontalAlign && style.horizontalAlign !== (column?.align || 'left')) ||
    (style?.verticalAlign && style.verticalAlign !== (column?.verticalAlign || 'middle'))
  )
}

const toFlexJustify = (align?: Align) => {
  switch (align) {
    case 'center':
      return 'center'
    case 'right':
      return 'flex-end'
    default:
      return 'flex-start'
  }
}

const toFlexAlign = (verticalAlign?: VerticalAlign) => {
  switch (verticalAlign) {
    case 'top':
      return 'flex-start'
    case 'bottom':
      return 'flex-end'
    default:
      return 'center'
  }
}

const toTextLayerLeft = (
  align: Align | undefined,
  ownWidth: number,
  overflowWidth: number,
  leftRoom: number
) => {
  switch (align) {
    case 'right':
      return ownWidth - overflowWidth
    case 'center':
      return -Math.min(leftRoom, Math.max((overflowWidth - ownWidth) / 2, 0))
    default:
      return 0
  }
}

const isHiddenVirtualRow = (row: VirtualRow) => {
  return typeof row._height === 'number' && row._height <= HIDDEN_ROW_HEIGHT
}

const getDataColumnIndex = (column: Column | undefined, fallbackColIndex: number) => {
  const key = column?.key
  if (typeof key === 'string' && key.startsWith('c')) {
    const index = Number(key.slice(1))
    if (Number.isInteger(index) && index >= 0) {
      return index
    }
  }
  return Math.max(fallbackColIndex - 1, 0)
}

const getCellCacheKey = (rowIndex: number, colIndex: number, column?: Column) => {
  return displayCellKey(rowIndex, getDataColumnIndex(column, colIndex) + 1)
}

const getCellKeyByDataColumn = (rowIndex: number, dataColIndex: number) => {
  return displayCellKey(rowIndex, dataColIndex + 1)
}

const getTextValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }
  return `${value}`
}

const hasRenderableValue = (value: unknown) => {
  return getTextValue(value).trim() !== ''
}

const isNumericLikeValue = (text: string) => {
  return /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?$/.test(text.trim())
}

const measureTextWidth = (
  text: string,
  font: string,
  padding: number,
  documentRef?: Document
) => {
  const cacheKey = `${font}\n${padding}\n${text}`
  const cached = textWidthCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  if (!measureCanvas && documentRef) {
    measureCanvas = documentRef.createElement('canvas')
  }

  const context = measureCanvas?.getContext('2d')
  if (!context) {
    return text.length * TABLE_FONT_SIZE
  }

  context.font = font
  const width = context.measureText(text).width + padding * 2
  textWidthCache.set(cacheKey, width)
  return width
}

const isBlankOverflowTarget = (
  virtualState: VirtualSheetState,
  row: VirtualRow,
  rowIndex: number,
  dataColIndex: number
) => {
  const column = virtualState.columns[dataColIndex + 1]
  if (!isVisibleDataColumn(column)) {
    return false
  }

  const cellKey = getCellKeyByDataColumn(rowIndex, dataColIndex)
  if (virtualState.mergeStartMap.has(cellKey) || virtualState.mergeCoveredMap.has(cellKey)) {
    return false
  }

  return !hasRenderableValue(row[getDataKey(dataColIndex)])
}

const collectOverflowRoom = (
  virtualState: VirtualSheetState,
  row: VirtualRow,
  rowIndex: number,
  dataColIndex: number,
  direction: 1 | -1
) => {
  let room = 0
  for (let step = 1; step <= MAX_OVERFLOW_SCAN_COLS; step += 1) {
    const nextColIndex = dataColIndex + step * direction
    if (nextColIndex < 0 || nextColIndex >= virtualState.totalCols) {
      break
    }
    if (!isBlankOverflowTarget(virtualState, row, rowIndex, nextColIndex)) {
      break
    }
    room += getRenderColumnWidth(virtualState.columns[nextColIndex + 1])
  }
  return room
}

const getExcelOverflowLayout = (
  virtualState: VirtualSheetState,
  row: VirtualRow,
  rowIndex: number,
  dataColIndex: number,
  column: Column | undefined,
  style: CellStyleCache | undefined,
  value: unknown,
  zoomScale: number,
  documentRef?: Document
): TextOverflowLayout | undefined => {
  const text = getTextValue(value)
  if (!text || style?.wrapText || style?.shrinkToFit || isNumericLikeValue(text)) {
    return undefined
  }

  const cellKey = getCellKeyByDataColumn(rowIndex, dataColIndex)
  if (virtualState.mergeStartMap.has(cellKey) || virtualState.mergeCoveredMap.has(cellKey)) {
    return undefined
  }

  const ownWidth = getRenderColumnWidth(column)
  if (!ownWidth) {
    return undefined
  }

  const font = style?.font || BODY_FONT
  const measuredWidth = Math.ceil(measureTextWidth(text, font, scaleNumber(CELL_PADDING, zoomScale), documentRef))
  if (measuredWidth <= ownWidth) {
    return undefined
  }

  const align = style?.horizontalAlign || column?.align || 'left'
  const leftRoom = align === 'right' || align === 'center'
    ? collectOverflowRoom(virtualState, row, rowIndex, dataColIndex, -1)
    : 0
  const rightRoom = align !== 'right'
    ? collectOverflowRoom(virtualState, row, rowIndex, dataColIndex, 1)
    : 0
  const maxWidth = ownWidth + leftRoom + rightRoom
  if (maxWidth <= ownWidth) {
    return undefined
  }

  const width = Math.min(measuredWidth, maxWidth)
  return {
    left: toTextLayerLeft(align, ownWidth, width, leftRoom),
    width
  }
}

const getBorderScore = (border?: CellBorderCache) => {
  if (!border) {
    return 0
  }
  return border.width * 100 + (BORDER_STYLE_PRIORITY[border.style] || 1)
}

const getCollapsedBorderStyle = (
  virtualState: VirtualSheetState,
  rowIndex: number,
  dataColIndex: number,
  style: CellStyleCache,
  zoomScale: number
) => {
  const previousRow = scaleCellStyle(virtualState.cellCache.get(displayCellKey(rowIndex - 1, dataColIndex + 1)), zoomScale)
  const nextRow = scaleCellStyle(virtualState.cellCache.get(displayCellKey(rowIndex + 1, dataColIndex + 1)), zoomScale)
  const previousCol = scaleCellStyle(virtualState.cellCache.get(displayCellKey(rowIndex, dataColIndex)), zoomScale)
  const nextCol = scaleCellStyle(virtualState.cellCache.get(displayCellKey(rowIndex, dataColIndex + 2)), zoomScale)

  const borderTop = getBorderScore(style.borderTop) >= getBorderScore(previousRow?.borderBottom)
    ? style.borderTop
    : undefined
  const borderBottom = getBorderScore(style.borderBottom) > getBorderScore(nextRow?.borderTop)
    ? style.borderBottom
    : undefined
  const borderLeft = getBorderScore(style.borderLeft) >= getBorderScore(previousCol?.borderRight)
    ? style.borderLeft
    : undefined
  const borderRight = getBorderScore(style.borderRight) > getBorderScore(nextCol?.borderLeft)
    ? style.borderRight
    : undefined

  return {
    ...style,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft
  }
}

const createBorderLine = (
  documentRef: Document,
  side: 'top' | 'right' | 'bottom' | 'left',
  border: NonNullable<CellStyleCache['borderTop']>
) => {
  const line = documentRef.createElement('span')
  const half = border.width / 2

  Object.assign(line.style, {
    position: 'absolute',
    pointerEvents: 'none',
    boxSizing: 'border-box'
  } satisfies Partial<CSSStyleDeclaration>)

  if (side === 'top' || side === 'bottom') {
    Object.assign(line.style, {
      left: `${-half}px`,
      width: `calc(100% + ${border.width}px)`,
      height: '0'
    })
    line.style[side] = `${-half}px`
    line.style.borderTop = `${border.width}px ${border.style} ${border.color}`
  } else {
    Object.assign(line.style, {
      top: `${-half}px`,
      height: `calc(100% + ${border.width}px)`,
      width: '0'
    })
    line.style[side] = `${-half}px`
    line.style.borderLeft = `${border.width}px ${border.style} ${border.color}`
  }

  return line
}

const createTextLayer = (
  documentRef: Document,
  value: unknown,
  style: CellStyleCache,
  padding: number
) => {
  const text = documentRef.createElement('span')
  text.textContent = getTextValue(value)

  Object.assign(text.style, {
    position: 'relative',
    zIndex: '1',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: toFlexAlign(style.verticalAlign),
    justifyContent: toFlexJustify(style.horizontalAlign),
    padding: `0 ${padding}px`,
    overflow: 'hidden',
    textOverflow: style.wrapText ? 'clip' : 'ellipsis',
    whiteSpace: style.wrapText ? 'pre-wrap' : 'nowrap',
    wordBreak: style.wrapText ? 'break-word' : 'normal',
    lineHeight: `${CELL_LINE_HEIGHT}`,
    textAlign: style.horizontalAlign || 'left',
    color: style.color || 'inherit',
    font: style.font || BODY_FONT,
    transform: style.shrinkToFit ? 'scale(0.92)' : 'none',
    transformOrigin: `${style.horizontalAlign || 'left'} center`
  } satisfies Partial<CSSStyleDeclaration>)

  return text
}

const applyOverflowLayout = (text: HTMLSpanElement, overflowLayout?: TextOverflowLayout) => {
  if (!overflowLayout) {
    return
  }

  Object.assign(text.style, {
    position: 'absolute',
    left: `${overflowLayout.left}px`,
    top: '0',
    width: `${overflowLayout.width}px`,
    overflow: 'hidden',
    textOverflow: 'clip'
  } satisfies Partial<CSSStyleDeclaration>)
}

// e-virt-table 的普通样式接口不支持 Excel 式四边边框和单元格级换行/垂直对齐，
// 这里借助官方的 BODY_CELL_RENDER_METHOD，只在可视区补轻量 DOM 覆盖层。
const renderCellOverlay = (
  cellEl: HTMLDivElement,
  style: CellStyleCache,
  value: unknown,
  renderText: boolean,
  overflowLayout: TextOverflowLayout | undefined,
  zoomScale: number
) => {
  const documentRef = cellEl.ownerDocument
  cellEl.replaceChildren()
  Object.assign(cellEl.style, {
    pointerEvents: 'none',
    overflow: 'visible',
    background: 'transparent'
  } satisfies Partial<CSSStyleDeclaration>)

  const fragment = documentRef.createDocumentFragment()
  if (renderText) {
    const text = createTextLayer(documentRef, value, style, scaleNumber(CELL_PADDING, zoomScale))
    applyOverflowLayout(text, overflowLayout)
    fragment.appendChild(text)
  }
  if (style.borderTop) {
    fragment.appendChild(createBorderLine(documentRef, 'top', style.borderTop))
  }
  if (style.borderRight) {
    fragment.appendChild(createBorderLine(documentRef, 'right', style.borderRight))
  }
  if (style.borderBottom) {
    fragment.appendChild(createBorderLine(documentRef, 'bottom', style.borderBottom))
  }
  if (style.borderLeft) {
    fragment.appendChild(createBorderLine(documentRef, 'left', style.borderLeft))
  }

  cellEl.appendChild(fragment)
}

export const normalizeCellStyle = (
  meta: { className?: string, style: any } | undefined
) => {
  if (!meta) {
    return undefined
  }

  const style = meta.style || {}
  const nextStyle: CellStyleCache = {}

  if (style.backgroundColor) {
    nextStyle.backgroundColor = style.backgroundColor
  }
  if (style.color) {
    nextStyle.color = style.color
  } else if (style.backgroundColor && tinycolor(style.backgroundColor).isDark()) {
    nextStyle.color = '#ffffff'
  }

  const font = buildFont(style)
  if (font) {
    nextStyle.font = font
  } else if (style.backgroundColor && tinycolor(style.backgroundColor).isDark()) {
    nextStyle.font = `bold ${TABLE_FONT_SIZE}px ${TABLE_FONT_FAMILY}`
  }

  const borderTop = getBorderSide(style, 'Top')
  if (borderTop) {
    nextStyle.borderTop = borderTop
  }
  const borderRight = getBorderSide(style, 'Right')
  if (borderRight) {
    nextStyle.borderRight = borderRight
  }
  const borderBottom = getBorderSide(style, 'Bottom')
  if (borderBottom) {
    nextStyle.borderBottom = borderBottom
  }
  const borderLeft = getBorderSide(style, 'Left')
  if (borderLeft) {
    nextStyle.borderLeft = borderLeft
  }

  const horizontalAlign = alignFromClassName(meta.className)
  if (horizontalAlign) {
    nextStyle.horizontalAlign = horizontalAlign
  }
  const verticalAlign = verticalAlignFromClassName(meta.className)
  if (verticalAlign) {
    nextStyle.verticalAlign = verticalAlign
  }
  if (hasClassName(meta.className, 'htWrap')) {
    nextStyle.wrapText = true
  }
  if (hasClassName(meta.className, 'htShrink')) {
    nextStyle.shrinkToFit = true
  }

  if (!nextStyle.backgroundColor && !nextStyle.color && !nextStyle.font && !hasBorder(nextStyle) && !hasTextLayout(nextStyle)) {
    return undefined
  }

  return nextStyle
}

export const createTableConfig = ({
  hostHeight,
  sheetDefaults,
  virtualState,
  zoomScale = 1
}: TableConfigOptions): ConfigType => {
  const normalizedScale = normalizeZoomScale(zoomScale)
  const scaledPadding = scaleNumber(CELL_PADDING, normalizedScale)
  const scaledHeaderHeight = scaleNumber(HEADER_HEIGHT, normalizedScale)
  const scaledCellHeight = scaleNumber(normalizeRowHeight(sheetDefaults.rowHeight, sheetDefaults.rowHeight), normalizedScale)
  const scaledCellWidth = scaleNumber(sheetDefaults.colWidth, normalizedScale)
  const headerStyle = getIndexCellStyle(normalizedScale)
  const loadingStyle = getLoadingCellStyle(normalizedScale)

  const spanMethod: SpanMethod = ({ rowIndex, colIndex, column }) => {
    if (colIndex === 0) {
      return
    }

    const key = getCellCacheKey(rowIndex, colIndex, column)
    if (virtualState.mergeCoveredMap.has(key)) {
      return { rowspan: 0, colspan: 0 }
    }

    const merge = virtualState.mergeStartMap.get(key)
    if (!merge) {
      return
    }

    return {
      rowspan: merge.rowspan,
      colspan: merge.colspan
    }
  }

  const headerStyleMethod: CellHeaderStyleMethod = () => headerStyle

  const styleMethod: CellStyleMethod = ({ row, rowIndex, colIndex, column }) => {
    if (colIndex === 0) {
      return headerStyle
    }

    const currentRow = row as VirtualRow
    if (isHiddenVirtualRow(currentRow)) {
      return undefined
    }

    if (getRowState(currentRow) !== RowState.Loaded) {
      return loadingStyle
    }

    return scaleCellStyle(virtualState.cellCache.get(getCellCacheKey(rowIndex, colIndex, column)), normalizedScale)
  }

  const renderMethod = ({
    row,
    rowIndex,
    colIndex,
    column,
    value
  }: {
    row: unknown,
    rowIndex: number,
    colIndex: number,
    column: Column,
    value: unknown
  }) => {
    const currentRow = row as VirtualRow
    if (colIndex === 0 || isHiddenVirtualRow(currentRow) || getRowState(currentRow) !== RowState.Loaded) {
      return undefined
    }

    const cellKey = getCellCacheKey(rowIndex, colIndex, column)
    if (virtualState.mergeCoveredMap.has(cellKey)) {
      return undefined
    }

    const style = scaleCellStyle(virtualState.cellCache.get(cellKey), normalizedScale)
    const dataColIndex = getDataColumnIndex(column, colIndex)
    const overflowLayout = getExcelOverflowLayout(
      virtualState,
      currentRow,
      rowIndex,
      dataColIndex,
      column,
      style,
      value,
      normalizedScale
    )
    const renderText = shouldRenderTextInOverlay(style, column) || !!overflowLayout
    if (!hasBorder(style) && !renderText) {
      return undefined
    }

    return ((cellEl: HTMLDivElement) => {
      const baseStyle: CellStyleCache = {
        ...(style || {}),
        horizontalAlign: style?.horizontalAlign || column?.align,
        verticalAlign: style?.verticalAlign || column?.verticalAlign
      }
      const collapsedStyle = hasBorder(style)
        ? getCollapsedBorderStyle(virtualState, rowIndex, dataColIndex, baseStyle, normalizedScale)
        : baseStyle
      renderCellOverlay(cellEl, collapsedStyle, value, renderText, overflowLayout, normalizedScale)
    }) as unknown as string
  }

  return {
    ROW_KEY: ROW_KEY_FIELD,
    DISABLED: true,
    HEIGHT: Math.max(hostHeight, 240),
    MAX_HEIGHT: Math.max(hostHeight, 240),
    HEADER_HEIGHT: scaledHeaderHeight,
    CELL_HEIGHT: scaledCellHeight,
    CELL_WIDTH: scaledCellWidth,
    CELL_PADDING: scaledPadding,
    CELL_LINE_HEIGHT,
    COLUMNS_VERTICAL_ALIGN: 'middle',
    HEADER_FONT: getHeaderFont(normalizedScale),
    BODY_FONT: getBodyFont(normalizedScale),
    BORDER_RADIUS: 0,
    BORDER_COLOR: EXCEL_GRID,
    HEADER_BG_COLOR: EXCEL_HEADER_BG,
    BODY_BG_COLOR: '#ffffff',
    HEADER_TEXT_COLOR: EXCEL_HEADER_TEXT,
    BODY_TEXT_COLOR: '#202124',
    READONLY_COLOR: '#ffffff',
    READONLY_TEXT_COLOR: '#202124',
    EDIT_BG_COLOR: '#ffffff',
    PLACEHOLDER_COLOR: '#8a94a3',
    SCROLLER_COLOR: '#c1c7d0',
    SCROLLER_FOCUS_COLOR: '#9aa0a6',
    SELECT_ROW_COL_BG_COLOR: EXCEL_GREEN_SOFT,
    SELECT_AREA_COLOR: 'rgba(33, 163, 102, 0.14)',
    SELECT_BORDER_COLOR: EXCEL_GREEN,
    AUTOFILL_POINT_BORDER_COLOR: EXCEL_GREEN,
    ENABLE_SELECTOR: true,
    ENABLE_SELECTOR_SINGLE: false,
    ENABLE_SELECTOR_SPAN_COL: true,
    ENABLE_SELECTOR_SPAN_ROW: true,
    ENABLE_SELECTOR_ALL_ROWS: true,
    ENABLE_SELECTOR_ALL_COLS: true,
    SELECTOR_AREA_MIN_X: DATA_AREA_MIN_COL_INDEX,
    ENABLE_CONTEXT_MENU: false,
    ENABLE_HEADER_CONTEXT_MENU: false,
    ENABLE_AUTOFILL: true,
    ENABLE_AUTOFILL_SPAN_COL: true,
    ENABLE_AUTOFILL_SPAN_ROW: true,
    ENABLE_PASTER: false,
    ENABLE_HISTORY: false,
    ENABLE_RESIZE_COLUMN: false,
    ENABLE_RESIZE_ROW: false,
    ENABLE_KEYBOARD: true,
    ENABLE_COPY: true,
    // 预览态只开放“拖动扩选”的交互，不允许真正写回单元格内容。
    BEFORE_AUTOFILL_DATA_METHOD: () => [],
    SPAN_METHOD: spanMethod,
    HEADER_CELL_STYLE_METHOD: headerStyleMethod,
    BODY_CELL_STYLE_METHOD: styleMethod,
    BODY_CELL_RENDER_METHOD: renderMethod as any,
    BODY_CELL_FORMATTER_METHOD: ({ row, rowIndex, colIndex, column, value }) => {
      if (isHiddenVirtualRow(row as VirtualRow)) {
        return ''
      }
      if (colIndex === 0) {
        const displayIndex = rowIndex + 1 - virtualState.indexOffset
        return displayIndex > 0 ? `${displayIndex}` : ''
      }
      if (getRowState(row as VirtualRow) !== RowState.Loaded) {
        return ''
      }
      const currentRow = row as VirtualRow
      const style = scaleCellStyle(virtualState.cellCache.get(getCellCacheKey(rowIndex, colIndex, column)), normalizedScale)
      const overflowLayout = getExcelOverflowLayout(
        virtualState,
        currentRow,
        rowIndex,
        getDataColumnIndex(column, colIndex),
        column,
        style,
        value,
        normalizedScale
      )
      if (shouldRenderTextInOverlay(style, column) || overflowLayout) {
        return ''
      }
      if (value === null || value === undefined) {
        return ''
      }
      return `${value}`
    }
  }
}
