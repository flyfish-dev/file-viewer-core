import { readFileViewerText } from '../source';
import type { FileViewerRenderedInstance } from '../contracts/types';

type Position = [number, number, ...number[]];
type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint'; coordinates: Position[] }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'GeometryCollection'; geometries: Geometry[] };

interface Feature {
  type: 'Feature';
  geometry: Geometry | null;
  properties?: Record<string, unknown>;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GEO_WIDTH = 960;
const GEO_HEIGHT = 620;
const GEO_PADDING = 36;

const geoStyle = `
.geo-viewer{min-height:100%;display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);background:#eef1f4;color:#132235}
.geo-panel{padding:24px;border-right:1px solid rgba(15,23,42,.08);background:#fff;box-sizing:border-box}
.geo-panel>span{color:#0f766e;font-size:12px;font-weight:800}.geo-panel h2{margin:8px 0 22px;font-size:24px}
.geo-panel dl{display:grid;gap:12px;margin:0}.geo-panel dt,.geo-counts strong{color:#64748b;font-size:12px;font-weight:700}.geo-panel dd{margin:4px 0 0;word-break:break-all;font-size:14px}
.geo-counts{margin-top:24px}.geo-counts p{margin:8px 0 0;font-size:14px}
.geo-map{padding:28px;overflow:auto}.geo-map svg{display:block;width:min(100%,1200px);min-width:640px;height:auto;margin:0 auto;overflow:visible}
.geo-map rect{fill:#f8fafc;stroke:rgba(15,23,42,.08)}
.geo-map path{fill:none;stroke:#0f766e;stroke-width:2.2;vector-effect:non-scaling-stroke}.geo-map .geo-polygon{fill:rgba(45,212,191,.18)}
.geo-map circle{fill:#2563eb;stroke:#fff;stroke-width:1.5;vector-effect:non-scaling-stroke}
.geo-state{display:flex;align-items:center;justify-content:center;min-height:280px;border-radius:8px;background:rgba(255,255,255,.82);color:#64748b}
.geo-state.error{color:#b42318}
.file-viewer[data-viewer-theme='dark'] .geo-viewer{background:#101820;color:#e5edf6}.file-viewer[data-viewer-theme='dark'] .geo-panel{background:#111827;border-color:rgba(148,163,184,.18)}.file-viewer[data-viewer-theme='dark'] .geo-panel dt,.file-viewer[data-viewer-theme='dark'] .geo-counts strong{color:#94a3b8}.file-viewer[data-viewer-theme='dark'] .geo-map rect{fill:#111827;stroke:rgba(148,163,184,.18)}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .geo-viewer{background:#101820;color:#e5edf6}.file-viewer[data-viewer-theme='system'] .geo-panel{background:#111827;border-color:rgba(148,163,184,.18)}.file-viewer[data-viewer-theme='system'] .geo-panel dt,.file-viewer[data-viewer-theme='system'] .geo-counts strong{color:#94a3b8}.file-viewer[data-viewer-theme='system'] .geo-map rect{fill:#111827;stroke:rgba(148,163,184,.18)}}
@media (max-width:860px){.geo-viewer{grid-template-columns:1fr}.geo-panel{border-right:0;border-bottom:1px solid rgba(15,23,42,.08)}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = geoStyle;
  return style;
};

const createSvgElement = <K extends keyof SVGElementTagNameMap>(tag: K) => {
  return document.createElementNS(SVG_NS, tag);
};

const normalizeGeoJson = (value: unknown): FeatureCollection => {
  const candidate = value as {
    type?: string;
    coordinates?: unknown;
    features?: unknown;
    geometry?: unknown;
  };
  if (candidate?.type === 'FeatureCollection' && Array.isArray(candidate.features)) {
    return candidate as FeatureCollection;
  }
  if (candidate?.type === 'Feature') {
    return { type: 'FeatureCollection', features: [candidate as Feature] };
  }
  if (candidate?.type && candidate.coordinates) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: candidate as Geometry, properties: {} }],
    };
  }
  throw new Error('无法识别的 GeoJSON 数据');
};

const parseXml = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error(error.textContent || 'XML 解析失败');
  }
  return doc;
};

const normalizeGeoType = (type?: string) => {
  const normalized = (type || 'geojson').trim().toLowerCase();
  if (normalized === 'json') {
    return 'geojson';
  }
  if (normalized === 'shapefile') {
    return 'shp';
  }
  return normalized;
};

const parseGeo = async (buffer: ArrayBuffer, type: string): Promise<FeatureCollection> => {
  if (type === 'geojson') {
    return normalizeGeoJson(JSON.parse(await readFileViewerText(buffer)));
  }
  if (type === 'kml' || type === 'gpx') {
    const toGeoJSON = await import('@tmcw/togeojson');
    const doc = parseXml(await readFileViewerText(buffer));
    return normalizeGeoJson(type === 'kml' ? toGeoJSON.kml(doc) : toGeoJSON.gpx(doc));
  }
  if (type === 'shp') {
    const { default: shp } = await import('shpjs');
    return normalizeGeoJson(await shp(buffer));
  }
  throw new Error(`不支持 .${type} 地理格式`);
};

const walkPositions = (geometry: Geometry | null, visit: (position: Position) => void) => {
  if (!geometry) {
    return;
  }
  switch (geometry.type) {
    case 'Point':
      visit(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      geometry.coordinates.forEach(visit);
      break;
    case 'MultiLineString':
    case 'Polygon':
      geometry.coordinates.forEach(line => line.forEach(visit));
      break;
    case 'MultiPolygon':
      geometry.coordinates.forEach(polygon => polygon.forEach(line => line.forEach(visit)));
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach(item => walkPositions(item, visit));
      break;
  }
};

const collectBounds = (features: Feature[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  features.forEach(feature => {
    walkPositions(feature.geometry, position => {
      const [x, y] = position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
};

const projectPosition = (position: Position, bounds: Bounds | null) => {
  if (!bounds) {
    return [GEO_WIDTH / 2, GEO_HEIGHT / 2] as const;
  }
  const xRange = Math.max(1e-9, bounds.maxX - bounds.minX);
  const yRange = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.min((GEO_WIDTH - GEO_PADDING * 2) / xRange, (GEO_HEIGHT - GEO_PADDING * 2) / yRange);
  const xOffset = (GEO_WIDTH - xRange * scale) / 2;
  const yOffset = (GEO_HEIGHT - yRange * scale) / 2;
  const x = xOffset + (position[0] - bounds.minX) * scale;
  const y = GEO_HEIGHT - (yOffset + (position[1] - bounds.minY) * scale);
  return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
};

const pathLine = (positions: Position[], bounds: Bounds | null, close = false) => {
  const points = positions
    .filter(position => Number.isFinite(position[0]) && Number.isFinite(position[1]))
    .map(position => projectPosition(position, bounds));
  if (!points.length) {
    return '';
  }
  const [first, ...rest] = points;
  const body = [`M${first[0]} ${first[1]}`, ...rest.map(point => `L${point[0]} ${point[1]}`)];
  if (close) {
    body.push('Z');
  }
  return body.join(' ');
};

const appendGeometry = (parent: SVGGElement, geometry: Geometry | null, bounds: Bounds | null) => {
  if (!geometry) {
    return;
  }
  switch (geometry.type) {
    case 'Point': {
      const [x, y] = projectPosition(geometry.coordinates, bounds);
      const circle = createSvgElement('circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '4');
      parent.appendChild(circle);
      break;
    }
    case 'MultiPoint':
      geometry.coordinates.forEach(position => appendGeometry(parent, { type: 'Point', coordinates: position }, bounds));
      break;
    case 'LineString': {
      const path = createSvgElement('path');
      path.setAttribute('d', pathLine(geometry.coordinates, bounds));
      parent.appendChild(path);
      break;
    }
    case 'MultiLineString':
      geometry.coordinates.forEach(line => appendGeometry(parent, { type: 'LineString', coordinates: line }, bounds));
      break;
    case 'Polygon':
      geometry.coordinates.forEach(line => {
        const path = createSvgElement('path');
        path.classList.add('geo-polygon');
        path.setAttribute('d', pathLine(line, bounds, true));
        parent.appendChild(path);
      });
      break;
    case 'MultiPolygon':
      geometry.coordinates.forEach(polygon => {
        appendGeometry(parent, { type: 'Polygon', coordinates: polygon }, bounds);
      });
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach(item => appendGeometry(parent, item, bounds));
      break;
  }
};

const buildGeometryCounts = (features: Feature[]) => {
  const counts = new Map<string, number>();
  features.forEach(feature => {
    const key = feature.geometry?.type || 'Null';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()];
};

const formatBounds = (bounds: Bounds | null) => {
  if (!bounds) {
    return '-';
  }
  return `${bounds.minX.toFixed(5)}, ${bounds.minY.toFixed(5)} -> ${bounds.maxX.toFixed(5)}, ${bounds.maxY.toFixed(5)}`;
};

const appendDescriptionItem = (list: HTMLDListElement, label: string, value: string | number) => {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = String(value);
  row.append(term, detail);
  list.appendChild(row);
};

const renderCollection = (collection: FeatureCollection, type: string) => {
  const root = document.createElement('div');
  root.className = 'geo-viewer';
  const features = collection.features || [];
  const bounds = collectBounds(features);

  const panel = document.createElement('aside');
  panel.className = 'geo-panel';
  const badge = document.createElement('span');
  badge.textContent = type.toUpperCase();
  const heading = document.createElement('h2');
  heading.textContent = '地理数据预览';
  const description = document.createElement('dl');
  appendDescriptionItem(description, '要素数', features.length);
  appendDescriptionItem(description, '范围', formatBounds(bounds));
  const counts = document.createElement('div');
  counts.className = 'geo-counts';
  const countsHeading = document.createElement('strong');
  countsHeading.textContent = '几何类型';
  counts.appendChild(countsHeading);
  buildGeometryCounts(features).forEach(([name, count]) => {
    const row = document.createElement('p');
    row.textContent = `${name}: ${count}`;
    counts.appendChild(row);
  });
  panel.append(badge, heading, description, counts);

  const map = document.createElement('main');
  map.className = 'geo-map';
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${GEO_WIDTH} ${GEO_HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '地理数据 SVG 预览');
  const rect = createSvgElement('rect');
  rect.setAttribute('width', String(GEO_WIDTH));
  rect.setAttribute('height', String(GEO_HEIGHT));
  rect.setAttribute('rx', '8');
  const group = createSvgElement('g');
  features.forEach(feature => appendGeometry(group, feature.geometry, bounds));
  svg.append(rect, group);
  map.appendChild(svg);

  root.append(panel, map);
  return root;
};

export default async function renderGeo(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> {
  const normalizedType = normalizeGeoType(type);
  const style = createStyle();
  const state = document.createElement('div');
  state.className = 'geo-state';
  state.textContent = '正在解析地理数据...';
  target.replaceChildren(style, state);

  try {
    const collection = await parseGeo(buffer, normalizedType);
    target.replaceChildren(style, renderCollection(collection, normalizedType));
  } catch (error) {
    console.error(error);
    state.classList.add('error');
    state.textContent = error instanceof Error ? error.message : String(error);
  }

  return {
    $el: target,
    unmount() {
      target.replaceChildren();
    },
  };
}
