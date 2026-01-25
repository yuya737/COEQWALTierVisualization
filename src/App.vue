<script setup>
import { ref } from "vue";
import AnimatedTierTreemap from "./components/AnimatedTierTreemap.vue";
import MapView from "./components/MapView.vue";
import SelectedObjectivesList from "./components/SelectedObjectivesList.vue";

const treemapRef = ref(null);
const selectedPolygons = ref([]);
const allObjectives = ref([]);
const selectedObjectives = ref([]);
const searchBarVal = ref('');

const handlePolygonSelect = (polygonData) => {
  selectedPolygons.value = polygonData;
};

const handleObjectivesSelect = (objectives) => {
  selectedObjectives.value = objectives;
};

const initAllObjectives = (objectives) => {
  allObjectives.value = objectives;
};

const searchObjectives = () => {
  if (!Array.isArray(allObjectives.value)) {
    console.error("allObjectives is not ready:", allObjectives.value);
    return;
  }

  var input = Number(searchBarVal.value);
  console.log("Searching for objectives with ID containing: " + input);
  console.log("objectives.value:", allObjectives);

  if (!input && input !== 0) {
    return;
  }

  const match = allObjectives.value.filter(
    obj => obj.id === input
  );

  // Find objective with ID match
  selectedObjectives.value = match;
  treemapRef.value.updateMapFromSelection(match);
};
</script>

<template>
  <div class="w-full h-screen flex flex-row">
    <div class="h-full flex-[5] bg-white shadow">
      <AnimatedTierTreemap
        class="h-full"
        ref="treemapRef"
        @objectives-init="initAllObjectives"
        @polygon-select="handlePolygonSelect"
        @objectives-select="handleObjectivesSelect"
      />
    </div>
    <div class="h-full flex-[2] bg-white shadow p-5 flex flex-col gap-4">
      <SelectedObjectivesList :selectedObjectives="selectedObjectives" />
      <input type="text" v-model="searchBarVal" @keyup="searchObjectives" id="searchObjectivesBar" placeholder="Search for objectives by ID" />
      <div class="flex-1 min-h-0">
        <MapView :polygons="selectedPolygons" />
      </div>
    </div>
  </div>
</template>
