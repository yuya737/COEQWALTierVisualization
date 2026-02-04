<script setup>
import { ref } from "vue";
import AnimatedTierTreemap from "./components/AnimatedTierTreemap.vue";
import MapView from "./components/MapView.vue";
import UIOnboarding from "./components/UIOnboarding.vue";

const selectedPolygons = ref([]);
const selectedObjectives = ref([]);

const handlePolygonSelect = (polygonData) => {
  selectedPolygons.value = polygonData;
};

const handleObjectivesSelect = (objectives) => {
  selectedObjectives.value = objectives;
};
</script>

<template>
  <div class="w-full h-screen flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
    <!-- Main visualization - full width on mobile, 7/9 on desktop -->
    <div class="min-h-screen md:min-h-0 md:h-full flex-1 md:flex-[7] bg-white shadow">
      <AnimatedTierTreemap
        class="h-full"
        @polygon-select="handlePolygonSelect"
        @objectives-select="handleObjectivesSelect"
      />
    </div>
    <!-- Map - full width on mobile, 2/9 on desktop -->
    <div
      class="min-h-screen md:min-h-0 md:h-full flex-1 md:flex-[2] bg-white shadow p-3 md:p-5 flex flex-col gap-4"
    >
      <div class="flex-1 min-h-0" data-tour="map">
        <MapView :polygons="selectedPolygons" />
      </div>
    </div>
    <UIOnboarding />
  </div>
</template>
