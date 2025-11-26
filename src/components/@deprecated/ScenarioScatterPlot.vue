<template>
  <div class="w-full h-full p-5 bg-white flex flex-col">
    <h2 class="text-xl font-semibold text-gray-800 mb-4">
      Scenario Tier Scatterplot
    </h2>
    <div class="flex-1 flex items-center justify-center">
      <svg ref="svgRef"></svg>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import * as d3 from "d3";
import {
  fetchAvailableScenarios,
  fetchData,
  calculateMeanTier,
} from "../../utils";

const svgRef = ref(null);
const scenarios = ref([]);

const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const baselineScenario = "s0020";

const drawPlot = () => {
  if (!svgRef.value) return;

  // Clear previous content
  d3.select(svgRef.value).selectAll("*").remove();

  // Get container dimensions dynamically
  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const containerWidth = containerRect?.width * 0.75 || 800;
  const containerHeight = containerRect?.height || 600;

  // Dimensions
  const margin = { top: 40, right: 60, bottom: 100, left: 80 };
  const width = Math.max(containerWidth - margin.left - margin.right, 400);
  const height = Math.max(containerHeight - margin.top - margin.bottom, 300);

  // Create SVG
  const svg = d3
    .select(svgRef.value)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales
  const xScale = d3
    .scaleLinear()
    .domain([4, 1]) // Inverted scale
    .range([0, width]);

  const yScale = d3.scaleLinear().domain([1, 4]).range([0, height]);

  // Quadrant backgrounds based on baseline scenario
  const baseline = scenarios.value.find((s) => s.isBaseline);
  const baselineMeanTier = baseline?.meanTier || 2.5;
  const baselineWeightedMeanTier = baseline?.weightedMeanTier || 2.5;

  const midX = xScale(baselineMeanTier);
  const midY = yScale(baselineWeightedMeanTier);

  // Top-right quadrant (green)
  svg
    .append("rect")
    .attr("x", midX)
    .attr("y", 0)
    .attr("width", width - midX)
    .attr("height", midY)
    .attr("fill", "#d4edda")
    .attr("opacity", 0.5);

  // Bottom-right quadrant (green)
  // svg
  //   .append("rect")
  //   .attr("x", midX)
  //   .attr("y", midY)
  //   .attr("width", width - midX)
  //   .attr("height", height - midY)
  //   .attr("fill", "#d4edda")
  //   .attr("opacity", 0.5);

  // Bottom-left quadrant (red/pink)
  svg
    .append("rect")
    .attr("x", 0)
    .attr("y", midY)
    .attr("width", midX)
    .attr("height", height - midY)
    .attr("fill", "#f8d7da")
    .attr("opacity", 0.5);

  // Grid
  svg
    .append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).tickSize(-height).tickFormat(""))
    .style("stroke-dasharray", "3,3")
    .style("opacity", 0.3);

  // Axes
  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale));

  svg.append("g").call(d3.axisLeft(yScale));

  // Axis labels
  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 45)
    .style("font-size", "1rem")
    .text("Mean Tier");

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("y", -60)
    .attr("x", -height / 2)
    .style("font-size", "1rem")
    .text("Weighted Mean Tier");

  // Quadrant labels
  const labelStyle = {
    "font-size": "13px",
    fill: "#666",
    "text-anchor": "middle",
  };

  // // Top-left label
  // svg
  //   .append("text")
  //   .attr("x", midX / 2)
  //   .attr("y", midY / 2 - 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("Lower mean, but fewer nodes");

  // svg
  //   .append("text")
  //   .attr("x", midX / 2)
  //   .attr("y", midY / 2 + 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("in higher tiers");

  // // Top-right label
  // svg
  //   .append("text")
  //   .attr("x", midX + (width - midX) / 2)
  //   .attr("y", midY / 2 - 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("Higher mean and fewer");

  // svg
  //   .append("text")
  //   .attr("x", midX + (width - midX) / 2)
  //   .attr("y", midY / 2 + 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("nodes in higher tiers");

  // // Bottom-left label
  // svg
  //   .append("text")
  //   .attr("x", midX / 2)
  //   .attr("y", midY + (height - midY) / 2 - 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("Lower mean and more");

  // svg
  //   .append("text")
  //   .attr("x", midX / 2)
  //   .attr("y", midY + (height - midY) / 2 + 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("nodes in higher tiers");

  // // Bottom-right label
  // svg
  //   .append("text")
  //   .attr("x", midX + (width - midX) / 2)
  //   .attr("y", midY + (height - midY) / 2 - 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("Higher mean, but more");

  // svg
  //   .append("text")
  //   .attr("x", midX + (width - midX) / 2)
  //   .attr("y", midY + (height - midY) / 2 + 10)
  //   .style("font-size", labelStyle["font-size"])
  //   .style("fill", labelStyle.fill)
  //   .style("text-anchor", labelStyle["text-anchor"])
  //   .text("nodes in higher");

  // Plot points
  scenarios.value.forEach((scenario) => {
    const cx = xScale(scenario.meanTier);
    const cy = yScale(scenario.weightedMeanTier);

    // Draw circle
    svg
      .append("circle")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 8)
      .attr("fill", scenario.isBaseline ? "#dc3545" : "#007bff")
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    // Draw label
    svg
      .append("text")
      .attr("x", cx + 12)
      .attr("y", cy + 4)
      .style("font-size", "0.9rem")
      .style("font-weight", "600")
      .text(scenario.name);
  });
};

const loadScenarios = async () => {
  const availableScenarios = await fetchAvailableScenarios();
  console.log("Available scenarios:", availableScenarios);

  const scenarioData = [];
  for (const scenario of availableScenarios) {
    const result = await fetchData(scenario.scenario_code, tiers);
    if (result.data) {
      const meanTier = calculateMeanTier(result.data);
      scenarioData.push({
        name: scenario.scenario_code,
        meanTier: meanTier,
        weightedMeanTier: meanTier, // Using same value for now
        isBaseline: scenario.scenario_code === baselineScenario,
      });
    }
  }

  // Add random synthetic scenarios for visualization
  for (let i = 0; i < 15; i++) {
    scenarioData.push({
      name: `random`,
      meanTier: 1 + Math.random() * 3, // Random between 1 and 4
      weightedMeanTier: 1 + Math.random() * 3, // Random between 1 and 4
      isBaseline: false,
    });
  }

  scenarios.value = scenarioData;
  console.log("Loaded scenarios:", scenarios.value);
  drawPlot();
};

onMounted(() => {
  loadScenarios();
});

watch(
  scenarios,
  () => {
    drawPlot();
  },
  { deep: true }
);

// Redraw on window resize
const handleResize = () => {
  drawPlot();
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
.grid line {
  stroke: lightgrey;
  stroke-opacity: 0.7;
}
.grid path {
  stroke-width: 0;
}
</style>
