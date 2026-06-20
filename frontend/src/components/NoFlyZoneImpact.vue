<script setup lang="ts">
import { useDroneStore } from '../store/drone';
import {
  getRiskColor,
  getZoneTypeLabel,
} from '../utils/pathfinding';
import type { RiskLevel } from '../types';

const store = useDroneStore();

function riskLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
    none: '无',
  };
  return labels[level];
}

function zoneColor(type: string): string {
  return (
    type === 'airport' ? '#ef4444' :
    type === 'military' ? '#f97316' : '#a855f7'
  );
}

function handleSelect(zoneId: string) {
  if (store.selectedZoneId === zoneId) {
    store.selectZone(null);
  } else {
    store.selectZone(zoneId);
  }
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-red-500"></span>
      禁飞区影响说明
    </h3>

    <div class="flex flex-wrap gap-2 text-[10px] text-slate-400">
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#dc2626"></span>严重</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#f97316"></span>高</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#eab308"></span>中</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#22c55e"></span>低</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#64748b"></span>无</span>
    </div>

    <div v-if="store.noFlyZones.length === 0" class="text-xs text-slate-500 py-2 text-center">
      暂无禁飞区数据
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="impact in store.allZoneImpacts"
        :key="impact.zoneId"
        class="bg-slate-900 rounded border border-slate-700 cursor-pointer transition"
        :class="store.selectedZoneId === impact.zoneId ? 'ring-2 ring-sky-500 border-sky-500' : 'hover:border-slate-600'"
        @click="handleSelect(impact.zoneId)"
      >
        <div class="p-2 flex items-center justify-between">
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ background: zoneColor(impact.zoneType) }"
            ></span>
            <div class="min-w-0">
              <div class="text-xs font-semibold text-slate-200 truncate">{{ impact.zoneName }}</div>
              <div class="text-[10px] text-slate-500">{{ getZoneTypeLabel(impact.zoneType) }}</div>
            </div>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
            :style="{ backgroundColor: getRiskColor(impact.overallRiskLevel) + '25', color: getRiskColor(impact.overallRiskLevel) }"
          >
            {{ riskLabel(impact.overallRiskLevel) }}风险
          </span>
        </div>

        <div
          v-if="store.selectedZoneId === impact.zoneId"
          class="border-t border-slate-700 p-2 space-y-2"
        >
          <div class="text-[11px] leading-relaxed" :style="{ color: getRiskColor(impact.overallRiskLevel) }">
            {{ impact.description }}
          </div>

          <div v-if="impact.affectedSegments.length === 0" class="text-[11px] text-slate-500 py-1">
            当前航线不受此禁飞区影响。
          </div>

          <div v-else class="space-y-1.5">
            <div class="text-[11px] text-slate-400 font-medium">
              受影响航段 ({{ impact.affectedSegments.length }})
            </div>
            <div
              v-for="seg in impact.affectedSegments"
              :key="seg.segmentIndex"
              class="bg-slate-800 rounded px-2 py-1.5 space-y-1"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-slate-200">
                  {{ seg.startWaypointName }} → {{ seg.endWaypointName }}
                </span>
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  :style="{ backgroundColor: getRiskColor(seg.riskLevel) + '25', color: getRiskColor(seg.riskLevel) }"
                >
                  {{ riskLabel(seg.riskLevel) }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <div>最近距离: <span class="text-slate-300">{{ seg.minDistance.toFixed(0) }}m</span></div>
                <div v-if="seg.penetrateDistance > 0">侵入深度: <span class="text-red-400">{{ seg.penetrateDistance.toFixed(0) }}m</span></div>
              </div>
            </div>
          </div>

          <div v-if="impact.affectedSegments.length > 0" class="grid grid-cols-2 gap-1 text-[10px] text-slate-500 pt-1 border-t border-slate-700">
            <div>受影响总航程:</div>
            <div class="text-right text-slate-300">{{ (impact.totalAffectedDistance / 1000).toFixed(2) }} km</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
