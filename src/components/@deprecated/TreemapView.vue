<template>
  <div class="w-full h-full p-5 bg-white flex flex-col">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold text-gray-800">Water Volume Treemap</h2>
      <select
        v-model="currentScenario"
        class="px-4 py-2.5 border border-gray-300 rounded-md text-sm font-semibold cursor-pointer bg-white text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <option
          v-for="scenario in availableScenarios"
          :key="scenario.scenario_code"
          :value="scenario.scenario_code"
        >
          {{ scenario.scenario_code }}
        </option>
      </select>
    </div>
    <div class="flex-1 overflow-hidden">
      <svg ref="svgRef" class="w-full h-full"></svg>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import * as d3 from "d3";
import { fetchData, fetchAvailableScenarios } from "../../utils";

const svgRef = ref(null);
const currentScenario = ref("s0011");
const availableScenarios = ref([]);
let objectives = [];

const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const categoryColors = d3.scaleOrdinal(d3.schemeSet3);

const drawTreemap = () => {
  if (!svgRef.value || objectives.length === 0) return;

  // Clear previous content
  d3.select(svgRef.value).selectAll("*").remove();

  // Get container dimensions
  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const width = containerRect?.width || 800;
  const height = containerRect?.height || 600;

  const svg = d3
    .select(svgRef.value)
    .attr("width", width)
    .attr("height", height);

  // Group objectives by category
  const groupedByCategory = d3.group(objectives, (d) => d.category);

  // Create hierarchical data structure
  const data = {
    name: "root",
    children: Array.from(groupedByCategory, ([category, objs]) => ({
      name: category,
      children: objs.map((obj) => ({
        name: `${obj.id}`,
        value: obj.waterVolume,
        tier: obj.tier,
        category: obj.category,
        id: obj.id,
      })),
    })),
  };

  // Create treemap layout
  const root = d3
    .hierarchy(data)
    .sum((d) => d.value)
    .sort((a, b) => b.value - a.value);

  d3.treemap().size([width, height]).padding(2).round(true)(root);

  // Create color scale for water volume
  const waterVolumeExtent = d3.extent(objectives, (d) => d.waterVolume);
  const colorScale = d3
    .scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2))
    .domain(waterVolumeExtent);

  // Draw cells
  const cell = svg
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  cell
    .append("rect")
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("fill", (d) => colorScale(d.data.value))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#333").attr("stroke-width", 3);

      // Show tooltip
      showTooltip(event, d.data);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke", "#fff").attr("stroke-width", 2);

      hideTooltip();
    });

  // Add text labels for larger cells
  cell
    .append("text")
    .attr("x", 4)
    .attr("y", 16)
    .text((d) => {
      const cellWidth = d.x1 - d.x0;
      const cellHeight = d.y1 - d.y0;
      // Only show text if cell is large enough
      if (cellWidth > 40 && cellHeight > 20) {
        return d.data.category;
      }
      return "";
    })
    .attr("font-size", "10px")
    .attr("fill", "#333")
    .attr("font-weight", "600");

  // Add water volume text
  cell
    .append("text")
    .attr("x", 4)
    .attr("y", 28)
    .text((d) => {
      const cellWidth = d.x1 - d.x0;
      const cellHeight = d.y1 - d.y0;
      if (cellWidth > 40 && cellHeight > 35) {
        return `${Math.round(d.data.value)}`;
      }
      return "";
    })
    .attr("font-size", "9px")
    .attr("fill", "#555");
};

const tooltipDiv = ref(null);

const showTooltip = (event, data) => {
  if (!tooltipDiv.value) {
    tooltipDiv.value = d3
      .select("body")
      .append("div")
      .attr("class", "treemap-tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("z-index", "1000");
  }

  tooltipDiv.value
    .style("opacity", 1)
    .html(
      `<strong>ID:</strong> ${data.id}<br/>
       <strong>Category:</strong> ${data.category}<br/>
       <strong>Tier:</strong> ${data.tier}<br/>
       <strong>Water Volume:</strong> ${Math.round(data.value)}`
    )
    .style("left", event.pageX + 10 + "px")
    .style("top", event.pageY - 10 + "px");
};

const hideTooltip = () => {
  if (tooltipDiv.value) {
    tooltipDiv.value.style("opacity", 0);
  }
};

const loadData = async () => {
  const result = await fetchData(currentScenario.value, tiers);
  objectives = result.data || [];
  console.log("Loaded objectives for treemap:", objectives);
  drawTreemap();
};

const handleResize = () => {
  drawTreemap();
};

onMounted(async () => {
  // Fetch available scenarios
  const scenarios = await fetchAvailableScenarios();
  availableScenarios.value = scenarios;

  // Load initial data
  await loadData();

  // Add resize listener
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  if (tooltipDiv.value) {
    tooltipDiv.value.remove();
  }
});

watch(currentScenario, async () => {
  await loadData();
});
</script>

<style scoped>
svg {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
}
</style>
