<template>
  <div class="w-full h-full bg-white p-4 flex flex-col">
    <h3 class="text-base font-semibold text-gray-800 mb-3">
      From
      {{ nameToTitleMap[baselineScenario] || baselineScenario }}
      to
      {{ nameToTitleMap[currentScenario] || currentScenario }}...
    </h3>
    <div class="flex-1 flex gap-4 overflow-hidden">
      <!-- Chart (left side, takes more space) -->
      <div class="flex-[3] min-w-0">
        <svg ref="svgRef" class="w-full h-full"></svg>
      </div>
      <!-- Summary (right side) -->
      <div
        class="flex-1 bg-gray-50 border border-gray-200 rounded-md p-4 overflow-auto"
      >
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Summary</h4>
        <p
          class="text-sm text-gray-600 leading-relaxed"
          v-html="summaryHTML"
        ></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { nameToTitleMap } from "../utils";
import * as d3 from "d3";

const props = defineProps({
  objectives: {
    type: Array,
    required: true,
  },
  currentScenario: {
    type: String,
    required: true,
  },
  baselineScenario: {
    type: String,
    required: true,
  },
  categories: {
    type: Array,
    required: true,
  },
  tiers: {
    type: Array,
    required: true,
  },
});

const svgRef = ref(null);

const margin = { top: 30, right: 30, bottom: 70, left: 200 };

// Calculate statistics per category
const categoryStats = computed(() => {
  const stats = [];

  props.categories.forEach((category) => {
    const categoryObjectives = props.objectives.filter(
      (obj) => obj.category === category,
    );

    if (categoryObjectives.length === 0) {
      return;
    }

    let improved = 0;
    let worsened = 0;
    let unchanged = 0;

    categoryObjectives.forEach((obj) => {
      const currentTierIndex = props.tiers.indexOf(obj.tier);
      const baselineTierIndex = props.tiers.indexOf(obj.baselineTier);

      if (currentTierIndex < baselineTierIndex) {
        // Lower tier number = better (Tier 1 is better than Tier 2)
        improved++;
      } else if (currentTierIndex > baselineTierIndex) {
        worsened++;
      } else {
        unchanged++;
      }
    });

    const total = categoryObjectives.length;
    const improvedPct = (improved / total) * 100;
    const worsenedPct = (worsened / total) * 100;
    const unchangedPct = (unchanged / total) * 100;

    stats.push({
      category,
      improved,
      worsened,
      unchanged,
      total,
      improvedPct,
      worsenedPct,
      unchangedPct,
    });
  });

  return stats;
});

// Generate HTML version with bold categories and colored directions
const summaryHTML = computed(() => {
  const getDirection = (stat) => {
    const { improved, worsened, unchangedPct } = stat;

    // Thresholds for classification
    const DOMINANT_THRESHOLD = 50;
    const MAJORITY_THRESHOLD = 40;
    const MINORITY_THRESHOLD = 20;

    if (unchangedPct == 100) {
      return "unaffected";
    }

    // Mixed requires BOTH improved AND worsened objectives
    const hasBoth = improved > 0 && worsened > 0;

    const getPrefix = (percentInDirection) => {
      if (percentInDirection > DOMINANT_THRESHOLD) {
        return "strong ";
      }
      if (percentInDirection > MAJORITY_THRESHOLD) {
        return "";
      }
      if (percentInDirection > MINORITY_THRESHOLD) {
        return "some ";
      }
      return "slight ";
    };

    if (!hasBoth) {
      // Pure positive or negative (no mixing)
      if (improved > 0 && worsened === 0)
        return getPrefix(stat.improvedPct) + "positive";
      if (worsened > 0 && improved === 0)
        return getPrefix(stat.worsenedPct) + "negative";
    }

    // Has both - classify as mixed
    if (stat.improvedPct > DOMINANT_THRESHOLD) {
      return "mostly positive";
    }

    if (stat.worsenedPct > DOMINANT_THRESHOLD) {
      return "mostly negative";
    }

    if (stat.improvedPct > MAJORITY_THRESHOLD) {
      return "mixed-positive";
    }

    if (stat.worsenedPct > MAJORITY_THRESHOLD) {
      return "mixed-negative";
    }

    if (stat.improvedPct > stat.worsenedPct) {
      return "mixed-positive";
    }

    if (stat.worsenedPct > stat.improvedPct) {
      return "mixed-negative";
    }

    return "mixed-neutral";
  };

  const getDirectionColor = (direction) => {
    // All positive directions - blue
    if (direction.includes("positive") && !direction.includes("mixed")) {
      return "#2563EB"; // Blue
    }

    // All negative directions - red
    if (direction.includes("negative") && !direction.includes("mixed")) {
      return "#DC2626"; // Red
    }

    // Mixed positive - purple
    if (direction === "mixed-positive" || direction === "mostly positive") {
      return "#7C3AED"; // Purple
    }

    // Mixed negative - orange
    if (direction === "mixed-negative" || direction === "mostly negative") {
      return "#F97316"; // Orange
    }

    // Neutral or unaffected - gray
    return "#6B7280"; // Gray
  };

  const formatCategoryGroup = (stats, directionText) => {
    const categories = stats
      .map((s) => `<strong>${s.category}</strong>`)
      .join(", ");
    const color = getDirectionColor(stats[0].direction);
    return `${categories} <span style="color: ${color};">${directionText}</span>`;
  };

  const categorizedStats = categoryStats.value.map((stat) => ({
    ...stat,
    direction: getDirection(stat),
  }));
  console.log("categorizedStats:", categorizedStats);

  // Group categories by direction
  const directionGroups = new Map();
  categorizedStats.forEach((stat) => {
    if (!directionGroups.has(stat.direction)) {
      directionGroups.set(stat.direction, []);
    }
    directionGroups.get(stat.direction).push(stat);
  });
  const parts = [];
  const directionOrder = [
    "strong positive",
    "positive",
    "mostly positive",
    "some positive",
    "slight positive",
    "mixed-positive",
    "strong negative",
    "negative",
    "mostly negative",
    "some negative",
    "slight negative",
    "mixed-negative",
    "mixed-neutral",
  ];

  directionOrder.forEach((direction) => {
    const stats = directionGroups.get(direction);
    if (stats && stats.length > 0) {
      parts.push(formatCategoryGroup(stats, `show ${direction} effects`));
    }
  });

  const hasUnaffected = directionGroups.has("unaffected");

  if (parts.length === 0 && !hasUnaffected) {
    return "No significant changes detected.";
  }

  if (parts.length === 0 && hasUnaffected) {
    return "All categories remain unaffected.";
  }

  // Join with line breaks instead of commas
  let result = "";
  if (parts.length === 0) {
    result = "";
  } else {
    result = parts.join(".<br>");
  }

  // Add "the rest unaffected" on a new line if there are unaffected categories
  if (hasUnaffected) {
    if (result) {
      result +=
        '.<br><span style="color: #6B7280;">The rest remain unaffected</span>';
    } else {
      result =
        '<span style="color: #6B7280;">All categories remain unaffected</span>';
    }
  } else {
    result += ".";
  }

  return result;
});

const drawChart = () => {
  if (!svgRef.value || categoryStats.value.length === 0) return;

  const container = svgRef.value.parentElement;
  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;

  const svg = d3.select(svgRef.value);
  svg.selectAll("*").remove();

  svg.attr("width", width).attr("height", height);

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales - horizontal diverging bars
  const yScale = d3
    .scaleBand()
    .domain(categoryStats.value.map((d) => d.category))
    .range([0, chartHeight])
    .padding(0.3);

  const xScale = d3.scaleLinear().domain([-100, 100]).range([0, chartWidth]);

  // Axes
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(10)
    .tickFormat((d) => `${Math.abs(d)}%`);
  const yAxis = d3.axisLeft(yScale);

  // Gridlines (horizontal lines parallel to x-axis from center of each bar)
  g.append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(categoryStats.value)
    .enter()
    .append("line")
    .attr("x1", 0)
    .attr("x2", chartWidth)
    .attr("y1", (d) => yScale(d.category) + yScale.bandwidth() / 2)
    .attr("y2", (d) => yScale(d.category) + yScale.bandwidth() / 2)
    .attr("stroke", "#e5e7eb")
    .attr("stroke-width", 1);

  // X-axis
  g.append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(xAxis)
    .style("font-size", "11px");

  // Y-axis (categories)
  g.append("g").call(yAxis).style("font-size", "10px");

  // Zero line (center)
  g.append("line")
    .attr("x1", xScale(0))
    .attr("x2", xScale(0))
    .attr("y1", 0)
    .attr("y2", chartHeight)
    .attr("stroke", "#666")
    .attr("stroke-width", 2);

  // Worsened bars (red, left side)
  g.selectAll(".worsened-bar")
    .data(categoryStats.value)
    .enter()
    .append("rect")
    .attr("class", "worsened-bar")
    .attr("x", (d) => xScale(-d.worsenedPct))
    .attr("y", (d) => yScale(d.category))
    .attr("width", (d) => xScale(0) - xScale(-d.worsenedPct))
    .attr("height", yScale.bandwidth())
    .attr("fill", "#EF4444")
    .attr("opacity", 0.8)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);
      showTooltip(event, d, "worsened");
    })
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.8);
      hideTooltip();
    });

  // Improved bars (blue, right side)
  g.selectAll(".improved-bar")
    .data(categoryStats.value)
    .enter()
    .append("rect")
    .attr("class", "improved-bar")
    .attr("x", xScale(0))
    .attr("y", (d) => yScale(d.category))
    .attr("width", (d) => xScale(d.improvedPct) - xScale(0))
    .attr("height", yScale.bandwidth())
    .attr("fill", "#3B82F6")
    .attr("opacity", 0.8)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("opacity", 1);
      showTooltip(event, d, "improved");
    })
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 0.8);
      hideTooltip();
    });

  // // Labels on bars
  // // Worsened labels (on left bars)
  // g.selectAll(".worsened-label")
  //   .data(categoryStats.value.filter((d) => d.worsenedPct > 5))
  //   .enter()
  //   .append("text")
  //   .attr("class", "worsened-label")
  //   .attr("x", (d) => xScale(-d.worsenedPct / 2))
  //   .attr("y", (d) => yScale(d.category) + yScale.bandwidth() / 2)
  //   .attr("dy", "0.35em")
  //   .attr("text-anchor", "middle")
  //   .attr("fill", "white")
  //   .attr("font-size", "11px")
  //   .attr("font-weight", "600")
  //   .text((d) => `${Math.round(d.worsenedPct)}%`);

  // // Improved labels (on right bars)
  // g.selectAll(".improved-label")
  //   .data(categoryStats.value.filter((d) => d.improvedPct > 5))
  //   .enter()
  //   .append("text")
  //   .attr("class", "improved-label")
  //   .attr("x", (d) => xScale(d.improvedPct / 2))
  //   .attr("y", (d) => yScale(d.category) + yScale.bandwidth() / 2)
  //   .attr("dy", "0.35em")
  //   .attr("text-anchor", "middle")
  //   .attr("fill", "white")
  //   .attr("font-size", "11px")
  //   .attr("font-weight", "600")
  //   .text((d) => `${Math.round(d.improvedPct)}%`);

  // Axis labels
  svg
    .append("text")
    .attr("x", margin.left + chartWidth / 2)
    .attr("y", height - margin.bottom / 3)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "600")
    .text("Percentage of Locations of Interest");

  // Legend
  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right - 150}, 10)`);

  legend
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 20)
    .attr("height", 12)
    .attr("fill", "#3B82F6")
    .attr("opacity", 0.8);

  legend
    .append("text")
    .attr("x", 25)
    .attr("y", 10)
    .style("font-size", "12px")
    .text("Improved");

  legend
    .append("rect")
    .attr("x", 90)
    .attr("y", 0)
    .attr("width", 20)
    .attr("height", 12)
    .attr("fill", "#EF4444")
    .attr("opacity", 0.8);

  legend
    .append("text")
    .attr("x", 115)
    .attr("y", 10)
    .style("font-size", "12px")
    .text("Worsened");
};

const showTooltip = (event, d, type) => {
  const tooltip = d3.select("body").selectAll(".category-tooltip").data([null]);

  const tooltipEnter = tooltip
    .enter()
    .append("div")
    .attr("class", "category-tooltip")
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("padding", "8px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
    .style("z-index", "1000");

  const tooltipMerged = tooltipEnter.merge(tooltip);

  const content =
    type === "improved"
      ? `<strong>${d.category}</strong><br/>
         Improved: ${d.improved} (${d.improvedPct.toFixed(1)}%)<br/>
         Unchanged: ${d.unchanged} (${d.unchangedPct.toFixed(1)}%)<br/>
         Total: ${d.total}`
      : `<strong>${d.category}</strong><br/>
         Worsened: ${d.worsened} (${d.worsenedPct.toFixed(1)}%)<br/>
         Unchanged: ${d.unchanged} (${d.unchangedPct.toFixed(1)}%)<br/>
         Total: ${d.total}`;

  tooltipMerged
    .html(content)
    .style("left", event.pageX + 10 + "px")
    .style("top", event.pageY - 10 + "px")
    .style("opacity", 1);
};

const hideTooltip = () => {
  d3.select("body").selectAll(".category-tooltip").style("opacity", 0);
};

onMounted(() => {
  drawChart();
  window.addEventListener("resize", drawChart);
});

watch(
  () => [props.objectives, props.currentScenario, props.baselineScenario],
  () => {
    drawChart();
  },
  { deep: true },
);
</script>

<style scoped>
svg {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, sans-serif;
}
</style>
