import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Waypoint, NoFlyZone, TerrainPoint, FlightPlan, DroneConfig, NoFlyZoneImpact } from '../types';
import {
  aStarPathfind,
  rrtPathfind,
  smoothPath,
  calculateFlightStats,
  checkTerrainCollision,
  exportKML,
  mockNoFlyZones,
  mockTerrainData,
  analyzeNoFlyZoneImpact,
  analyzeAllNoFlyZoneImpacts,
} from '../utils/pathfinding';

const STORAGE_KEY = 'drone-planner-state-v1';

interface PersistedState {
  waypoints: Waypoint[];
  currentPlan: FlightPlan | null;
  selectedAlgorithm: 'astar' | 'rrt';
  selectedZoneId: string | null;
  simProgress: number;
}

function saveToStorage(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state to localStorage:', e);
  }
}

function loadFromStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e);
    return null;
  }
}

export const useDroneStore = defineStore('drone', () => {
  const persisted = loadFromStorage();

  const waypoints = ref<Waypoint[]>(persisted?.waypoints ?? []);
  const noFlyZones = ref<NoFlyZone[]>([]);
  const terrainData = ref<TerrainPoint[]>([]);
  const currentPlan = ref<FlightPlan | null>(persisted?.currentPlan ?? null);
  const selectedAlgorithm = ref<'astar' | 'rrt'>(persisted?.selectedAlgorithm ?? 'astar');
  const isSimulating = ref(false);
  const simProgress = ref(persisted?.simProgress ?? 0);
  const mapCenter = ref<[number, number]>([39.9, 116.4]);
  const selectedZoneId = ref<string | null>(persisted?.selectedZoneId ?? null);

  const droneConfig = ref<DroneConfig>({
    maxAltitude: 500,
    maxSpeed: 20,
    batteryCapacity: 5000,
    consumptionRate: 100,
    safeDistance: 30,
  });

  // ─── Actions ──────────────────────────────────────────────────────────────
  function addWaypoint(
    lat: number,
    lng: number,
    altitude = 100,
    speed = 10,
    action: Waypoint['action'] = 'none'
  ) {
    const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    waypoints.value.push({ id, lat, lng, altitude, speed, action });
  }

  function removeWaypoint(id: string) {
    waypoints.value = waypoints.value.filter((w) => w.id !== id);
  }

  function updateWaypoint(id: string, updates: Partial<Waypoint>) {
    const wp = waypoints.value.find((w) => w.id === id);
    if (wp) Object.assign(wp, updates);
  }

  function planRoute(start: [number, number], goal: [number, number]) {
    const bounds = { minLat: 39.85, maxLat: 39.95, minLng: 116.35, maxLng: 116.45 };
    let raw: Waypoint[];
    if (selectedAlgorithm.value === 'astar') {
      raw = aStarPathfind(start, goal, 30, noFlyZones.value, bounds);
    } else {
      raw = rrtPathfind(start, goal, noFlyZones.value);
    }
    const smoothed = smoothPath(raw);
    waypoints.value = smoothed;
    updatePlan();
  }

  function clearRoute() {
    waypoints.value = [];
    currentPlan.value = null;
    simProgress.value = 0;
  }

  function updatePlan() {
    const stats = calculateFlightStats(waypoints.value, droneConfig.value);
    currentPlan.value = {
      id: `plan-${Date.now()}`,
      name: 'Flight Plan',
      waypoints: [...waypoints.value],
      totalDistance: stats.totalDistance,
      estimatedTime: stats.estimatedTime,
      batteryUsage: stats.batteryUsage,
    };
  }

  let simInterval: ReturnType<typeof setInterval> | null = null;

  function simulateFlight() {
    if (waypoints.value.length < 2 || isSimulating.value) return;
    isSimulating.value = true;
    simProgress.value = 0;
    simInterval = setInterval(() => {
      simProgress.value += 1;
      if (simProgress.value >= 100) {
        simProgress.value = 100;
        isSimulating.value = false;
        if (simInterval) clearInterval(simInterval);
      }
    }, 50);
  }

  function loadMockData() {
    noFlyZones.value = mockNoFlyZones;
    terrainData.value = mockTerrainData;
  }

  function exportPlan(): string {
    if (!currentPlan.value) return '';
    return exportKML(currentPlan.value);
  }

  function selectZone(zoneId: string | null) {
    selectedZoneId.value = zoneId;
  }

  function clearPersistedState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear persisted state:', e);
    }
  }

  // ─── Auto-persist watches ─────────────────────────────────────────────────
  watch(
    [waypoints, currentPlan, selectedAlgorithm, selectedZoneId, simProgress],
    () => {
      saveToStorage({
        waypoints: waypoints.value,
        currentPlan: currentPlan.value,
        selectedAlgorithm: selectedAlgorithm.value,
        selectedZoneId: selectedZoneId.value,
        simProgress: simProgress.value,
      });
    },
    { deep: true }
  );

  // ─── Computed ─────────────────────────────────────────────────────────────
  const selectedZone = computed<NoFlyZone | null>(() => {
    if (!selectedZoneId.value) return null;
    return noFlyZones.value.find((z) => z.id === selectedZoneId.value) || null;
  });

  const selectedZoneImpact = computed<NoFlyZoneImpact | null>(() => {
    if (!selectedZone.value) return null;
    return analyzeNoFlyZoneImpact(selectedZone.value, waypoints.value);
  });

  const allZoneImpacts = computed<NoFlyZoneImpact[]>(() => {
    return analyzeAllNoFlyZoneImpacts(noFlyZones.value, waypoints.value);
  });

  const totalDistance = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.totalDistance;
  });

  const estimatedTime = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.estimatedTime;
  });

  const batteryPercent = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.batteryUsage;
  });

  const terrainProfile = computed(() => {
    if (waypoints.value.length < 2) return [];
    return waypoints.value.map((wp) => {
      let nearestElev = 0;
      let minDist = Infinity;
      for (const tp of terrainData.value) {
        const d =
          (tp.lat - wp.lat) ** 2 + (tp.lng - wp.lng) ** 2;
        if (d < minDist) {
          minDist = d;
          nearestElev = tp.elevation;
        }
      }
      return {
        lat: wp.lat,
        lng: wp.lng,
        altitude: wp.altitude,
        terrainElevation: nearestElev,
      };
    });
  });

  return {
    waypoints,
    noFlyZones,
    terrainData,
    currentPlan,
    droneConfig,
    selectedAlgorithm,
    isSimulating,
    simProgress,
    mapCenter,
    selectedZoneId,
    selectedZone,
    selectedZoneImpact,
    allZoneImpacts,
    totalDistance,
    estimatedTime,
    batteryPercent,
    terrainProfile,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    planRoute,
    clearRoute,
    simulateFlight,
    loadMockData,
    exportPlan,
    updatePlan,
    selectZone,
    clearPersistedState,
  };
});
