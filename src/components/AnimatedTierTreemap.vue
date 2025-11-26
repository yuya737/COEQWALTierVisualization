<template>
  <div class="w-full h-full bg-white p-5 relative flex flex-row gap-4">
    <div class="flex-1 flex flex-col overflow-hidden">
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
          <button
            @click="
              colorMode = colorMode === 'default' ? 'waterVolume' : 'default'
            "
            class="px-5 py-2.5 border border-gray-300 rounded-md text-sm font-semibold cursor-pointer transition-colors"
            :class="
              colorMode === 'waterVolume'
                ? 'bg-blue-100 text-blue-800 border-blue-300'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            "
          >
            {{
              colorMode === "waterVolume"
                ? "Default Colors"
                : "Water Volume Colors"
            }}
          </button>
          <button
            @click="toggleComparison"
            :disabled="viewMode === 'treemap'"
            class="px-5 py-2.5 border border-gray-300 rounded-md text-sm font-semibold transition-colors"
            :class="
              viewMode === 'treemap'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : showComparison
                ? 'bg-gray-200 text-gray-800 cursor-pointer'
                : 'bg-white text-gray-700 hover:bg-gray-50 cursor-pointer'
            "
          >
            {{
              showComparison
                ? "Hide Baseline Comparison"
                : "Compare to Baseline"
            }}
          </button>
          <button
            @click="toggleView"
            class="px-5 py-2.5 border border-gray-300 rounded-md text-sm font-semibold cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600"
          >
            Switch to {{ viewMode === "tier" ? "Treemap" : "Tier Grid" }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <svg ref="svgRef"></svg>
      </div>
    </div>

    <div
      class="w-80 border-l border-gray-200 pl-4 flex flex-col overflow-hidden"
    >
      <h3 class="text-lg font-semibold mb-3 text-gray-800 shrink-0">
        Selected Objectives
      </h3>
      <div class="flex-1 overflow-y-auto pr-2 min-h-0">
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
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import * as d3 from "d3";
import {
  fetchData,
  fetchAvailableScenarios,
  fetchShortCodes,
  fetchGeoShapes,
} from "../utils";

const emit = defineEmits(["polygon-select"]);

const svgRef = ref(null);
const currentScenario = ref("s0011");
const baselineScenario = ref("s0020");
const availableScenarios = ref([]);
const viewMode = ref("tier"); // "tier" or "treemap"
const showComparison = ref(false);
const colorMode = ref("default"); // "default" or "waterVolume"
const selectedObjectives = ref([]);
let objectives = [];
let categories = [];
let svg = null;
let tierShortList = [];
let geoJSONs = {};

const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];

const colors = {
  grayColor: "#D1D5DB",
  lightBlue: "#93C5FD",
  defaultBlue: "#2c7fb8",
  redColor: "#F87171",
};

// Category color scale
const categoryColorScale = d3.scaleOrdinal(d3.schemeSet3);

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
  const polygonsToShow =
    geoJSONs[short_code]["features"][
      withinCategoryIndex % geoJSONs[short_code]["features"].length
    ];

  emit("polygon-select", [polygonsToShow]);
};

// Function to show all polygons for a category
const drawAllPolygonsForCategory = (categoryName) => {
  if (!categoryName) {
    emit("polygon-select", []);
    selectedObjectives.value = [];
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

  emit("polygon-select", geoJSONs[short_code]["features"]);
};

const toggleView = () => {
  viewMode.value = viewMode.value === "tier" ? "treemap" : "tier";
  console.log("Toggled view mode to:", viewMode.value);
  // Disable comparison mode when switching to treemap
  if (viewMode.value === "treemap" && showComparison.value) {
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

const calculateTierPositions = (width, height) => {
  const margin = { top: 60, right: 50, bottom: 120, left: 100 };
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  const cellWidth = gridWidth / categories.length;
  const cellHeight = gridHeight / tiers.length;
  const dotSize = 16;
  const spacing = dotSize * 1.2;
  const dotsPerRow = Math.floor((cellWidth - spacing / 2) / spacing);

  const positions = [];

  if (!showComparison.value) {
    // Normal mode
    const grouped = d3.group(
      objectives,
      (d) => d.tier,
      (d) => d.category
    );

    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const cellObjectives = grouped.get(tier)?.get(category) || [];
        cellObjectives.forEach((obj, idx) => {
          const row = Math.floor(idx / dotsPerRow);
          const col = idx % dotsPerRow;
          const x =
            margin.left + catIndex * cellWidth + col * spacing + dotSize;
          const y =
            margin.top + tierIndex * cellHeight + row * spacing + dotSize;

          positions.push({
            id: obj.id,
            x: x - dotSize / 2,
            y: y - dotSize / 2,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: "rect",
          });
        });
      });
    });
  } else {
    // Comparison mode with triangles
    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const categoryObjectives = objectives.filter(
          (obj) => obj.category === category
        );

        let currentObjectives = categoryObjectives.filter(
          (obj) => obj.tier === tier
        );

        currentObjectives.sort((a, b) => {
          const aTierNum = tiers.indexOf(a.tier);
          const aBaselineNum = tiers.indexOf(a.baselineTier);
          const bTierNum = tiers.indexOf(b.tier);
          const bBaselineNum = tiers.indexOf(b.baselineTier);

          const aChange =
            aTierNum < aBaselineNum ? -1 : aTierNum === aBaselineNum ? 0 : 1;
          const bChange =
            bTierNum < bBaselineNum ? -1 : bTierNum === bBaselineNum ? 0 : 1;

          return aChange - bChange;
        });

        const movedAwayObjectives = categoryObjectives.filter(
          (obj) => obj.baselineTier === tier && obj.tier !== tier
        );

        let dotIndex = 0;

        // Current objectives
        currentObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;
          const x =
            margin.left + catIndex * cellWidth + col * spacing + dotSize;
          const y =
            margin.top + tierIndex * cellHeight + row * spacing + dotSize;

          const currentTierNum = tiers.indexOf(obj.tier);
          const baselineTierNum = tiers.indexOf(obj.baselineTier);

          let shape = "rect";
          if (currentTierNum < baselineTierNum) {
            shape = "triangle-up";
          } else if (currentTierNum > baselineTierNum) {
            shape = "triangle-down";
          }

          positions.push({
            id: obj.id,
            x: x - dotSize / 2,
            y: y - dotSize / 2,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: shape,
          });

          dotIndex++;
        });

        // Moved away objectives (baseline positions)
        movedAwayObjectives.forEach((obj, idx) => {
          const row = Math.floor(idx / dotsPerRow);
          const col = idx % dotsPerRow;
          const x =
            margin.left + catIndex * cellWidth + col * spacing + dotSize;
          const y =
            margin.top +
            tierIndex * cellHeight +
            cellHeight -
            (row + 1) * spacing;

          positions.push({
            id: `baseline-${obj.id}`,
            x: x - dotSize / 2,
            y: y - dotSize / 2,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: "baseline-rect",
          });
        });
      });
    });
  }

  return positions;
};

const calculateTreemapPositions = (width, height) => {
  const groupedByCategory = d3.group(objectives, (d) => d.category);

  const data = {
    name: "root",
    children: Array.from(groupedByCategory, ([category, objs]) => ({
      name: category,
      children: objs.map((obj) => ({
        name: `${obj.id}`,
        value: obj.waterVolume,
        obj: obj,
      })),
    })),
  };

  const root = d3
    .hierarchy(data)
    .sum((d) => d.value)
    .sort((a, b) => b.value - a.value);

  d3.treemap().size([width, height]).padding(2).round(true)(root);

  const positions = [];
  root.leaves().forEach((d) => {
    positions.push({
      id: d.data.obj.id,
      x: d.x0,
      y: d.y0,
      width: d.x1 - d.x0,
      height: d.y1 - d.y0,
      obj: d.data.obj,
      shape: "rect",
    });
  });

  return positions;
};

const drawLabelsAndGrid = (width, height) => {
  const margin = { top: 60, right: 50, bottom: 120, left: 100 };
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  const cellWidth = gridWidth / categories.length;
  const cellHeight = gridHeight / tiers.length;

  // Remove old labels
  svg.selectAll(".tier-label").remove();
  svg.selectAll(".category-label-group").remove();
  svg.selectAll(".grid-line").remove();

  if (viewMode.value !== "tier") return;

  // Grid lines
  categories.forEach((_, i) => {
    svg
      .append("line")
      .attr("class", "grid-line")
      .attr("x1", margin.left + i * cellWidth)
      .attr("y1", margin.top)
      .attr("x2", margin.left + i * cellWidth)
      .attr("y2", margin.top + gridHeight)
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 1);
  });

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
    .data(categories)
    .enter()
    .append("g")
    .attr("class", "category-label-group")
    .attr(
      "transform",
      (_d, i) =>
        `translate(${margin.left + i * cellWidth + cellWidth / 2}, ${
          margin.top + gridHeight + 25
        })`
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
      .attr("text-anchor", "middle")
      .attr("y", 0)
      .style("font-size", "0.875rem")
      .style("font-weight", "500")
      .style("fill", "#4B5563")
      .each(function (d) {
        const words = d.split(" ");
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
        drawAllPolygonsForCategory(d);
      });
  });
};

const drawTierBackgrounds = (width, height) => {
  const margin = { top: 60, right: 50, bottom: 120, left: 100 };
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

const animateTransition = (shouldAnimate = true) => {
  if (!svg || objectives.length === 0) return;

  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const width = containerRect?.width || 800;
  const height = containerRect?.height || 600;

  const duration = shouldAnimate ? 1000 : 0;

  // Animate tier backgrounds
  svg
    .selectAll(".tier-background")
    .transition()
    .duration(duration)
    .attr("opacity", viewMode.value === "tier" ? 1 : 0);

  // Draw/remove labels and grid
  drawLabelsAndGrid(width, height);

  const tierPositions = calculateTierPositions(width, height);
  const treemapPositions = calculateTreemapPositions(width, height);

  const tierPosMap = new Map(tierPositions.map((p) => [p.id, p]));
  const treemapPosMap = new Map(treemapPositions.map((p) => [p.id, p]));

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

    // Treemap mode - color by category
    if (targetMode === "treemap") {
      return categoryColorScale(d.category);
    }

    // Tier mode - comparison colors
    if (!showComparison.value) {
      return colors.defaultBlue;
    }

    const currentTierNum = tiers.indexOf(d.tier);
    const baselineTierNum = tiers.indexOf(d.baselineTier);

    if (currentTierNum === baselineTierNum) {
      return colors.lightBlue;
    } else if (currentTierNum < baselineTierNum) {
      return colors.defaultBlue;
    } else {
      return colors.redColor;
    }
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

  // Update shapes
  const allData = viewMode.value === "tier" ? tierPositions : treemapPositions;
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
    const startPos =
      viewMode.value === "treemap"
        ? tierPosMap.get(d.id)
        : treemapPosMap.get(d.id);
    if (!startPos) return;

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

  // Transition
  allShapes
    .transition()
    .duration(duration)
    .ease(d3.easeCubicInOut)
    .attr("d", (d) => {
      const targetPos =
        viewMode.value === "treemap"
          ? treemapPosMap.get(d.id)
          : tierPosMap.get(d.id);
      if (!targetPos) return "";

      const path = createPath(d.obj, targetPos);
      if (path) return path;

      return `M ${targetPos.x},${targetPos.y} h ${targetPos.width} v ${targetPos.height} h -${targetPos.width} Z`;
    })
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
      .text((d) => {
        const pos = treemapPosMap.get(d.id);
        // Only show label if cell is large enough
        if (pos && pos.width > 50 && pos.height > 20) {
          return d.obj.category;
        }
        return "";
      });

    labels.exit().remove();
  } else {
    // Remove labels when not in treemap mode
    svg.selectAll(".treemap-label").remove();
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
    const geoShapes = await fetchGeoShapes(tier.short_code);
    geoJSONs[tier.short_code] = geoShapes;
  }

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
