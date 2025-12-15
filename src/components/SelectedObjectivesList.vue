<template>
  <div class="w-full border border-gray-200 rounded-lg p-4 bg-white">
    <h3 class="text-lg font-semibold mb-3 text-gray-800">
      Selected Objectives
    </h3>
    <div class="overflow-y-auto pr-2" style="height: 200px">
      <div
        v-if="selectedObjectives.length === 0"
        class="text-gray-500 text-sm"
      >
        Click on a cell or category to see objectives
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="obj in selectedObjectives"
          :key="obj.id"
          class="p-3 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div class="text-sm font-semibold text-gray-800">
            {{ obj.category }}
          </div>
          <div class="text-xs text-gray-600 mt-1">
            <span class="font-medium">ID:</span> {{ obj.id }} |
            <span class="font-medium">Tier:</span> {{ obj.tier }}
            <span v-if="obj.baselineTier">
              | <span class="font-medium">Baseline:</span>
              {{ obj.baselineTier }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from "vue";

const props = defineProps({
  selectedObjectives: {
    type: Array,
    default: () => [],
  },
});
</script>

<style scoped>
/* Custom scrollbar styling */
div::-webkit-scrollbar {
  width: 6px;
}

div::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

div::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

div::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
