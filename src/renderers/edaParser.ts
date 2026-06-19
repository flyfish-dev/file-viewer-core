import type { CFB$Entry } from 'cfb'

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const MAX_STREAMS = 200
const MAX_SAMPLE_BYTES = 4096
const MAX_HEX_BYTES = 192
const MAX_STRINGS = 180
const MAX_STREAM_STRINGS = 24
const MAX_PROPERTIES = 420

export type EdaFileType = 'olb' | 'dra'
export type EdaParserMode = 'cfb' | 'binary'
export type EdaStreamKind = 'text' | 'binary' | 'storage'
export type EdaDomainRole =
  | 'root'
  | 'library'
  | 'symbol'
  | 'footprint'
  | 'padstack'
  | 'drawing'
  | 'metadata'
  | 'property'
  | 'geometry'
  | 'net'
  | 'unknown'
export type EdaDiagnosticLevel = 'info' | 'warning'

export interface EdaProperty {
  key: string;
  value: string;
  source: string;
}

export interface EdaStreamView {
  path: string;
  name: string;
  size: number;
  kind: EdaStreamKind;
  role: EdaDomainRole;
  sample?: string;
  hex?: string;
  strings: string[];
  properties: EdaProperty[];
}

export interface EdaTreeNode {
  id: string;
  path: string;
  name: string;
  kind: EdaStreamKind;
  role: EdaDomainRole;
  size: number;
  children: EdaTreeNode[];
}

export interface EdaEntity {
  id: string;
  name: string;
  role: EdaDomainRole;
  path: string;
  streamCount: number;
  byteLength: number;
  properties: EdaProperty[];
  pins: string[];
  layers: string[];
  keywords: string[];
  description?: string;
  footprint?: string;
}

export interface EdaStats {
  textStreams: number;
  binaryStreams: number;
  storageEntries: number;
  propertyCount: number;
  stringCount: number;
  symbolCount: number;
  footprintCount: number;
  padstackCount: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface EdaDiagnostic {
  level: EdaDiagnosticLevel;
  code: string;
  message: string;
}

export interface EdaParseResult {
  type: EdaFileType;
  parser: EdaParserMode;
  title: string;
  byteLength: number;
  streamCount: number;
  totalStreamBytes: number;
  streams: EdaStreamView[];
  tree: EdaTreeNode[];
  entities: EdaEntity[];
  metadata: EdaProperty[];
  strings: string[];
  warnings: string[];
  diagnostics: EdaDiagnostic[];
  stats: EdaStats;
}

const toBytes = (buffer: ArrayBuffer) => new Uint8Array(buffer)

const isCfbFile = (bytes: Uint8Array) => {
  return CFB_MAGIC.every((value, index) => bytes[index] === value)
}

const normalizeBytes = (value: CFB$Entry['content']) => {
  return value instanceof Uint8Array ? value : new Uint8Array(value)
}

const cleanupText = (text: string) => {
  return text
    .replace(/\u0000/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
}

const normalizeSearchText = (value: string) => {
  return cleanupText(value).toLowerCase()
}

const lastPathPart = (path: string) => {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path || '/'
}

const stripExtension = (value: string) => {
  return value.replace(/\.[a-z0-9]+$/i, '')
}

const uniquePush = (target: string[], value: string, max = Number.POSITIVE_INFINITY) => {
  const cleaned = cleanupText(value)
  if (!cleaned || target.includes(cleaned) || target.length >= max) {
    return
  }
  target.push(cleaned)
}

const looksLikeText = (bytes: Uint8Array) => {
  if (!bytes.length) {
    return false
  }
  const sample = bytes.slice(0, Math.min(bytes.length, MAX_SAMPLE_BYTES))
  let printable = 0
  let zeroBytes = 0
  for (const byte of sample) {
    if (byte === 0) {
      zeroBytes += 1
    }
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 0x80) {
      printable += 1
    }
  }
  return printable / sample.length > 0.82 || zeroBytes / sample.length > 0.25
}

const decodeSample = (bytes: Uint8Array) => {
  const sample = bytes.slice(0, Math.min(bytes.length, MAX_SAMPLE_BYTES))
  if (!sample.length) {
    return ''
  }

  try {
    let zeroOdd = 0
    let zeroEven = 0
    for (let index = 0; index < sample.length; index += 1) {
      if (sample[index] !== 0) {
        continue
      }
      if (index % 2 === 0) {
        zeroEven += 1
      } else {
        zeroOdd += 1
      }
    }

    const decoder = zeroOdd > sample.length / 5 && zeroOdd > zeroEven * 2
      ? new TextDecoder('utf-16le', { fatal: false })
      : new TextDecoder('utf-8', { fatal: false })
    return cleanupText(decoder.decode(sample))
  } catch {
    return ''
  }
}

const hexPreview = (bytes: Uint8Array) => {
  const sample = bytes.slice(0, Math.min(bytes.length, MAX_HEX_BYTES))
  const lines: string[] = []
  for (let offset = 0; offset < sample.length; offset += 16) {
    const row = sample.slice(offset, offset + 16)
    const hex = Array.from(row).map(byte => byte.toString(16).padStart(2, '0')).join(' ')
    const ascii = Array.from(row)
      .map(byte => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')
      .join('')
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  return lines.join('\n')
}

const extractAsciiStrings = (bytes: Uint8Array) => {
  const result: string[] = []
  let current = ''
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte)
      continue
    }
    if (current.length >= 4) {
      result.push(current)
    }
    current = ''
  }
  if (current.length >= 4) {
    result.push(current)
  }
  return result
}

const extractUtf16Strings = (bytes: Uint8Array) => {
  const result: string[] = []
  let current = ''
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const low = bytes[index]
    const high = bytes[index + 1]
    if (high === 0 && low >= 32 && low <= 126) {
      current += String.fromCharCode(low)
      continue
    }
    if (current.length >= 4) {
      result.push(current)
    }
    current = ''
  }
  if (current.length >= 4) {
    result.push(current)
  }
  return result
}

const collectStrings = (chunks: Uint8Array[], maxStrings = MAX_STRINGS) => {
  const seen = new Set<string>()
  const result: string[] = []
  chunks.forEach(chunk => {
    const candidates = [...extractAsciiStrings(chunk), ...extractUtf16Strings(chunk)]
    candidates.forEach(item => {
      const cleaned = cleanupText(item)
      if (!cleaned || cleaned.length < 4 || seen.has(cleaned) || result.length >= maxStrings) {
        return
      }
      seen.add(cleaned)
      result.push(cleaned)
    })
  })
  return result
}

const PROPERTY_RE = /^\s*([A-Za-z][A-Za-z0-9_. /#-]{1,56})\s*[:=]\s*(.{1,240})\s*$/
const INLINE_PROPERTY_RE = /\b([A-Za-z][A-Za-z0-9_. /#-]{1,56})\s*=\s*([^;\n\r|]{1,240})/g

const normalizePropertyKey = (key: string) => {
  return cleanupText(key).replace(/\s+/g, ' ')
}

const addProperty = (target: EdaProperty[], seen: Set<string>, key: string, value: string, source: string) => {
  if (target.length >= MAX_PROPERTIES) {
    return
  }
  const normalizedKey = normalizePropertyKey(key)
  const normalizedValue = cleanupText(value)
  if (!normalizedKey || !normalizedValue) {
    return
  }
  const identity = `${source}\u0000${normalizedKey.toLowerCase()}\u0000${normalizedValue}`
  if (seen.has(identity)) {
    return
  }
  seen.add(identity)
  target.push({ key: normalizedKey, value: normalizedValue, source })
}

const extractProperties = (text: string, strings: string[], source: string) => {
  const properties: EdaProperty[] = []
  const seen = new Set<string>()
  const chunks = [text, ...strings].filter(Boolean)
  chunks.forEach(chunk => {
    cleanupText(chunk)
      .split(/\n|[|;]/)
      .forEach(line => {
        const match = line.match(PROPERTY_RE)
        if (match) {
          addProperty(properties, seen, match[1], match[2], source)
        }
      })

    for (const match of chunk.matchAll(INLINE_PROPERTY_RE)) {
      addProperty(properties, seen, match[1], match[2], source)
    }
  })
  return properties
}

const hasProperty = (properties: EdaProperty[], keys: string[]) => {
  const normalized = keys.map(key => key.toLowerCase())
  return properties.some(property => normalized.includes(property.key.toLowerCase()))
}

const getPropertyValue = (properties: EdaProperty[], keys: string[]) => {
  const normalized = keys.map(key => key.toLowerCase())
  return properties.find(property => normalized.includes(property.key.toLowerCase()))?.value
}

const roleFromText = (
  type: EdaFileType,
  path: string,
  name: string,
  sample: string,
  strings: string[],
  properties: EdaProperty[],
  kind: EdaStreamKind
): EdaDomainRole => {
  const haystack = normalizeSearchText(`${path}\n${name}\n${sample}\n${strings.join('\n')}`)
  if (haystack === '/' || path === '/') {
    return 'root'
  }
  if (kind === 'storage' && /(^|\/)(library|libraries)(\/|$)/i.test(path)) {
    return 'library'
  }
  if (/(header|version|source|author|metadata|property|properties)/.test(haystack)) {
    return hasProperty(properties, ['Name', 'Pins', 'Footprint', 'Padstack']) ? 'property' : 'metadata'
  }

  if (type === 'olb') {
    if (/(^|\/)(symbols?|parts?)(\/|$)/.test(haystack) || hasProperty(properties, ['Pins', 'Footprint', 'PCB Footprint', 'Part Number'])) {
      return 'symbol'
    }
    if (/(^|\/)(library|capture|orcad)(\/|$)/.test(haystack)) {
      return 'library'
    }
  }

  if (type === 'dra') {
    if (/(padstack|pad stack|thermal|antipad|drill)/.test(haystack) || hasProperty(properties, ['Padstack', 'Drill'])) {
      return 'padstack'
    }
    if (/(footprint|package|psm|bsm|fsm|ssm|symbol)/.test(haystack)) {
      return 'footprint'
    }
    if (/(route|net|via|ratsnest)/.test(haystack)) {
      return 'net'
    }
    if (/(line |arc |circle|shape|outline|silk|place_bound|assembly|soldermask|pastemask)/.test(haystack)) {
      return 'geometry'
    }
    if (/(drawing|units|layers?|constraint|allegro)/.test(haystack) || hasProperty(properties, ['Units', 'Layers'])) {
      return 'drawing'
    }
  }

  if (properties.length) {
    return 'property'
  }
  return kind === 'storage' ? 'library' : 'unknown'
}

const buildStreamView = (type: EdaFileType, path: string, name: string, size: number, kind: EdaStreamKind, bytes?: Uint8Array): EdaStreamView => {
  if (kind === 'storage' || !bytes) {
    const role = roleFromText(type, path, name, '', [], [], kind)
    return { path, name, size, kind, role, strings: [], properties: [] }
  }

  const sample = looksLikeText(bytes) ? decodeSample(bytes) : ''
  const strings = collectStrings([bytes], MAX_STREAM_STRINGS)
  const properties = extractProperties(sample, strings, path)
  const role = roleFromText(type, path, name, sample, strings, properties, sample ? 'text' : 'binary')
  return {
    path,
    name,
    size,
    kind: sample ? 'text' : 'binary',
    role,
    sample,
    hex: sample ? undefined : hexPreview(bytes),
    strings,
    properties
  }
}

const sortTree = (node: EdaTreeNode) => {
  node.children.sort((left, right) => {
    if (left.children.length !== right.children.length) {
      return right.children.length - left.children.length
    }
    return left.name.localeCompare(right.name)
  })
  node.children.forEach(sortTree)
}

const buildTree = (streams: EdaStreamView[], type: EdaFileType) => {
  const root: EdaTreeNode = {
    id: `${type}:root`,
    path: '/',
    name: type.toUpperCase(),
    kind: 'storage',
    role: 'root',
    size: 0,
    children: []
  }
  const nodes = new Map<string, EdaTreeNode>([['/', root]])

  streams.forEach(stream => {
    const parts = stream.path.split('/').filter(Boolean)
    let parent = root
    let currentPath = ''
    parts.forEach((part, index) => {
      currentPath += `/${part}`
      const isLeaf = index === parts.length - 1
      let node = nodes.get(currentPath)
      if (!node) {
        node = {
          id: `${type}:${currentPath}`,
          path: currentPath,
          name: part,
          kind: isLeaf ? stream.kind : 'storage',
          role: isLeaf ? stream.role : roleFromText(type, currentPath, part, '', [], [], 'storage'),
          size: isLeaf ? stream.size : 0,
          children: []
        }
        nodes.set(currentPath, node)
        parent.children.push(node)
      }
      if (isLeaf) {
        node.kind = stream.kind
        node.role = stream.role
        node.size = stream.size
      }
      parent = node
    })
  })

  sortTree(root)
  return root.children
}

const splitListValue = (value?: string) => {
  if (!value) {
    return []
  }
  const result: string[] = []
  value.split(/[,/;| ]+/).forEach(item => {
    if (/^[A-Za-z0-9_.+-]+$/.test(item)) {
      uniquePush(result, item, 64)
    }
  })
  return result
}

const entityRoleForStream = (stream: EdaStreamView, type: EdaFileType): EdaDomainRole | null => {
  if (type === 'olb') {
    return stream.role === 'symbol' && stream.kind !== 'storage' ? 'symbol' : null
  }
  if (stream.role === 'padstack') {
    return 'padstack'
  }
  if (stream.role === 'footprint' || (stream.role === 'geometry' && /\/footprint\//i.test(stream.path))) {
    return 'footprint'
  }
  if (stream.role === 'drawing') {
    return 'drawing'
  }
  return null
}

const streamEntityPath = (stream: EdaStreamView, role: EdaDomainRole) => {
  if (role === 'footprint') {
    const match = stream.path.match(/^(.+?\/Footprint)(?:\/|$)/i)
    return match?.[1] || stream.path
  }
  if (role === 'drawing') {
    const match = stream.path.match(/^(.+?\/Drawing)(?:\/|$)/i)
    return match?.[1] || stream.path
  }
  return stream.path
}

const inferEntityName = (stream: EdaStreamView, role: EdaDomainRole, entityPath: string) => {
  const propertyName = getPropertyValue(stream.properties, [
    'Name',
    'Part',
    'Part Name',
    'Symbol',
    'Device',
    'Footprint',
    'PCB Footprint',
    'Package',
    'Padstack',
    'Pad Stack',
    'Drawing'
  ])
  if (propertyName) {
    return propertyName
  }
  const pathName = stripExtension(lastPathPart(entityPath))
  if (pathName && pathName !== '/') {
    return pathName
  }
  return role.toUpperCase()
}

const roleKeywords = (stream: EdaStreamView, role: EdaDomainRole) => {
  const keywords: string[] = []
  const text = `${stream.path}\n${stream.sample || ''}\n${stream.strings.join('\n')}`.toLowerCase()
  const domainWords = role === 'symbol'
    ? ['pins', 'footprint', 'pspice', 'part', 'symbol']
    : ['units', 'layers', 'padstack', 'drill', 'outline', 'route', 'constraint', 'shape', 'place_bound']
  domainWords.forEach(word => {
    if (text.includes(word)) {
      uniquePush(keywords, word, 12)
    }
  })
  return keywords
}

const appendUniqueProperties = (target: EdaProperty[], properties: EdaProperty[]) => {
  const seen = new Set(target.map(property => `${property.key.toLowerCase()}\u0000${property.value}`))
  properties.forEach(property => {
    const identity = `${property.key.toLowerCase()}\u0000${property.value}`
    if (seen.has(identity)) {
      return
    }
    seen.add(identity)
    target.push(property)
  })
}

const collectEntities = (streams: EdaStreamView[], type: EdaFileType) => {
  const entities = new Map<string, EdaEntity>()
  streams.forEach(stream => {
    const role = entityRoleForStream(stream, type)
    if (!role) {
      return
    }
    const entityPath = streamEntityPath(stream, role)
    const key = `${role}:${entityPath.toLowerCase()}`
    const existing = entities.get(key)
    const entity = existing || {
      id: key,
      name: inferEntityName(stream, role, entityPath),
      role,
      path: entityPath,
      streamCount: 0,
      byteLength: 0,
      properties: [],
      pins: [],
      layers: [],
      keywords: []
    }

    entity.streamCount += 1
    entity.byteLength += stream.size
    appendUniqueProperties(entity.properties, stream.properties)
    splitListValue(getPropertyValue(stream.properties, ['Pins', 'Pin', 'Pin Numbers'])).forEach(pin => uniquePush(entity.pins, pin, 96))
    splitListValue(getPropertyValue(stream.properties, ['Layers', 'Layer'])).forEach(layer => uniquePush(entity.layers, layer, 64))
    roleKeywords(stream, role).forEach(keyword => uniquePush(entity.keywords, keyword, 16))

    entity.description ||= getPropertyValue(entity.properties, ['Description', 'Desc'])
    entity.footprint ||= getPropertyValue(entity.properties, ['Footprint', 'PCB Footprint', 'Package'])
    entities.set(key, entity)
  })

  return Array.from(entities.values()).sort((left, right) => {
    const roleOrder: Record<string, number> = { symbol: 0, footprint: 1, padstack: 2, drawing: 3 }
    const order = (roleOrder[left.role] ?? 9) - (roleOrder[right.role] ?? 9)
    return order || left.name.localeCompare(right.name)
  })
}

const collectMetadata = (streams: EdaStreamView[]) => {
  const metadata: EdaProperty[] = []
  streams.forEach(stream => {
    if (stream.role === 'metadata' || stream.role === 'library' || stream.role === 'drawing') {
      appendUniqueProperties(metadata, stream.properties)
    }
  })
  return metadata.slice(0, 80)
}

const buildStats = (streams: EdaStreamView[], entities: EdaEntity[], strings: string[], parser: EdaParserMode): EdaStats => {
  const stats = {
    textStreams: streams.filter(stream => stream.kind === 'text').length,
    binaryStreams: streams.filter(stream => stream.kind === 'binary').length,
    storageEntries: streams.filter(stream => stream.kind === 'storage').length,
    propertyCount: streams.reduce((sum, stream) => sum + stream.properties.length, 0),
    stringCount: strings.length,
    symbolCount: entities.filter(entity => entity.role === 'symbol').length,
    footprintCount: entities.filter(entity => entity.role === 'footprint').length,
    padstackCount: entities.filter(entity => entity.role === 'padstack').length,
    confidence: 'low' as EdaStats['confidence']
  }

  if (parser === 'cfb' && entities.length && stats.propertyCount) {
    stats.confidence = 'high'
  } else if (parser === 'cfb' || strings.length || stats.propertyCount) {
    stats.confidence = 'medium'
  }
  return stats
}

const buildDiagnostics = (
  type: EdaFileType,
  parser: EdaParserMode,
  streams: EdaStreamView[],
  entities: EdaEntity[],
  strings: string[],
  warnings: string[]
): EdaDiagnostic[] => {
  const diagnostics: EdaDiagnostic[] = warnings.map((message, index) => ({
    level: 'warning',
    code: `warning-${index + 1}`,
    message
  }))

  diagnostics.push({
    level: 'info',
    code: 'parser',
    message: parser === 'cfb'
      ? '已识别为 Microsoft Compound File / OLE2 复合文档容器，并在浏览器端解析目录与流。'
      : '未识别为 CFB 容器，已使用二进制字符串索引模式展示可读信息。'
  })
  diagnostics.push({
    level: 'info',
    code: 'coverage',
    message: `已索引 ${streams.length} 个条目、${strings.length} 个可读字符串、${entities.length} 个 EDA 结构候选。`
  })

  const needsSymbol = type === 'olb' && !entities.some(entity => entity.role === 'symbol')
  const needsFootprint = type === 'dra' && !entities.some(entity => entity.role === 'footprint' || entity.role === 'padstack')
  if (needsSymbol || needsFootprint) {
    diagnostics.push({
      level: 'warning',
      code: 'domain-candidates',
      message: type === 'olb'
        ? '未发现明确的元件符号候选，文件可能使用了私有二进制编码或需要专业工具导出 ASCII/XML 后再检查。'
        : '未发现明确的封装、图形或 padstack 候选，文件可能使用了私有二进制数据库编码。'
    })
  }

  return diagnostics
}

const assembleResult = (
  buffer: ArrayBuffer,
  type: EdaFileType,
  parser: EdaParserMode,
  streamCount: number,
  streams: EdaStreamView[],
  strings: string[],
  warnings: string[]
): EdaParseResult => {
  const totalStreamBytes = streams.reduce((sum, stream) => sum + stream.size, 0)
  const entities = collectEntities(streams, type)
  const metadata = collectMetadata(streams)
  const diagnostics = buildDiagnostics(type, parser, streams, entities, strings, warnings)
  return {
    type,
    parser,
    title: type === 'olb'
      ? (parser === 'cfb' ? 'OrCAD Capture Symbol Library' : 'OLB Binary Library')
      : (parser === 'cfb' ? 'OrCAD / Allegro Drawing Library' : 'DRA Binary Drawing'),
    byteLength: buffer.byteLength,
    streamCount,
    totalStreamBytes,
    streams,
    tree: buildTree(streams, type),
    entities,
    metadata,
    strings,
    warnings,
    diagnostics,
    stats: buildStats(streams, entities, strings, parser)
  }
}

const parseCfbContainer = async (buffer: ArrayBuffer, type: EdaFileType): Promise<EdaParseResult> => {
  const CFB = await import('cfb')
  const container = CFB.parse(toBytes(buffer), { type: 'array' })
  const streamEntries = container.FileIndex
    .map((entry, index) => ({ entry, path: container.FullPaths[index] || entry.name }))
    .filter(item => item.entry.type !== 5 && item.path !== '/' && item.entry.name)
    .slice(0, MAX_STREAMS)

  const byteChunks: Uint8Array[] = []
  const streams = streamEntries.map(({ entry, path }) => {
    if (entry.type === 1) {
      return buildStreamView(type, path, entry.name, entry.size || 0, 'storage')
    }
    const content = normalizeBytes(entry.content || [])
    byteChunks.push(content)
    return buildStreamView(type, path, entry.name, entry.size || content.byteLength || 0, 'binary', content)
  })

  const warnings = streamEntries.length >= MAX_STREAMS
    ? [`仅展示前 ${MAX_STREAMS} 个 CFB 项，完整文件仍可下载后在专业 EDA 工具中打开。`]
    : []

  return assembleResult(buffer, type, 'cfb', container.FileIndex.length, streams, collectStrings(byteChunks), warnings)
}

const parseBinaryFallback = (buffer: ArrayBuffer, type: EdaFileType): EdaParseResult => {
  const bytes = toBytes(buffer)
  const stream = buildStreamView(type, `${type}.${type}`, `${type}.${type}`, buffer.byteLength, 'binary', bytes)
  return assembleResult(buffer, type, 'binary', 1, [stream], collectStrings([bytes]), [
    '该文件不是标准 CFB 容器，已退化为安全的二进制字符串索引预览。'
  ])
}

export const parseEdaFile = async (buffer: ArrayBuffer, type = 'olb') => {
  const normalizedType: EdaFileType = type === 'dra' ? 'dra' : 'olb'
  const bytes = toBytes(buffer)
  if (!isCfbFile(bytes)) {
    return parseBinaryFallback(buffer, normalizedType)
  }
  try {
    return await parseCfbContainer(buffer, normalizedType)
  } catch (error) {
    const fallback = parseBinaryFallback(buffer, normalizedType)
    fallback.warnings.unshift(error instanceof Error ? error.message : String(error))
    fallback.diagnostics.unshift({
      level: 'warning',
      code: 'cfb-parse-failed',
      message: error instanceof Error ? error.message : String(error)
    })
    return fallback
  }
}
