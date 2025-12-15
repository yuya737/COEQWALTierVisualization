<script setup>
import { ref } from "vue";
import AnimatedTierTreemap from "./components/AnimatedTierTreemap.vue";
import MapView from "./components/MapView.vue";
import SelectedObjectivesList from "./components/SelectedObjectivesList.vue";

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
  <div class="w-full h-screen flex flex-row">
    <div class="h-full flex-[5] bg-white shadow">
      <AnimatedTierTreemap
        class="h-full"
        @polygon-select="handlePolygonSelect"
        @objectives-select="handleObjectivesSelect"
      />
    </div>
    <div class="h-full flex-[2] bg-white shadow p-5 flex flex-col gap-4">
      <SelectedObjectivesList :selectedObjectives="selectedObjectives" />
      <div class="flex-1 min-h-0">
        <MapView :polygons="selectedPolygons" />
      </div>
    </div>
  </div>
</template>
