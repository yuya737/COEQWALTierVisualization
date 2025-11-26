<script setup>
import { ref } from "vue";
import AnimatedTierTreemap from "./components/AnimatedTierTreemap.vue";
import MapView from "./components/MapView.vue";

const selectedPolygons = ref([]);

const handlePolygonSelect = (polygonData) => {
  selectedPolygons.value = polygonData;
};
</script>

<template>
  <div class="w-full h-screen flex flex-row">
    <div class="h-full flex-[5] bg-white shadow">
      <AnimatedTierTreemap class="h-full" @polygon-select="handlePolygonSelect" />
    </div>
    <div class="h-full flex-[2] bg-white shadow p-5">
      <MapView :polygons="selectedPolygons" />
    </div>
  </div>
</template>
