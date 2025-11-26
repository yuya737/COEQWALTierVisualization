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
                : "Color by Water Volume"
            }}
          </button>
          <button
            @click="toggleComparison"
            class="px-5 py-2.5 border border-gray-300 rounded-md text-sm font-semibold cursor-pointer transition-colors"
            :class="
              showComparison
                ? 'bg-gray-200 text-gray-800'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            "
          >
            {{
              showComparison
                ? "Hide Baseline Comparison"
                : "Compare to Baseline"
            }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <svg ref="svgRef"></svg>
        <!-- <div
          v-if="tooltipData"
          class="w-fit border px-4 py-3 text-md leading-relaxed border-t border-gray-500 rounded-md"
        >
          <div class="my-0.5">
            <strong>Objective ID:</strong> {{ tooltipData.id }}
          </div>
          <div class="my-0.5">
            <strong>Category:</strong> {{ tooltipData.category }}
          </div>
          <div class="my-0.5">
            <strong>Tier:</strong> {{ tooltipData.tier }}
          </div>
          <div class="my-0.5">
            <strong>Baseline Tier:</strong> {{ tooltipData.baselineTier }}
          </div>
      </div> -->
      </div>
    </div>

    <div
      class="w-48 border-l border-gray-200 pl-4 flex flex-col overflow-hidden"
    >
      <h3 class="text-lg font-semibold mb-3 text-gray-800">
        Selected Objectives
      </h3>
      <div class="flex-1 overflow-y-auto pr-2">
        <div
          v-if="selectedObjectives.length === 0"
          class="text-gray-500 text-sm"
        >
          Click on a cell or category or hover on the objectives
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
                {{ obj.baselineTier }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import * as d3 from "d3";
import {
  calculateMeanTier,
  fetchData,
  fetchShortCodes,
  fetchGeoShapes,
  fetchAvailableScenarios,
} from "../../utils";

const emit = defineEmits(["polygon-select"]);

const svgRef = ref(null);
const showComparison = ref(false);
const tooltipData = ref(null);
const availableScenarios = ref([]);
const currentScenario = ref("s0011");
const baselineScenario = ref("s0020");
const meanTierBaseline = ref(0);
const meanTierCurrent = ref(0);
const selectedObjectives = ref([]);
const colorMode = ref("default"); // "default" or "waterVolume"
let objectives = [];
let svg = null;
let tierShortList = [];
let geoJSONs = {};
let categories;

// Function to trigger polygon drawing in MapView
const drawPolygonsOnMap = (objective) => {
  if (!objective) {
    emit("polygon-select", []);
    return;
  }
  console.log("Drawing polygons for objective:", objective);
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
  console.log("Drawing all polygons for category:", categoryName);
  const short_code = tierShortList.find(
    (tier) => tier.name === categoryName
  )?.short_code;
  if (!short_code || !geoJSONs[short_code]) {
    console.warn("No geoshapes found for category:", categoryName);
    return;
  }

  // Find all objectives in this category
  const categoryObjectives = objectives.filter(
    (obj) => obj.category === categoryName
  );
  selectedObjectives.value = categoryObjectives;

  // Emit all features for this category
  emit("polygon-select", geoJSONs[short_code]["features"]);
};

// Function to show polygons for a specific category and tier combination
const drawPolygonsForCategoryAndTier = (categoryName, tierName) => {
  if (!categoryName || !tierName) {
    emit("polygon-select", []);
    return;
  }
  console.log(
    "Drawing polygons for category:",
    categoryName,
    "tier:",
    tierName
  );

  const short_code = tierShortList.find(
    (tier) => tier.name === categoryName
  )?.short_code;
  if (!short_code || !geoJSONs[short_code]) {
    console.warn("No geoshapes found for category:", categoryName);
    return;
  }

  // Find objectives that match this category and tier
  const matchingObjectives = objectives.filter(
    (obj) => obj.category === categoryName && obj.tier === tierName
  );

  if (matchingObjectives.length === 0) {
    console.log("No objectives found for", categoryName, tierName);
    emit("polygon-select", []);
    selectedObjectives.value = [];
    return;
  }

  // Update selected objectives list
  selectedObjectives.value = matchingObjectives;

  console.log(
    "Getting polygon for objective:",
    matchingObjectives,
    geoJSONs[short_code]["features"].length,
    selectedObjectives.value
  );

  // Get polygons for these objectives
  const polygonsToShow = matchingObjectives.map((obj) => {
    const withinCategoryIndex = obj.withinCategoryIndex;
    return geoJSONs[short_code]["features"][
      withinCategoryIndex % geoJSONs[short_code]["features"].length
    ];
  });

  emit("polygon-select", polygonsToShow);
};

const toggleComparison = () => {
  showComparison.value = !showComparison.value;
};

const showTooltip = (event, obj) => {
  tooltipData.value = {
    id: obj.id,
    category: obj.category,
    tier: obj.tier,
    baselineTier: obj.baselineTier,
  };
};

const hideTooltip = () => {
  tooltipData.value = null;
};

const highlightById = (id) => {
  // Dim all shapes
  d3.selectAll(".objective-shape").style("opacity", 0.2);
  // Highlight shapes with matching ID
  d3.selectAll(`.objective-shape[data-id="${id}"]`).style("opacity", 1);
};

const resetHighlight = () => {
  d3.selectAll(".objective-shape").style("opacity", 1);
};

const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];

// Color scheme
const colors = ["#6B7280", "#3B82F6", "#EF4444", "#10B981"]; // gray, blue, red, green
const grayColor = "#D1D5DB";
const lightBlue = "#93C5FD"; // blue-300 for comparison mode (no change/improvement)
const defaultBlue = "#2c7fb8"; // A default blue color for dots
const redColor = "#F87171"; // lighter red for worsening - pairs better with blue
// const lightBlue = grayColor;
// const defaultBlue = grayColor;
// const redColor = grayColor;

// Generate 50 random objectives
function generateRandomObjectives(count = 50) {
  const objectives = [];
  for (let i = 0; i < count; i++) {
    objectives.push({
      id: i,
      category: categories[Math.floor(Math.random() * categories.length)],
      tier: tiers[Math.floor(Math.random() * tiers.length)],
      baselineTier: tiers[Math.floor(Math.random() * tiers.length)],
      // color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  return objectives;
}

const drawVisualization = () => {
  // Clear existing SVG
  d3.select(svgRef.value).selectAll("*").remove();

  // Get container dimensions dynamically - use getBoundingClientRect for accurate size
  const container = svgRef.value?.parentElement;
  const containerRect = container?.getBoundingClientRect();
  const containerWidth = containerRect?.width || 1200;
  const containerHeight = containerRect?.height || 1400; // 90% of height

  // Dimensions and margins
  const margin = { top: 60, right: 25, bottom: 140, left: 100 };
  const width = Math.max(containerWidth - margin.left - margin.right - 40, 400); // Subtract padding and ensure minimum
  const height = containerHeight - margin.top - margin.bottom;

  const cellWidth = width / categories.length;
  const cellHeight = height / tiers.length;

  const dotSize = 16;
  const spacing = dotSize * 1.2;
  const dotsPerRow = Math.floor((cellWidth - spacing / 2) / spacing);

  // Create SVG
  svg = d3
    .select(svgRef.value)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Add background colors for tiers
  const tierColors = ["#ECFDF5", "#EFF6FF", "#FEFCE8", "#FEF2F2"]; // faint green, blue, yellow, red
  tiers.forEach((_tier, i) => {
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", i * cellHeight)
      .attr("width", width)
      .attr("height", cellHeight)
      .attr("fill", tierColors[i])
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 0.5);
  });

  // Add clickable cells for each category/tier combination
  tiers.forEach((tier, tierIndex) => {
    categories.forEach((category, catIndex) => {
      svg
        .append("rect")
        .attr("class", "cell-clickable")
        .attr("x", catIndex * cellWidth)
        .attr("y", tierIndex * cellHeight)
        .attr("width", cellWidth)
        .attr("height", cellHeight)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("mouseover", function () {
          d3.select(this).attr("fill", "rgba(0, 0, 0, 0.03)");
        })
        .on("mouseout", function () {
          d3.select(this).attr("fill", "transparent");
        })
        .on("click", function () {
          drawPolygonsForCategoryAndTier(category, tier);
        });
    });
  });

  // Add grid lines
  categories.forEach((_, i) => {
    svg
      .append("line")
      .attr("x1", i * cellWidth)
      .attr("y1", 0)
      .attr("x2", i * cellWidth)
      .attr("y2", height)
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 1);
  });

  tiers.forEach((_, i) => {
    svg
      .append("line")
      .attr("x1", 0)
      .attr("y1", i * cellHeight)
      .attr("x2", width)
      .attr("y2", i * cellHeight)
      .attr("stroke", "#D1D5DB")
      .attr("stroke-width", 1);
  });

  // Add tier labels (left side)
  svg
    .selectAll(".tier-label")
    .data(tiers)
    .enter()
    .append("text")
    .attr("class", "tier-label")
    .attr("x", -10)
    .attr("y", (d, i) => i * cellHeight + cellHeight / 2)
    .attr("text-anchor", "end")
    .attr("alignment-baseline", "middle")
    .style("font-size", "1rem")
    .text((d) => d);

  // Add category labels as button-like elements
  const categoryGroups = svg
    .selectAll(".category-label-group")
    .data(categories)
    .enter()
    .append("g")
    .attr("class", "category-label-group")
    .attr(
      "transform",
      (_d, i) => `translate(${i * cellWidth + cellWidth / 2}, ${height + 25})`
    )
    .style("cursor", "pointer");

  // Add subtle shadow filter
  const defs = svg.append("defs");
  const filter = defs
    .append("filter")
    .attr("id", "button-shadow")
    .attr("x", "-50%")
    .attr("y", "-50%")
    .attr("width", "200%")
    .attr("height", "200%");

  filter
    .append("feGaussianBlur")
    .attr("in", "SourceAlpha")
    .attr("stdDeviation", 1);

  filter
    .append("feOffset")
    .attr("dx", 0)
    .attr("dy", 1)
    .attr("result", "offsetblur");

  filter
    .append("feComponentTransfer")
    .append("feFuncA")
    .attr("type", "linear")
    .attr("slope", 0.15);

  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Add background rect (will be sized after text is added)
  categoryGroups.each(function (d, i) {
    const group = d3.select(this);

    // Add background rect
    const bg = group
      .append("rect")
      .attr("class", "category-bg")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "#F9FAFB")
      .attr("stroke", "#E5E7EB")
      .attr("stroke-width", 1)
      .attr("filter", "url(#button-shadow)");

    // Add text
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

    // Size background based on text
    const bbox = text.node().getBBox();
    const padding = 6;
    bg.attr("x", bbox.x - padding)
      .attr("y", bbox.y - padding)
      .attr("width", bbox.width + padding * 2)
      .attr("height", bbox.height + padding * 2);

    // Add hover effects
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
        // Click animation
        d3.select(this)
          .select(".category-bg")
          .transition()
          .duration(80)
          .attr("fill", "#E5E7EB")
          .transition()
          .duration(80)
          .attr("fill", "#F3F4F6");

        drawAllPolygonsForCategory(d);
      });
  });

  // Create color scale for water volume mode
  const waterVolumeExtent = d3.extent(objectives, (d) => d.waterVolume);
  const waterVolumeColorScale = d3
    .scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2))
    .domain(waterVolumeExtent);

  // Draw dots
  if (!showComparison.value) {
    // Normal mode: group by current tier
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

          const x = catIndex * cellWidth + col * spacing + dotSize;
          const y = tierIndex * cellHeight + row * spacing + dotSize;

          svg
            .append("rect")
            .attr("class", "objective-shape")
            .attr("data-id", obj.id)
            .attr("x", x - dotSize / 2)
            .attr("y", y - dotSize / 2)
            .attr("width", dotSize)
            .attr("height", dotSize)
            .attr(
              "fill",
              colorMode.value === "waterVolume"
                ? waterVolumeColorScale(obj.waterVolume)
                : defaultBlue
            )
            .style("cursor", "pointer")
            .on("mouseover", function (event) {
              highlightById(obj.id);
              showTooltip(event, obj);
              drawPolygonsOnMap(obj);
              selectedObjectives.value = [obj];
            })
            .on("mouseout", function () {
              resetHighlight();
              hideTooltip();
              drawPolygonsOnMap();
              selectedObjectives.value = [];
            });
        });
      });
    });
  } else {
    // Comparison mode: split view

    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        // Find objectives in this category
        const categoryObjectives = objectives.filter(
          (obj) => obj.category === category
        );

        // Split into two groups:
        // 1. Blue (top): objectives currently in this tier-category pair
        let currentObjectives = categoryObjectives.filter(
          (obj) => obj.tier === tier
        );

        // Sort current objectives: up triangles, then squares, then down triangles
        currentObjectives.sort((a, b) => {
          const aTierNum = tiers.indexOf(a.tier);
          const aBaselineNum = tiers.indexOf(a.baselineTier);
          const bTierNum = tiers.indexOf(b.tier);
          const bBaselineNum = tiers.indexOf(b.baselineTier);

          // Calculate change: -1 (improved/up), 0 (same/square), 1 (worsened/down)
          const aChange =
            aTierNum < aBaselineNum ? -1 : aTierNum === aBaselineNum ? 0 : 1;
          const bChange =
            bTierNum < bBaselineNum ? -1 : bTierNum === bBaselineNum ? 0 : 1;

          return aChange - bChange;
        });

        // 2. Gray (bottom): objectives that were in baseline tier but moved away (not currently here)
        const movedAwayObjectives = categoryObjectives.filter(
          (obj) => obj.baselineTier === tier && obj.tier !== tier
        );

        let dotIndex = 0;

        // Draw blue boxes/triangles on top (current tier)
        currentObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;

          const x = catIndex * cellWidth + col * spacing + dotSize;
          const y = tierIndex * cellHeight + row * spacing + dotSize;

          // Determine tier change (lower tier number = better)
          const currentTierNum = tiers.indexOf(obj.tier);
          const baselineTierNum = tiers.indexOf(obj.baselineTier);

          if (currentTierNum === baselineTierNum) {
            // Same tier - draw square
            svg
              .append("rect")
              .attr("class", "objective-shape")
              .attr("data-id", obj.id)
              .attr("x", x - dotSize / 2)
              .attr("y", y - dotSize / 2)
              .attr("width", dotSize)
              .attr("height", dotSize)
              .attr(
                "fill",
                colorMode.value === "waterVolume"
                  ? waterVolumeColorScale(obj.waterVolume)
                  : lightBlue
              )
              .style("cursor", "pointer")
              .on("mouseover", function (event) {
                highlightById(obj.id);
                showTooltip(event, obj);
                drawPolygonsOnMap(obj);
              })
              .on("mouseout", function () {
                resetHighlight();
                hideTooltip();
                drawPolygonsOnMap();
              });
          } else if (currentTierNum < baselineTierNum) {
            // Improved (moved to lower tier) - up arrow
            const width = dotSize * 0.9;
            const height = dotSize * 1;
            const path = `M ${x},${y - height / 2} L ${x + width / 2},${
              y + height / 2
            } L ${x - width / 2},${y + height / 2} Z`;

            svg
              .append("path")
              .attr("class", "objective-shape")
              .attr("data-id", obj.id)
              .attr("d", path)
              .attr(
                "fill",
                colorMode.value === "waterVolume"
                  ? waterVolumeColorScale(obj.waterVolume)
                  : defaultBlue
              )
              .style("cursor", "pointer")
              .on("mouseover", function (event) {
                highlightById(obj.id);
                showTooltip(event, obj);
                drawPolygonsOnMap(obj);
              })
              .on("mouseout", function () {
                resetHighlight();
                hideTooltip();
                drawPolygonsOnMap();
              });
          } else {
            // Worsened (moved to higher tier) - down arrow
            const width = dotSize * 0.9;
            const height = dotSize * 1;
            const path = `M ${x},${y + height / 2} L ${x + width / 2},${
              y - height / 2
            } L ${x - width / 2},${y - height / 2} Z`;

            svg
              .append("path")
              .attr("class", "objective-shape")
              .attr("data-id", obj.id)
              .attr("d", path)
              .attr(
                "fill",
                colorMode.value === "waterVolume"
                  ? waterVolumeColorScale(obj.waterVolume)
                  : redColor
              )
              .style("cursor", "pointer")
              .on("mouseover", function (event) {
                highlightById(obj.id);
                showTooltip(event, obj);
                drawPolygonsOnMap(obj);
              })
              .on("mouseout", function () {
                resetHighlight();
                hideTooltip();
                drawPolygonsOnMap();
              });
          }

          dotIndex++;
        });

        // Draw gray boxes accumulating from bottom
        movedAwayObjectives.forEach((obj, idx) => {
          const row = Math.floor(idx / dotsPerRow);
          const col = idx % dotsPerRow;

          const x = catIndex * cellWidth + col * spacing + dotSize;
          // Position from bottom up
          const y = tierIndex * cellHeight + cellHeight - (row + 1) * spacing;

          // Determine if worsened (moved to higher tier number) or improved
          const worsened = obj.tier > obj.baselineTier;
          const strokeColor = worsened ? redColor : lightBlue;

          svg
            .append("rect")
            .attr("class", "objective-shape")
            .attr("data-id", obj.id)
            .attr("x", x - dotSize / 2)
            .attr("y", y - dotSize / 2)
            .attr("width", dotSize)
            .attr("height", dotSize)
            .attr("stroke", strokeColor)
            .attr("stroke-width", 3)
            .attr("stroke-dasharray", "2.5,2.5")
            .attr("fill", "none")
            .style("cursor", "pointer")
            .on("mouseover", function (event) {
              highlightById(obj.id);
              showTooltip(event, obj);
              drawPolygonsOnMap(obj);
              selectedObjectives.value = [obj];
            })
            .on("mouseout", function () {
              resetHighlight();
              hideTooltip();
              drawPolygonsOnMap();
              selectedObjectives.value = [];
            });
        });
      });
    });
  }

  // Add legend for comparison mode
  if (showComparison.value) {
    const legendX = 0;
    const legendY = height + margin.bottom - 10;
    const legendItemSize = 18;
    const legendSpacing = 120;

    // Up triangle (improved)
    const upPath = `M ${legendX},${legendY - legendItemSize * 0.4} L ${
      legendX + legendItemSize * 0.45
    },${legendY + legendItemSize * 0.4} L ${legendX - legendItemSize * 0.45},${
      legendY + legendItemSize * 0.4
    } Z`;
    svg.append("path").attr("d", upPath).attr("fill", defaultBlue);
    svg
      .append("text")
      .attr("x", legendX + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Improved");

    // Square (no change)
    svg
      .append("rect")
      .attr("x", legendX + legendSpacing - legendItemSize / 2)
      .attr("y", legendY - legendItemSize / 2)
      .attr("width", legendItemSize)
      .attr("height", legendItemSize)
      .attr("fill", lightBlue);
    svg
      .append("text")
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
    svg.append("path").attr("d", downPath).attr("fill", redColor);
    svg
      .append("text")
      .attr("x", legendX + legendSpacing * 2 + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Worsened");

    // Gray dotted box (comparison objective tier)
    svg
      .append("rect")
      .attr("x", legendX + legendSpacing * 3 - legendItemSize / 2)
      .attr("y", legendY - legendItemSize / 2)
      .attr("width", legendItemSize)
      .attr("height", legendItemSize)
      .attr("stroke", grayColor)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4")
      .attr("fill", "none");
    svg
      .append("text")
      .attr("x", legendX + legendSpacing * 3 + 15)
      .attr("y", legendY + 5)
      .style("font-size", "1.1rem")
      .text("Baseline");
  }

  // Add legend for water volume color mode
  if (colorMode.value === "waterVolume") {
    const legendX = width - 200;
    const legendY = height + margin.bottom - 40;
    const gradientWidth = 150;
    const gradientHeight = 20;

    // Define gradient
    const gradientId = "waterVolumeGradient";
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
        .attr("stop-color", waterVolumeColorScale(value));
    }

    // Draw gradient rectangle
    svg
      .append("rect")
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
      .attr("x", legendX)
      .attr("y", legendY - 5)
      .style("font-size", "0.9rem")
      .style("font-weight", "600")
      .text("Water Volume (Random");

    svg
      .append("text")
      .attr("x", legendX)
      .attr("y", legendY + gradientHeight + 15)
      .style("font-size", "0.8rem")
      .text(`${Math.round(waterVolumeExtent[0])} TAF`);

    svg
      .append("text")
      .attr("x", legendX + gradientWidth)
      .attr("y", legendY + gradientHeight + 15)
      .attr("text-anchor", "end")
      .style("font-size", "0.8rem")
      .text(`${Math.round(waterVolumeExtent[1])} TAF`);
  }
};

const loadScenarioData = async () => {
  const baselineResult = await fetchData(baselineScenario.value, tiers);
  const comparisonResult = await fetchData(currentScenario.value, tiers);

  const baselineData = baselineResult.data;
  const comparisonData = comparisonResult.data;
  categories = baselineResult.categories;

  console.log("Baseline data:", baselineData);
  console.log("Comparison data:", comparisonData);

  // Calculate mean tiers
  meanTierBaseline.value = calculateMeanTier(baselineData);
  meanTierCurrent.value = calculateMeanTier(comparisonData);

  console.log("Mean Tier (Baseline):", meanTierBaseline.value);
  console.log("Mean Tier (Current):", meanTierCurrent.value);

  objectives = baselineData;
  objectives = objectives.map((obj) => {
    const comparisonObj = comparisonData.find((c) => c.id === obj.id);
    return {
      ...obj,
      baselineTier: obj.tier,
      tier: comparisonObj ? comparisonObj.tier : obj.tier,
    };
  });
  console.log("Final objectives with comparison:", objectives);

  drawVisualization();
};

onMounted(async () => {
  // Fetch available scenarios
  const scenarios = await fetchAvailableScenarios();
  availableScenarios.value = scenarios;
  console.log("Available scenarios:", scenarios);

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
    console.log(`Geoshapes for scenario ${tier.short_code}:`, geoShapes);
  }

  // Load initial scenario data
  await loadScenarioData();
});

watch(showComparison, () => {
  drawVisualization();
});

watch(colorMode, () => {
  drawVisualization();
});

watch(currentScenario, async () => {
  await loadScenarioData();
});

// Redraw on window resize
const handleResize = () => {
  drawVisualization();
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
svg {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
}
</style>
