<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDroneStore } from '../store/drone';
import { getRiskColor } from '../utils/pathfinding';

const store = useDroneStore();
const mapContainer = ref<HTMLElement>();
let map: L.Map | null = null;
let waypointLayer: L.LayerGroup | null = null;
let routeLayer: L.LayerGroup | null = null;
let zoneLayer: L.LayerGroup | null = null;
let droneMarker: L.CircleMarker | null = null;

const addMode = ref(false);

function initMap() {
  if (!mapContainer.value || map) return;
  map = L.map(mapContainer.value).setView(store.mapCenter, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18,
  }).addTo(map);

  waypointLayer = L.layerGroup().addTo(map);
  zoneLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (addMode.value) {
      store.addWaypoint(e.latlng.lat, e.latlng.lng);
    }
  });

  drawNoFlyZones();
  drawWaypoints();
  drawRoute();
  drawSimDrone();
}

function drawNoFlyZones() {
  if (!zoneLayer) return;
  zoneLayer.clearLayers();
  for (const zone of store.noFlyZones) {
    const color =
      zone.type === 'airport' ? '#ef4444' :
      zone.type === 'military' ? '#f97316' : '#a855f7';
    const isSelected = store.selectedZoneId === zone.id;
    const circle = L.circle([zone.center[0], zone.center[1]], {
      radius: zone.radius,
      color,
      fillColor: color,
      fillOpacity: isSelected ? 0.3 : 0.15,
      weight: isSelected ? 4 : 2,
    });
    circle.on('click', () => {
      if (store.selectedZoneId === zone.id) {
        store.selectZone(null);
      } else {
        store.selectZone(zone.id);
      }
    });
    circle.bindPopup(`<b>${zone.name}</b><br>类型: ${zone.type}<br>半径: ${zone.radius}m`);
    circle.addTo(zoneLayer);
  }
}

function drawWaypoints() {
  if (!waypointLayer) return;
  waypointLayer.clearLayers();
  store.waypoints.forEach((wp, idx) => {
    const marker = L.circleMarker([wp.lat, wp.lng], {
      radius: 8,
      color: '#3b82f6',
      fillColor: '#60a5fa',
      fillOpacity: 0.9,
      weight: 2,
    });
    marker.bindTooltip(`WP${idx + 1}`, { permanent: true, direction: 'top', className: 'wp-tooltip' });
    marker.bindPopup(`
      <div style="min-width:160px">
        <b>Waypoint ${idx + 1}</b><br>
        Altitude: ${wp.altitude}m<br>
        Speed: ${wp.speed} m/s<br>
        Action: ${wp.action}<br>
        <button onclick="this.closest('.leaflet-popup').remove()" style="margin-top:4px;color:#ef4444">Remove</button>
      </div>
    `);
    marker.on('dragend', (e: any) => {
      const ll = e.target.getLatLng();
      store.updateWaypoint(wp.id, { lat: ll.lat, lng: ll.lng });
    });
    marker.addTo(waypointLayer!);
  });
}

function drawRoute() {
  if (routeLayer) {
    routeLayer.clearLayers();
  } else {
    if (map) {
      routeLayer = L.layerGroup().addTo(map);
    }
  }
  if (!routeLayer || store.waypoints.length < 2 || !map) return;

  const selectedImpact = store.selectedZoneImpact;
  const affectedSegmentIndices = new Set<number>(
    selectedImpact ? selectedImpact.affectedSegments.map((s) => s.segmentIndex) : []
  );
  const segmentRiskMap = new Map<number, string>();
  if (selectedImpact) {
    for (const seg of selectedImpact.affectedSegments) {
      segmentRiskMap.set(seg.segmentIndex, getRiskColor(seg.riskLevel));
    }
  }

  for (let i = 0; i < store.waypoints.length - 1; i++) {
    const wp1 = store.waypoints[i];
    const wp2 = store.waypoints[i + 1];
    const latlngs: [number, number][] = [[wp1.lat, wp1.lng], [wp2.lat, wp2.lng]];

    const isAffected = store.selectedZoneId && affectedSegmentIndices.has(i);
    const riskColor = segmentRiskMap.get(i);

    let color = '#22c55e';
    let weight = 3;
    let dashArray: string | undefined = undefined;
    let opacity = 0.8;

    if (store.selectedZoneId) {
      if (isAffected && riskColor) {
        color = riskColor;
        weight = 6;
        opacity = 1;
        if (riskColor === '#dc2626') dashArray = '10,5';
      } else {
        color = '#475569';
        opacity = 0.4;
      }
    } else {
      let hasDanger = false;
      for (const zone of store.noFlyZones) {
        const d1 = Math.sqrt(
          (wp1.lat - zone.center[0]) ** 2 + (wp1.lng - zone.center[1]) ** 2
        ) * 111000;
        const d2 = Math.sqrt(
          (wp2.lat - zone.center[0]) ** 2 + (wp2.lng - zone.center[1]) ** 2
        ) * 111000;
        if (d1 < zone.radius * 1.5 || d2 < zone.radius * 1.5) hasDanger = true;
      }
      if (hasDanger) {
        color = '#ef4444';
        dashArray = '8,4';
      }
    }

    L.polyline(latlngs, {
      color,
      weight,
      opacity,
      dashArray,
    }).addTo(routeLayer);
  }
}

function drawSimDrone() {
  if (!map || store.waypoints.length < 2) return;
  const progress = store.simProgress / 100;
  const totalWp = store.waypoints.length;
  const segIdx = Math.min(Math.floor(progress * (totalWp - 1)), totalWp - 2);
  const segProgress = (progress * (totalWp - 1)) - segIdx;
  const wp1 = store.waypoints[segIdx];
  const wp2 = store.waypoints[segIdx + 1];
  const lat = wp1.lat + (wp2.lat - wp1.lat) * segProgress;
  const lng = wp1.lng + (wp2.lng - wp1.lng) * segProgress;

  if (droneMarker) {
    droneMarker.setLatLng([lat, lng]);
  } else {
    droneMarker = L.circleMarker([lat, lng], {
      radius: 10,
      color: '#fbbf24',
      fillColor: '#f59e0b',
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
  }
}

watch(() => store.waypoints, () => {
  drawWaypoints();
  drawRoute();
}, { deep: true });

watch(() => store.noFlyZones, drawNoFlyZones, { deep: true });
watch(() => store.selectedZoneId, () => {
  drawNoFlyZones();
  drawRoute();
});
watch(() => store.simProgress, drawSimDrone);

onMounted(() => {
  nextTick(initMap);
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

function toggleAddMode() {
  addMode.value = !addMode.value;
}

function handlePlanRoute() {
  if (store.waypoints.length < 2) return;
  const first = store.waypoints[0];
  const last = store.waypoints[store.waypoints.length - 1];
  store.planRoute([first.lat, first.lng], [last.lat, last.lng]);
}
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="mapContainer" class="w-full h-full rounded-lg" />
    <div class="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
      <button
        @click="toggleAddMode"
        :class="addMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'"
        class="px-3 py-1 rounded text-xs font-medium shadow hover:opacity-90 transition"
      >
        {{ addMode ? '✦ 添加模式' : '○ 点击添加' }}
      </button>
      <button
        @click="handlePlanRoute"
        class="px-3 py-1 rounded text-xs font-medium bg-green-700 text-white shadow hover:opacity-90 transition"
      >
        规划航线
      </button>
      <button
        @click="store.clearRoute()"
        class="px-3 py-1 rounded text-xs font-medium bg-red-700 text-white shadow hover:opacity-90 transition"
      >
        清除
      </button>
    </div>
  </div>
</template>

<style scoped>
:deep(.wp-tooltip) {
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  border: 1px solid #475569;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
}
</style>
