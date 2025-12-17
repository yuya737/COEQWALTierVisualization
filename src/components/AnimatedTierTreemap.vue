<template>
  <div
    class="w-full h-full bg-white p-5 relative flex flex-col overflow-hidden"
  >
    <div class="flex justify-between items-center mb-5 mt-3">
      <h2 class="text-2xl font-semibold text-gray-800 m-0">
        {{
          showComparison
            ? `Viewing scenario ${currentScenario} against ${baselineScenario}`
            : `Viewing scenario ${currentScenario}`
        }}
      </h2>
      <div class="flex gap-3 justify-end">
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
        <select
          v-model="colorMode"
          class="px-4 py-2.5 border border-gray-300 rounded-md text-sm font-semibold cursor-pointer bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <option value="default">Default</option>
          <option value="tier">Tier Colors</option>
          <option value="category">Category Colors</option>
          <option value="waterVolume">Water Volume Colors</option>
        </select>
        <button
          @click="toggleComparison"
          :disabled="viewMode !== 'tier'"
          class="px-5 py-2.5 border border-gray-300 rounded-md text-sm font-semibold transition-colors"
          :class="
            viewMode !== 'tier'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : showComparison
              ? 'bg-gray-200 text-gray-800 cursor-pointer'
              : 'bg-white text-gray-700 hover:bg-gray-50 cursor-pointer'
          "
        >
          {{
            showComparison ? "Hide Baseline Comparison" : "Compare to Baseline"
          }}
        </button>
        <div class="flex gap-2 items-center">
          <label class="text-sm font-semibold text-gray-700">View:</label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              value="tier"
              v-model="viewMode"
              @change="switchView"
              class="cursor-pointer"
            />
            <span class="text-sm">Tier Grid</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              value="treemap"
              v-model="viewMode"
              @change="switchView"
              class="cursor-pointer"
            />
            <span class="text-sm">Treemap</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              value="barplot"
              v-model="viewMode"
              @change="switchView"
              class="cursor-pointer"
            />
            <span class="text-sm">Equity Bar Plot</span>
          </label>
        </div>
      </div>
    </div>
    <div class="flex-1 overflow-auto">
      <svg ref="svgRef"></svg>
    </div>
  </div>
</template>

<script setup lang="js">
import { ref, onMounted, watch } from "vue";
import * as d3 from "d3";
import {
  fetchData,
  fetchAvailableScenarios,
  fetchShortCodes,
  fetchGeoShapes,
} from "../utils";
import GW_STOR from "../GW_STOR"
import RES_STOR from "../RES_STOR";

import {
  calculateBarPlotPositions, calculateTierPositions, calculateTreemapPositions, calculateCategoryWidths
} from "../UnitVisPositionCalculation"

const emit = defineEmits(["polygon-select", "objectives-select"]);

const svgRef = ref(null);
const currentScenario = ref("s0011");
const baselineScenario = ref("s0020");
const availableScenarios = ref([]);
const viewMode = ref("tier");
const showComparison = ref(false);
const colorMode = ref("default"); // "default", "tier", "category", or "waterVolume"
const selectedObjectives = ref([]);
let objectives = [];
let categories = [];
let svg = null;
let tierShortList = [];
let geoJSONs = {};
let cellLayouts = new Map();

const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const margin = { top: 60, right: 50, bottom: 150, left: 100 };

const colors = {
  grayColor: "#D1D5DB",
  lightBlue: "#93C5FD",
  defaultBlue: "#2c7fb8",
  redColor: "#F87171",
};

const tierColorMap = {
  "Tier 1": [74, 200, 167],    // Muted green
  "Tier 2": [120, 165, 250],   // Muted blue
  "Tier 3": [253, 212, 103],   // Muted yellow
  "Tier 4": [244, 126, 126],   // Muted red
};

// Category color scale
const categoryColorScale = d3.scaleOrdinal(d3.schemeTableau10);

// Function to trigger polygon drawing in MapView
const drawPolygonsOnMap = (objective) => {
  if (!objective) {
    emit("polygon-select", []);
    return;
  }
  const short_code = tierShortList.find(
    (tier) => tier.name === objective.category
  )?.short_code;
  if (!short_code || !geoJSONs[short_code]) {
    console.warn("No geoshapes found for category:", objective.category);
    return;
  }
  const withinCategoryIndex = objective.withinCategoryIndex;
  console.log("Drawing polygon for objective:", objective, short_code, withinCategoryIndex);
  const polygonswithoutColor =
    geoJSONs[short_code]["features"][
      withinCategoryIndex % geoJSONs[short_code]["features"].length
    ];

  let polygonsWithColor = null;
  const initFillColor = tierColorMap[objective.tier];
  polygonsWithColor = {
    ...polygonswithoutColor,
    properties: {
      ...polygonswithoutColor.properties,
      fillColor: initFillColor
    },
  };

  emit("polygon-select", [polygonsWithColor]);
};

// Function to show all polygons for a category
const drawAllPolygonsForCategory = (categoryName) => {
  if (!categoryName) {
    emit("polygon-select", []);
    selectedObjectives.value = [];
    emit("objectives-select", []);
    return;
  }
  const short_code = tierShortList.find(
    (tier) => tier.name === categoryName
  )?.short_code;
  if (!short_code || !geoJSONs[short_code]) {
    console.warn("No geoshapes found for category:", categoryName);
    return;
  }

  const categoryObjectives = objectives.filter(
    (obj) => obj.category === categoryName
  );
  selectedObjectives.value = categoryObjectives;
  emit("objectives-select", categoryObjectives);

  // debugger
  const polygonsWithColor = geoJSONs[short_code]["features"].map((feature, index) => {
    const obj = categoryObjectives[index % categoryObjectives.length];
    return {
      ...feature,
      properties: {
        ...feature.properties,
        fillColor: tierColorMap[obj.tier]
      },
    };
  });

  console.log("Polygons for category:", categoryName, polygonsWithColor);

  emit("polygon-select", polygonsWithColor);
};

const switchView = () => {
  console.log("Switched view mode to:", viewMode.value);
  // Disable comparison mode when switching away from tier mode
  if (viewMode.value !== "tier" && showComparison.value) {
    showComparison.value = false;
    initializeVisualization(true); // Animate when switching modes
  } else {
    animateTransition(true); // Animate normal mode transitions
  }
};

const toggleComparison = () => {
  showComparison.value = !showComparison.value;
  // Reinitialize without animation for comparison mode
  initializeVisualization(false);
};

const drawTierCells = (width, height) => {
  if (viewMode.value !== 'tier' || cellLayouts.size === 0) {
      svg.selectAll(".tier-cell-group").remove();
      svg.select("defs").remove();
      return;
  }
  
  // Remove existing elements before redraw
  svg.selectAll(".tier-cell-group").remove();
  svg.select("defs").remove();

  const defs = svg.append("defs");
  
  const cellData = Array.from(cellLayouts.entries()).map(([key, layout]) => ({
      key,
      ...layout,
  }));

  // Create clip paths
  defs
    .selectAll(".cell-clip-path")
    .data(cellData)
    .enter()
    .append("clipPath")
    .attr("id", (d) => `clip-${d.key.replace(/[^a-zA-Z0-9]/g, "")}`) // Generate a safe ID
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", (d) => d.width)
    .attr("height", (d) => d.height);

  // Create cell container groups (translated to the cell's top-left absolute position)
  const cellGroups = svg
    .selectAll(".tier-cell-group")
    .data(cellData, (d) => d.key)
    .enter()
    .append("g")
    .attr("class", "tier-cell-group")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    // Apply the clip-path. The clip-path rect is relative to the group's origin (0,0)
    .attr("clip-path", (d) => `url(#clip-${d.key.replace(/[^a-zA-Z0-9]/g, "")})`);

  // --- Implement D3 Drag for Vertical Scrolling ---
  const drag = d3
    .drag()
    .on("start", function(event) {
        // Disable text selection during drag for a smoother experience
        d3.select("body").style("cursor", "grabbing").style("user-select", "none");
    })
    .on("drag", function (event, d) {
      // Find the inner content group
      const contentGroup = d3.select(this).select(".cell-content-g");
      if (contentGroup.empty()) return;

      // Get current translation from the transform attribute
      const transform = contentGroup.attr("transform");
      const currentYMatch = transform ? transform.match(/translate\(\s*[^,]+,\s*([^)]+)\)/) : null;
      const currentY = currentYMatch ? parseFloat(currentYMatch[1]) : 0;
      
      const newY = currentY + event.dy;
      
      // Calculate min and max y translation
      const maxScroll = 0; // Top limit is 0
      const minScroll = Math.min(0, d.height - d.contentHeight); // Max downward scroll

      const clampedY = Math.max(minScroll, Math.min(maxScroll, newY));

      // Apply the new vertical translation
      contentGroup
        .attr("transform", `translate(0, ${clampedY})`);
    })
    .on("end", function(event) {
        d3.select("body").style("cursor", null).style("user-select", null);
    })
    .filter((event, d) => {
        // Only enable dragging if content overflows cell height
        return d.contentHeight > d.height;
    });

  // Apply drag behavior to the outer cell group
  cellGroups.call(drag);

  // Add the inner <g> which will contain the dots and be translated/scrolled
  cellGroups
    .selectAll(".cell-content-g")
    .data((d) => [d]) // Bind the same data to create one inner group per cell group
    .enter()
    .append("g")
    .attr("class", "cell-content-g")
    .attr("transform", "translate(0, 0)"); // Initial position is 0,0 relative to the parent tier-cell-group
};

const drawLabelsAndGrid = (width, height) => {
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  const cellHeight = gridHeight / tiers.length;

  // Remove old labels and axes
  svg.selectAll(".tier-label").remove();
  svg.selectAll(".category-label-group").remove();
  svg.selectAll(".grid-line").remove();
  svg.selectAll(".y-axis").remove();
  svg.selectAll(".axis-label").remove();

  // Draw y-axis for barplot mode
  if (viewMode.value === "barplot") {
    const plotHeight = height - margin.top - margin.bottom;
    const maxUnmetDemand = d3.max(objectives, (d) => d.unmetDemand);

    // Create y-scale
    const yScale = d3
      .scaleLinear()
      .domain([0, maxUnmetDemand])
      .range([margin.top + plotHeight, margin.top]);

    // Create y-axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${d}`);

    // Append y-axis
    svg
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(yAxis)
      .style("font-size", "11px");

    // Y-axis label
    svg
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + plotHeight / 2))
      .attr("y", margin.left - 40)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .text("Unmet Demand (TAF)");

    return;
  }

  if (viewMode.value === "tier") {
    drawTierCells(width, height);
  }
  else {
    return;
  }

  // Calculate variable category widths
  const categoryLayouts = calculateCategoryWidths(objectives, categories, gridWidth);

  // Grid lines - vertical lines at category boundaries
  categoryLayouts.forEach((layout, i) => {
    svg
      .append("line")
      .attr("class", "grid-line")
      .attr("x1", margin.left + layout.startX)
      .attr("y1", margin.top)
      .attr("x2", margin.left + layout.startX)
      .attr("y2", margin.top + gridHeight)
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 1);
  });

  // Add final vertical line at the end
  svg
    .append("line")
    .attr("class", "grid-line")
    .attr("x1", margin.left + gridWidth)
    .attr("y1", margin.top)
    .attr("x2", margin.left + gridWidth)
    .attr("y2", margin.top + gridHeight)
    .attr("stroke", "#D1D5DB")
    .attr("stroke-width", 1);

  // Horizontal grid lines
  tiers.forEach((_, i) => {
    svg
      .append("line")
      .attr("class", "grid-line")
      .attr("x1", margin.left)
      .attr("y1", margin.top + i * cellHeight)
      .attr("x2", margin.left + gridWidth)
      .attr("y2", margin.top + i * cellHeight)
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 1);
  });

  // Tier labels
  svg
    .selectAll(".tier-label")
    .data(tiers)
    .enter()
    .append("text")
    .attr("class", "tier-label")
    .attr("x", margin.left - 10)
    .attr("y", (d, i) => margin.top + i * cellHeight + cellHeight / 2)
    .attr("text-anchor", "end")
    .attr("alignment-baseline", "middle")
    .style("font-size", "1rem")
    .text((d) => d);

  // Category labels
  const categoryGroups = svg
    .selectAll(".category-label-group")
    .data(categoryLayouts)
    .enter()
    .append("g")
    .attr("class", "category-label-group")
    .attr(
      "transform",
      (layout) => {
        const x_trans = margin.left + layout.startX + layout.width / 2;
        const y_trans = margin.top + gridHeight + 25;
        return `translate(${x_trans}, ${y_trans}) rotate(90)`;
      }
    )
    .style("cursor", "pointer");

  categoryGroups.each(function (d) {
    const group = d3.select(this);

    const bg = group
      .append("rect")
      .attr("class", "category-bg")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "#F9FAFB")
      .attr("stroke", "#E5E7EB")
      .attr("stroke-width", 1);

    const text = group
      .append("text")
      .attr("class", "category-label")
      .attr("text-anchor", "start")
      .attr("y", 0)
      .style("font-size", "0.875rem")
      .style("font-weight", "500")
      .style("fill", "#4B5563")
      .each(function (d) {
        const words = d.category.split(" ");
        const lineHeight = 14;
        let line = [];
        let lineNumber = 0;

        words.forEach((word) => {
          line.push(word);
          const testLine = line.join(" ");

          if (line.length > 3 || (line.length > 1 && testLine.length > 15)) {
            line.pop();
            d3.select(this)
              .append("tspan")
              .attr("x", 0)
              .attr("dy", lineNumber === 0 ? 0 : lineHeight)
              .text(line.join(" "));
            line = [word];
            lineNumber++;
          }
        });

        if (line.length > 0) {
          d3.select(this)
            .append("tspan")
            .attr("x", 0)
            .attr("dy", lineNumber === 0 ? 0 : lineHeight)
            .text(line.join(" "));
        }
      });

    const bbox = text.node().getBBox();
    const padding = 6;
    bg.attr("x", bbox.x - padding)
      .attr("y", bbox.y - padding)
      .attr("width", bbox.width + padding * 2)
      .attr("height", bbox.height + padding * 2);

    group
      .on("mouseover", function () {
        d3.select(this)
          .select(".category-bg")
          .transition()
          .duration(150)
          .attr("fill", "#F3F4F6")
          .attr("stroke", "#D1D5DB");
      })
      .on("mouseout", function () {
        d3.select(this)
          .select(".category-bg")
          .transition()
          .duration(150)
          .attr("fill", "#F9FAFB")
          .attr("stroke", "#E5E7EB");
      })
      .on("click", function (_event, d) {
        drawAllPolygonsForCategory(d.category);
      });
  });
};

const drawTierBackgrounds = (width, height) => {
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;
  const cellHeight = gridHeight / tiers.length;

  const tierColors = ["#ECFDF5", "#EFF6FF", "#FEFCE8", "#FEF2F2"];

  const backgrounds = svg
    .selectAll(".tier-background")
    .data(tiers)
    .join("rect")
    .attr("class", "tier-background")
    .attr("x", margin.left)
    .attr("width", gridWidth)
    .attr("height", cellHeight)
    .attr("stroke", "#D1D5DB")
    .attr("stroke-width", 0.5);

  backgrounds
    .attr("y", (d, i) => margin.top + i * cellHeight)
    .attr("fill", (d, i) => tierColors[i])
    .attr("opacity", viewMode.value === "tier" ? 1 : 0);

  return backgrounds;
};

const drawLegends = (width, height) => {
  // Remove old legends
  svg.selectAll(".legend-item").remove();
  svg.selectAll(".legend-gradient").remove();

  // Comparison mode legend (only in tier mode with comparison)
  if (viewMode.value === "tier" && showComparison.value) {
    const legendX = margin.left;
    const legendY = height - margin.bottom + 60;
    const legendItemSize = 18;
    const legendSpacing = 120;

    // Up triangle (improved)
    const upPath = `M ${legendX},${legendY - legendItemSize * 0.4} L ${
      legendX + legendItemSize * 0.45
    },${legendY + legendItemSize * 0.4} L ${legendX - legendItemSize * 0.45},${
      legendY + legendItemSize * 0.4
    } Z`;
    svg
      .append("path")
      .attr("class", "legend-item")
      .attr("d", upPath)
      .attr("fill", colors.defaultBlue);
    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Improved");

    // Square (no change)
    svg
      .append("rect")
      .attr("class", "legend-item")
      .attr("x", legendX + legendSpacing - legendItemSize / 2)
      .attr("y", legendY - legendItemSize / 2)
      .attr("width", legendItemSize)
      .attr("height", legendItemSize)
      .attr("fill", colors.lightBlue);
    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX + legendSpacing + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("No Change");

    // Down triangle (worsened)
    const downPath = `M ${legendX + legendSpacing * 2},${
      legendY + legendItemSize * 0.4
    } L ${legendX + legendSpacing * 2 + legendItemSize * 0.45},${
      legendY - legendItemSize * 0.4
    } L ${legendX + legendSpacing * 2 - legendItemSize * 0.45},${
      legendY - legendItemSize * 0.4
    } Z`;
    svg
      .append("path")
      .attr("class", "legend-item")
      .attr("d", downPath)
      .attr("fill", colors.redColor);
    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX + legendSpacing * 2 + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Worsened");

    // Gray dotted box (baseline)
    svg
      .append("rect")
      .attr("class", "legend-item")
      .attr("x", legendX + legendSpacing * 3 - legendItemSize / 2)
      .attr("y", legendY - legendItemSize / 2)
      .attr("width", legendItemSize)
      .attr("height", legendItemSize)
      .attr("stroke", colors.lightBlue)
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "2.5,2.5")
      .attr("fill", "none");
    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX + legendSpacing * 3 + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Baseline");
  }

  // Water volume legend (when water volume color mode is active)
  if (colorMode.value === "waterVolume") {
    const waterVolumeExtent = d3.extent(objectives, (d) => d.waterVolume);
    const colorScale = d3
      .scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2))
      .domain(waterVolumeExtent);

    const legendX = width - 200;
    const legendY = height - margin.bottom + 80;
    const gradientWidth = 150;
    const gradientHeight = 20;

    // Define gradient
    const gradientId = "waterVolumeGradient";
    svg.selectAll(`#${gradientId}`).remove();
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("x2", "100%");

    // Add color stops
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const value =
        waterVolumeExtent[0] +
        t * (waterVolumeExtent[1] - waterVolumeExtent[0]);
      gradient
        .append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", colorScale(value));
    }

    // Draw gradient rectangle
    svg
      .append("rect")
      .attr("class", "legend-gradient")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", gradientWidth)
      .attr("height", gradientHeight)
      .style("fill", `url(#${gradientId})`)
      .attr("stroke", "#999")
      .attr("stroke-width", 1);

    // Add labels
    svg
      .append("text")
      .attr("class", "legend-gradient")
      .attr("x", legendX)
      .attr("y", legendY - 5)
      .style("font-size", "0.9rem")
      .style("font-weight", "600")
      .text("Water Volume (Random)");

    svg
      .append("text")
      .attr("class", "legend-gradient")
      .attr("x", legendX)
      .attr("y", legendY + gradientHeight + 15)
      .style("font-size", "0.8rem")
      .text(`${Math.round(waterVolumeExtent[0])} TAF`);

    svg
      .append("text")
      .attr("class", "legend-gradient")
      .attr("x", legendX + gradientWidth)
      .attr("y", legendY + gradientHeight + 15)
      .attr("text-anchor", "end")
      .style("font-size", "0.8rem")
      .text(`${Math.round(waterVolumeExtent[1])} TAF`);
  }

  // Treemap note
  if (viewMode.value === "treemap") {
    const legendX = margin.left;
    const legendY = height - margin.bottom + 60;

    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX)
      .attr("y", legendY)
      .style("font-size", "1rem")
      .style("font-weight", "600")
      .text("Box Size = Water Volume (Currently Random)");
  }

  // Bar plot legend (when in barplot mode and not in water volume color mode)
  if (viewMode.value === "barplot" && colorMode.value !== "waterVolume") {
    const unmetDemandExtent = d3.extent(objectives, (d) => d.unmetDemand);

    const legendX = margin.left;
    const legendY = height - margin.bottom + 60;

    // Title
    svg
      .append("text")
      .attr("class", "legend-item")
      .attr("x", legendX)
      .attr("y", legendY)
      .style("font-size", "1rem")
      .style("font-weight", "600")
      .text("Bar Height = Unmet Demand or similar metric that determines the amount of water required to meet some equity definition (Currently Random)")

  }

  // Category legend (when category color mode is active)
  if (colorMode.value === "category") {
    const legendX = margin.left;
    const legendY = height - margin.bottom + 90;
    const colorBoxSize = 14;
    const itemSpacing = 15;
    const rowSpacing = 22;
    const itemsPerRow = Math.ceil(categories.length / 2);

    // Add legend items for each category (two-row horizontal layout)
    let currentX = legendX;
    let currentRow = 0;

    categories.forEach((category, i) => {
      // Move to second row after half the items
      if (i === itemsPerRow) {
        currentX = legendX;
        currentRow = 1;
      }

      const yPos = legendY - 10 + (currentRow * rowSpacing);

      // Color box
      svg
        .append("rect")
        .attr("class", "legend-item")
        .attr("x", currentX)
        .attr("y", yPos)
        .attr("width", colorBoxSize)
        .attr("height", colorBoxSize)
        .attr("fill", categoryColorScale(category))
        .attr("stroke", "#999")
        .attr("stroke-width", 1);

      // Category name
      const text = svg
        .append("text")
        .attr("class", "legend-item")
        .attr("x", currentX + colorBoxSize + 5)
        .attr("y", yPos + colorBoxSize / 2)
        .attr("alignment-baseline", "middle")
        .style("font-size", "0.75rem")
        .text(category);

      // Calculate width of this item for next position
      const textWidth = text.node().getComputedTextLength();
      currentX += colorBoxSize + 5 + textWidth + itemSpacing;
    });
  }

  // Tier legend (when tier color mode is active)
  if (colorMode.value === "tier" && !showComparison.value) {
    const legendX = margin.left;
    const legendY = height - margin.bottom + 90;
    const colorBoxSize = 14;
    const itemSpacing = 15;
    const rowSpacing = 22;
    const itemsPerRow = Math.ceil(tiers.length / 2);

    // Add legend items for each tier (two-row horizontal layout)
    let currentX = legendX;
    let currentRow = 0;

    tiers.forEach((tier, i) => {
      // Move to second row after half the items
      if (i === itemsPerRow) {
        currentX = legendX;
        currentRow = 1;
      }

      const yPos = legendY - 10 + (currentRow * rowSpacing);
      const tierColor = tierColorMap[tier];

      // Color box
      svg
        .append("rect")
        .attr("class", "legend-item")
        .attr("x", currentX)
        .attr("y", yPos)
        .attr("width", colorBoxSize)
        .attr("height", colorBoxSize)
        .attr("fill", `rgb(${tierColor[0]}, ${tierColor[1]}, ${tierColor[2]})`)
        .attr("stroke", "#999")
        .attr("stroke-width", 1);

      // Tier name
      const text = svg
        .append("text")
        .attr("class", "legend-item")
        .attr("x", currentX + colorBoxSize + 5)
        .attr("y", yPos + colorBoxSize / 2)
        .attr("alignment-baseline", "middle")
        .style("font-size", "0.75rem")
        .text(tier);

      // Calculate width of this item for next position
      const textWidth = text.node().getComputedTextLength();
      currentX += colorBoxSize + 5 + textWidth + itemSpacing;
    });
  }
};

const animateTransition = (shouldAnimate = true) => {
  if (!svg || objectives.length === 0) return;

  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const width = containerRect?.width || 800;
  const height = containerRect?.height || 600;

  const duration = shouldAnimate ? 1500 : 0;

  // Animate tier backgrounds
  svg
    .selectAll(".tier-background")
    .transition()
    .duration(duration)
    .attr("opacity", viewMode.value === "tier" ? 1 : 0);

  const { positions: tierPositions, cellLayouts: newCellLayouts } = calculateTierPositions(objectives, categories, tiers, width, height, showComparison.value);
  cellLayouts = newCellLayouts; // Update global state

  // Draw/remove labels and grid
  drawLabelsAndGrid(width, height);

  // Draw legends
  drawLegends(width, height);

  console.log("Calculated tier positions:", tierPositions);
  const treemapPositions = calculateTreemapPositions(objectives, width, height);
  const barPlotPositions = calculateBarPlotPositions(objectives, width, height);

  const tierPosMap = new Map(tierPositions.map((p) => [p.id, p]));
  const treemapPosMap = new Map(treemapPositions.map((p) => [p.id, p]));
  const barPlotPosMap = new Map(barPlotPositions.map((p) => [p.id, p]));

  // Color scale
  const waterVolumeExtent = d3.extent(objectives, (d) => d.waterVolume);
  const colorScale = d3
    .scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2))
    .domain(waterVolumeExtent);

  // Determine fill color
  const getFillColor = (d, targetMode) => {
    // Water volume mode - always use water volume colors
    if (colorMode.value === "waterVolume") {
      return colorScale(d.waterVolume);
    }

    // Category mode - always use category colors
    if (colorMode.value === "category") {
      return categoryColorScale(d.category);
    }

    // Tier mode
    if (colorMode.value === "tier") {
      // In comparison mode, use comparison colors
      if (showComparison.value) {
        const currentTierNum = tiers.indexOf(d.tier);
        const baselineTierNum = tiers.indexOf(d.baselineTier);

        if (currentTierNum === baselineTierNum) {
          return colors.lightBlue;
        } else if (currentTierNum < baselineTierNum) {
          return colors.defaultBlue;
        } else {
          return colors.redColor;
        }
      }

      // In normal mode, use tier colors
      const tierColor = tierColorMap[d.tier];
      if (tierColor) {
        return `rgb(${tierColor[0]}, ${tierColor[1]}, ${tierColor[2]})`;
      }
      return colors.defaultBlue;
    }

    // Default mode - use default blue (or comparison colors if in comparison mode)
    if (colorMode.value === "default") {
      if (showComparison.value) {
        const currentTierNum = tiers.indexOf(d.tier);
        const baselineTierNum = tiers.indexOf(d.baselineTier);

        if (currentTierNum === baselineTierNum) {
          return colors.lightBlue;
        } else if (currentTierNum < baselineTierNum) {
          return colors.defaultBlue;
        } else {
          return colors.redColor;
        }
      }
      return colors.defaultBlue;
    }

    // Fallback
    return colors.defaultBlue;
  };

  // Create shape paths
  const createPath = (d, pos) => {
    if (pos.shape === "triangle-up") {
      const cx = pos.x + pos.width / 2;
      const cy = pos.y + pos.height / 2;
      const w = pos.width * 0.9;
      const h = pos.height * 1;
      return `M ${cx},${cy - h / 2} L ${cx + w / 2},${cy + h / 2} L ${
        cx - w / 2
      },${cy + h / 2} Z`;
    } else if (pos.shape === "triangle-down") {
      const cx = pos.x + pos.width / 2;
      const cy = pos.y + pos.height / 2;
      const w = pos.width * 0.9;
      const h = pos.height * 1;
      return `M ${cx},${cy + h / 2} L ${cx + w / 2},${cy - h / 2} L ${
        cx - w / 2
      },${cy - h / 2} Z`;
    }
    return null;
  };

  const getTargetContainer = (d) => {
      if (viewMode.value === 'tier') {
          // In tier mode, shapes must go into the cell-content-g
          const tier = d.obj.tier;
          const category = d.obj.category;
          const key = `${tier}-${category}`.replace(/[^a-zA-Z0-9]/g, "");
          return svg.select(`.tier-cell-group[clip-path*='${key}'] .cell-content-g`);
      }
      // In other modes, shapes stay on the main svg
      return svg;
  };

  // Update shapes
  const allData =
    viewMode.value === "tier"
      ? tierPositions
      : viewMode.value === "treemap"
      ? treemapPositions
      : barPlotPositions;
  const shapes = svg.selectAll(".animated-shape").data(allData, (d) => d.id);

  // Enter
  const enterShapes = shapes
    .enter()
    .append("path")
    .attr("class", "animated-shape")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .attr("fill", (d) => getFillColor(d.obj, viewMode.value));

  // Set initial positions
  enterShapes.each(function (d) {
    // Start from a different view mode
    let startPos;
    if (viewMode.value === "tier") {
      startPos = treemapPosMap.get(d.id) || barPlotPosMap.get(d.id);
    } else if (viewMode.value === "treemap") {
      startPos = tierPosMap.get(d.id) || barPlotPosMap.get(d.id);
    } else {
      // barplot
      startPos = tierPosMap.get(d.id) || treemapPosMap.get(d.id);
    }
    if (!startPos) return;

    svg.node().appendChild(this);

    const path = createPath(d.obj, startPos);
    if (path) {
      d3.select(this).attr("d", path);
    } else {
      d3.select(this).attr(
        "d",
        `M ${startPos.x},${startPos.y} h ${startPos.width} v ${startPos.height} h -${startPos.width} Z`
      );
    }

    if (startPos.shape === "baseline-rect") {
      const worsened = d.obj.tier > d.obj.baselineTier;
      d3.select(this)
        .attr("stroke", worsened ? colors.redColor : colors.lightBlue)
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "2.5,2.5")
        .attr("fill", "none");
    }
  });

  // Merge
  const allShapes = enterShapes.merge(shapes);

  allShapes.each(function (d) {
      const targetContainer = getTargetContainer(d);
      if (!targetContainer.empty()) {
          // Only re-parent if the current parent is not the target container
          if (d3.select(this.parentNode).node() !== targetContainer.node()) {
              targetContainer.node().appendChild(this);
          }
      } else {
          // Fallback: move to main SVG
          svg.node().appendChild(this);
      }
  });

  // Transition
  allShapes
    .transition()
    .duration(duration)
    .ease(d3.easeCubicOut)
    .attr("d", (d) => {
      let targetPos;
      if (viewMode.value === "tier") {
        targetPos = tierPosMap.get(d.id);
      } else if (viewMode.value === "treemap") {
        targetPos = treemapPosMap.get(d.id);
      } else {
        targetPos = barPlotPosMap.get(d.id);
      }
      if (!targetPos) return "";

      const path = createPath(d.obj, targetPos);
      if (path) return path;

      let x = targetPos.x;
      let y = targetPos.y;

      // if (viewMode.value === "tier") {
      //     // Convert the absolute position from the path calculation to a position RELATIVE to the cell's origin (d.x, d.y)
      //     const cellKey = `${d.obj.tier}-${d.obj.category}`;
      //     const layout = cellLayouts.get(cellKey);
      //     if (layout) {
      //         x = targetPos.x - layout.x; // Relative X
      //         y = targetPos.y - layout.y; // Relative Y
      //     }
      // }

      return `M ${x},${y} h ${targetPos.width} v ${targetPos.height} h -${targetPos.width} Z`;
    })
    .attr("transform", viewMode.value === "tier" ? null : null)
    .attr("fill", (d) => {
      if (d.shape === "baseline-rect") return "none";
      return getFillColor(d.obj, viewMode.value);
    })
    .attr("stroke", (d) => {
      if (d.shape === "baseline-rect") {
        const worsened = d.obj.tier > d.obj.baselineTier;
        return worsened ? colors.redColor : colors.lightBlue;
      }
      return "#fff";
    })
    .attr("stroke-width", (d) => (d.shape === "baseline-rect" ? 3 : 1))
    .attr("stroke-dasharray", (d) =>
      d.shape === "baseline-rect" ? "2.5,2.5" : "0"
    );

  // Hover
  allShapes
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#333").attr("stroke-width", 3);
      selectedObjectives.value = [d.obj];
      emit("objectives-select", [d.obj]);
      drawPolygonsOnMap(d.obj);
    })
    .on("mouseout", function (event, d) {
      const isBaseline = d.shape === "baseline-rect";
      d3.select(this)
        .attr(
          "stroke",
          isBaseline
            ? d.obj.tier > d.obj.baselineTier
              ? colors.redColor
              : colors.lightBlue
            : "#fff"
        )
        .attr("stroke-width", isBaseline ? 3 : 1);
      selectedObjectives.value = [];
      emit("objectives-select", []);
      drawPolygonsOnMap();
    });

  shapes.exit().remove();

  // Add labels for treemap mode
  if (viewMode.value === "treemap") {
    const labelData = allData;
    const labels = svg.selectAll(".treemap-label").data(labelData, (d) => d.id);

    // Enter new labels
    const enterLabels = labels
      .enter()
      .append("text")
      .attr("class", "treemap-label")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("fill", "#333")
      .style("pointer-events", "none")
      .attr("opacity", 0);

    // Merge and update all labels
    const allLabels = enterLabels.merge(labels);

    allLabels
      .transition()
      .duration(duration)
      .attr("x", (d) => {
        const pos = treemapPosMap.get(d.id);
        return pos ? pos.x + pos.width / 2 : 0;
      })
      .attr("y", (d) => {
        const pos = treemapPosMap.get(d.id);
        return pos ? pos.y + pos.height / 2 : 0;
      })
      .attr("opacity", 1)
      .on("end", function(d) {
        const pos = treemapPosMap.get(d.id);
        const textElement = d3.select(this);

        // Clear any existing tspans and text
        textElement.selectAll("tspan").remove();
        textElement.text("");

        // Only show label if cell is large enough
        if (!pos || pos.width <= 50 || pos.height <= 20) {
          return;
        }

        const words = d.obj.category.split(" ");
        const lineHeight = 12;
        const maxWidth = 50;
        const lines = [];
        let currentLine = [];

        // Create a temporary text element for measurement
        const tempText = svg.append("text")
          .style("font-size", "10px")
          .style("font-weight", "600")
          .style("visibility", "hidden");

        words.forEach((word) => {
          currentLine.push(word);
          tempText.text(currentLine.join(" "));
          const textWidth = tempText.node().getComputedTextLength();

          if (textWidth > maxWidth && currentLine.length > 1) {
            // Line is too long, remove last word and start new line
            currentLine.pop();
            lines.push(currentLine.join(" "));
            currentLine = [word];
          }
        });

        // Add remaining words
        if (currentLine.length > 0) {
          lines.push(currentLine.join(" "));
        }

        // Remove temporary text
        tempText.remove();

        // Calculate vertical offset to center multi-line text
        const totalHeight = lines.length * lineHeight;
        const startYOffset = -(totalHeight - lineHeight) / 2;

        // Add tspans for each line
        lines.forEach((lineText, i) => {
          textElement.append("tspan")
            .attr("x", pos.x + pos.width / 2)
            .attr("dy", i === 0 ? startYOffset : lineHeight)
            .text(lineText);
        });
      });

    labels.exit().remove();
  } else {
    // Remove labels when not in treemap mode
    svg.selectAll(".treemap-label").remove();
  }

  // Add labels for barplot mode
  if (viewMode.value === "barplot") {
    const labelData = allData;
    const labels = svg.selectAll(".barplot-label").data(labelData, (d) => d.id);

    // Enter new labels
    const enterLabels = labels
      .enter()
      .append("text")
      .attr("class", "barplot-label")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "start")
      .style("font-size", "9px")
      .style("font-weight", "600")
      .style("fill", "#333")
      .style("pointer-events", "none")
      .attr("opacity", 0);

    // Merge and update all labels
    const allLabels = enterLabels.merge(labels);

    allLabels
      .transition()
      .duration(duration)
      .attr("x", (d) => {
        const pos = barPlotPosMap.get(d.id);
        return pos ? pos.x + pos.width / 2 : 0;
      })
      .attr("y", (d) => {
        const pos = barPlotPosMap.get(d.id);
        return pos ? pos.y - 5 : 0; // Position above the bar
      })
      .attr("opacity", 1)
      .text((d) => {
        const pos = barPlotPosMap.get(d.id);
        // Show abbreviated category name if bar is narrow
        if (pos && pos.width > 15) {
          return d.obj.category.substring(0, 3); // First 3 chars
        }
        return "";
      });

    labels.exit().remove();
  } else {
    // Remove labels when not in barplot mode
    svg.selectAll(".barplot-label").remove();
  }
};

const initializeVisualization = (shouldAnimate = true) => {
  if (!svgRef.value || objectives.length === 0) return;

  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const width = containerRect?.width || 800;
  const height = containerRect?.height || 600;

  d3.select(svgRef.value).selectAll("*").remove();

  svg = d3.select(svgRef.value).attr("width", width).attr("height", height);

  drawTierBackgrounds(width, height);
  drawLabelsAndGrid(width, height);
  animateTransition(shouldAnimate);
};

const loadData = async () => {
  const baselineResult = await fetchData(baselineScenario.value, tiers);
  const comparisonResult = await fetchData(currentScenario.value, tiers);

  const baselineData = baselineResult.data;
  const comparisonData = comparisonResult.data;
  categories = baselineResult.categories;

  objectives = baselineData.map((obj) => {
    const comparisonObj = comparisonData.find((c) => c.id === obj.id);
    return {
      ...obj,
      baselineTier: obj.tier,
      tier: comparisonObj ? comparisonObj.tier : obj.tier,
    };
  });

  console.log("Loaded objectives:", objectives);
  initializeVisualization();
};

onMounted(async () => {
  const scenarios = await fetchAvailableScenarios();
  availableScenarios.value = scenarios;

  // Fetch tier short codes for geoshapes
  const scenarioList = await fetchShortCodes();
  tierShortList = scenarioList.map((scenario) => ({
    short_code: scenario.short_code,
    name: scenario.name,
  }));

  // Fetch geoshapes for each tier
  for (const tier of tierShortList) {
    console.log("Fetching geoshapes for tier:", tier.short_code, "Type:", typeof tier.short_code);
    if (tier.short_code === 'GW_STOR'){
      console.log("SSDF - Using local GW_STOR data");
      const geoShapes = GW_STOR;
      geoJSONs[tier.short_code] = geoShapes;
    } else if (tier.short_code === 'RES_STOR'){
      const geoShapes = RES_STOR;
      geoJSONs[tier.short_code] = geoShapes;
    } else {
      const geoShapes = await fetchGeoShapes(tier.short_code);
      geoJSONs[tier.short_code] = geoShapes;
    }
  }
  console.log("Loaded geoshapes:", geoJSONs);

  await loadData();
});

watch(currentScenario, async () => {
  await loadData();
});

watch(colorMode, () => {
  animateTransition(true);
});
</script>

<style scoped>
svg {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
}
</style>
