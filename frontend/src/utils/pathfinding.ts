import type { Waypoint, NoFlyZone, TerrainPoint, FlightPlan, DroneConfig } from '../types';

// ─── Haversine distance ─────────────────────────────────────────────────────
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── A* Pathfinding ─────────────────────────────────────────────────────────
interface GridNode {
  lat: number;
  lng: number;
  row: number;
  col: number;
  g: number;
  h: number;
  f: number;
  parent: GridNode | null;
}

export function aStarPathfind(
  start: [number, number],
  goal: [number, number],
  gridSize: number,
  noFlyZones: NoFlyZone[],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): Waypoint[] {
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const rows = gridSize;
  const cols = gridSize;
  const dLat = (maxLat - minLat) / rows;
  const dLng = (maxLng - minLng) / cols;

  const isBlocked = (lat: number, lng: number): boolean => {
    for (const zone of noFlyZones) {
      const d = haversine(lat, lng, zone.center[0], zone.center[1]);
      if (d < zone.radius) return true;
    }
    return false;
  };

  const toRow = (lat: number) => Math.round((lat - minLat) / dLat);
  const toCol = (lng: number) => Math.round((lng - minLng) / dLng);
  const toLat = (row: number) => minLat + row * dLat;
  const toLng = (col: number) => minLng + col * dLng;

  const startRow = toRow(start[0]);
  const startCol = toCol(start[1]);
  const goalRow = toRow(goal[0]);
  const goalCol = toCol(goal[1]);

  const heuristic = (r: number, c: number) =>
    haversine(toLat(r), toLng(c), goal[0], goal[1]);

  const open: GridNode[] = [];
  const closed = new Set<string>();

  const startNode: GridNode = {
    lat: toLat(startRow),
    lng: toLng(startCol),
    row: startRow,
    col: startCol,
    g: 0,
    h: heuristic(startRow, startCol),
    f: heuristic(startRow, startCol),
    parent: null,
  };
  open.push(startNode);

  const dirs = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  let iterations = 0;
  while (open.length > 0 && iterations < 10000) {
    iterations++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const key = `${current.row},${current.col}`;

    if (current.row === goalRow && current.col === goalCol) {
      const path: Waypoint[] = [];
      let n: GridNode | null = current;
      let idx = 0;
      while (n) {
        path.unshift({
          id: `wp-a-${idx++}`,
          lat: n.lat,
          lng: n.lng,
          altitude: 100,
          speed: 10,
          action: 'none',
        });
        n = n.parent;
      }
      return path;
    }

    closed.add(key);

    for (const [dr, dc] of dirs) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nKey = `${nr},${nc}`;
      if (closed.has(nKey)) continue;

      const nLat = toLat(nr);
      const nLng = toLng(nc);
      if (isBlocked(nLat, nLng)) continue;

      const moveCost = dr !== 0 && dc !== 0 ? 1.414 : 1;
      const g = current.g + moveCost * haversine(current.lat, current.lng, nLat, nLng);
      const h = heuristic(nr, nc);

      const existing = open.find((n) => n.row === nr && n.col === nc);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        }
      } else {
        open.push({ lat: nLat, lng: nLng, row: nr, col: nc, g, h, f: g + h, parent: current });
      }
    }
  }

  // fallback: straight line
  return [
    { id: 'wp-fallback-0', lat: start[0], lng: start[1], altitude: 100, speed: 10, action: 'none' as const },
    { id: 'wp-fallback-1', lat: goal[0], lng: goal[1], altitude: 100, speed: 10, action: 'none' as const },
  ];
}

// ─── RRT Pathfinding ────────────────────────────────────────────────────────
export function rrtPathfind(
  start: [number, number],
  goal: [number, number],
  noFlyZones: NoFlyZone[],
  maxIter = 500
): Waypoint[] {
  interface RRTNode {
    lat: number;
    lng: number;
    parent: RRTNode | null;
  }

  const isCollision = (lat: number, lng: number): boolean => {
    for (const zone of noFlyZones) {
      if (haversine(lat, lng, zone.center[0], zone.center[1]) < zone.radius) return true;
    }
    return false;
  };

  const tree: RRTNode[] = [{ lat: start[0], lng: start[1], parent: null }];
  const stepSize = 0.005; // ~500m in degrees

  const nearest = (lat: number, lng: number): RRTNode => {
    let best = tree[0];
    let bestD = Infinity;
    for (const n of tree) {
      const d = (n.lat - lat) ** 2 + (n.lng - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };

  for (let i = 0; i < maxIter; i++) {
    let sampleLat: number, sampleLng: number;
    if (Math.random() < 0.1) {
      sampleLat = goal[0];
      sampleLng = goal[1];
    } else {
      sampleLat = start[0] + (goal[0] - start[0]) * (Math.random() * 2 - 0.5);
      sampleLng = start[1] + (goal[1] - start[1]) * (Math.random() * 2 - 0.5);
    }

    const near = nearest(sampleLat, sampleLng);
    const dx = sampleLat - near.lat;
    const dy = sampleLng - near.lng;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;

    const newLat = near.lat + (dx / dist) * Math.min(stepSize, dist);
    const newLng = near.lng + (dy / dist) * Math.min(stepSize, dist);

    if (isCollision(newLat, newLng)) continue;

    const newNode: RRTNode = { lat: newLat, lng: newLng, parent: near };
    tree.push(newNode);

    if (haversine(newLat, newLng, goal[0], goal[1]) < 500) {
      const goalNode: RRTNode = { lat: goal[0], lng: goal[1], parent: newNode };
      tree.push(goalNode);
      const path: Waypoint[] = [];
      let n: RRTNode | null = goalNode;
      let idx = 0;
      while (n) {
        path.unshift({
          id: `wp-r-${idx++}`,
          lat: n.lat,
          lng: n.lng,
          altitude: 100,
          speed: 10,
          action: 'none',
        });
        n = n.parent;
      }
      return path;
    }
  }

  return [
    { id: 'wp-rf-0', lat: start[0], lng: start[1], altitude: 100, speed: 10, action: 'none' as const },
    { id: 'wp-rf-1', lat: goal[0], lng: goal[1], altitude: 100, speed: 10, action: 'none' as const },
  ];
}

// ─── Catmull-Rom Spline Smoothing ───────────────────────────────────────────
export function smoothPath(waypoints: Waypoint[], segments = 5): Waypoint[] {
  if (waypoints.length < 3) return [...waypoints];

  const result: Waypoint[] = [waypoints[0]];

  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  };

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[Math.min(waypoints.length - 1, i + 1)];
    const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];

    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      result.push({
        id: `wp-smooth-${i}-${s}`,
        lat: cr(p0.lat, p1.lat, p2.lat, p3.lat, t),
        lng: cr(p0.lng, p1.lng, p2.lng, p3.lng, t),
        altitude: cr(p0.altitude, p1.altitude, p2.altitude, p3.altitude, t),
        speed: cr(p0.speed, p1.speed, p2.speed, p3.speed, t),
        action: p1.action,
      });
    }
  }

  return result;
}

// ─── Flight Statistics ──────────────────────────────────────────────────────
export function calculateFlightStats(waypoints: Waypoint[], config: DroneConfig) {
  let totalDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDistance += haversine(
      waypoints[i - 1].lat, waypoints[i - 1].lng,
      waypoints[i].lat, waypoints[i].lng
    );
  }

  const avgSpeed = waypoints.reduce((s, w) => s + w.speed, 0) / (waypoints.length || 1);
  const estimatedTime = totalDistance / (avgSpeed || 1); // seconds
  const flightMinutes = estimatedTime / 60;
  const batteryUsage = (flightMinutes * config.consumptionRate / config.batteryCapacity) * 100;

  return {
    totalDistance,
    estimatedTime,
    batteryUsage: Math.min(100, batteryUsage),
  };
}

// ─── Terrain Collision Check ────────────────────────────────────────────────
export function checkTerrainCollision(
  waypoints: Waypoint[],
  terrain: TerrainPoint[],
  safeDistance = 30
): { safe: boolean; collisions: { wp: Waypoint; terrainElev: number }[] } {
  const collisions: { wp: Waypoint; terrainElev: number }[] = [];

  for (const wp of waypoints) {
    let nearestElev = 0;
    let minDist = Infinity;
    for (const tp of terrain) {
      const d = haversine(wp.lat, wp.lng, tp.lat, tp.lng);
      if (d < minDist) {
        minDist = d;
        nearestElev = tp.elevation;
      }
    }
    if (wp.altitude < nearestElev + safeDistance) {
      collisions.push({ wp, terrainElev: nearestElev });
    }
  }

  return { safe: collisions.length === 0, collisions };
}

// ─── KML Export ─────────────────────────────────────────────────────────────
export function exportKML(plan: FlightPlan): string {
  const coords = plan.waypoints
    .map((w) => `            ${w.lng},${w.lat},${w.altitude}`)
    .join('\n');

  const placemarks = plan.waypoints
    .map(
      (w, i) => `    <Placemark>
      <name>WP${i + 1}</name>
      <description>Alt: ${w.altitude}m, Speed: ${w.speed}m/s, Action: ${w.action}</description>
      <Point><coordinates>${w.lng},${w.lat},${w.altitude}</coordinates></Point>
    </Placemark>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${plan.name}</name>
    <Placemark>
      <name>Flight Route</name>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
${coords}
        </coordinates>
      </LineString>
    </Placemark>
${placemarks}
  </Document>
</kml>`;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────
export const mockNoFlyZones: NoFlyZone[] = [
  {
    id: 'nfz-1',
    name: '首都国际机场',
    center: [40.0799, 116.6031],
    radius: 8000,
    type: 'airport',
  },
  {
    id: 'nfz-2',
    name: '南苑军事区',
    center: [39.7833, 116.3833],
    radius: 5000,
    type: 'military',
  },
  {
    id: 'nfz-3',
    name: '中南海限制区',
    center: [39.9139, 116.3741],
    radius: 3000,
    type: 'restricted',
  },
];

export const mockTerrainData: TerrainPoint[] = (() => {
  const points: TerrainPoint[] = [];
  const baseLat = 39.85;
  const baseLng = 116.35;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      const lat = baseLat + i * 0.005;
      const lng = baseLng + j * 0.005;
      // Simulate hilly terrain
      const elevation =
        50 +
        30 * Math.sin(i * 0.5) * Math.cos(j * 0.4) +
        20 * Math.sin(i * 0.3 + j * 0.2) +
        10 * Math.cos(i * 0.7 - j * 0.5);
      points.push({ lat, lng, elevation });
    }
  }
  return points;
})();
