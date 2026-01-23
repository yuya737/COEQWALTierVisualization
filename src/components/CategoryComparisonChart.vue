<template>
  <div class="w-full h-full bg-white p-4 flex flex-col">
    <h3 class="text-base font-semibold text-gray-800 mb-1">
      Category Comparison: {{ currentScenario }} vs {{ baselineScenario }}
    </h3>
    <div class="flex-1 w-full">
      <svg ref="svgRef" class="w-full h-full"></svg>
    </div>
    <p class="text-sm text-gray-600 mb-3 italic" v-html="summaryHTML"></p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
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

const margin = { top: 30, right: 30, bottom: 150, left: 80 };

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

// Generate natural language summary
const summary = computed(() => {
  const getDirection = (stat) => {
    const { improvedPct, worsenedPct, unchangedPct } = stat;

    // Thresholds for classification
    const DOMINANT_THRESHOLD = 70; // 70%+ for strong direction
    const MAJORITY_THRESHOLD = 50; // 50%+ for majority
    const MIXED_THRESHOLD = 30; // 30%+ for mixed

    if (unchangedPct > DOMINANT_THRESHOLD) {
      return "unaffected";
    }

    if (improvedPct > DOMINANT_THRESHOLD) {
      return "positive";
    }

    if (worsenedPct > DOMINANT_THRESHOLD) {
      return "negative";
    }

    if (improvedPct > MAJORITY_THRESHOLD && worsenedPct < MIXED_THRESHOLD) {
      return "mostly positive";
    }

    if (worsenedPct > MAJORITY_THRESHOLD && improvedPct < MIXED_THRESHOLD) {
      return "mostly negative";
    }

    if (improvedPct > worsenedPct && improvedPct >= MIXED_THRESHOLD) {
      return "mixed-positive";
    }

    if (worsenedPct > improvedPct && worsenedPct >= MIXED_THRESHOLD) {
      return "mixed-negative";
    }

    return "mixed-neutral";
  };

  const categorizedStats = categoryStats.value.map((stat) => ({
    ...stat,
    direction: getDirection(stat),
  }));

  // Group categories by direction
  const positive = categorizedStats.filter((s) => s.direction === "positive");
  const mostlyPositive = categorizedStats.filter(
    (s) => s.direction === "mostly positive",
  );
  const mixedPositive = categorizedStats.filter(
    (s) => s.direction === "mixed-positive",
  );
  const negative = categorizedStats.filter((s) => s.direction === "negative");
  const mostlyNegative = categorizedStats.filter(
    (s) => s.direction === "mostly negative",
  );
  const mixedNegative = categorizedStats.filter(
    (s) => s.direction === "mixed-negative",
  );
  const mixedNeutral = categorizedStats.filter(
    (s) => s.direction === "mixed-neutral",
  );
  const unaffected = categorizedStats.filter(
    (s) => s.direction === "unaffected",
  );

  // Build summary text
  const parts = [];
  let hasUnaffected = false;

  if (positive.length > 0) {
    parts.push(
      `${positive.map((s) => s.category).join(", ")} show positive effects`,
    );
  }

  if (mostlyPositive.length > 0) {
    parts.push(
      `${mostlyPositive.map((s) => s.category).join(", ")} show mostly positive effects`,
    );
  }

  if (mixedPositive.length > 0) {
    parts.push(
      `${mixedPositive.map((s) => s.category).join(", ")} show mixed-positive effects`,
    );
  }

  if (negative.length > 0) {
    parts.push(
      `${negative.map((s) => s.category).join(", ")} show negative effects`,
    );
  }

  if (mostlyNegative.length > 0) {
    parts.push(
      `${mostlyNegative.map((s) => s.category).join(", ")} show mostly negative effects`,
    );
  }

  if (mixedNegative.length > 0) {
    parts.push(
      `${mixedNegative.map((s) => s.category).join(", ")} show mixed-negative effects`,
    );
  }

  if (mixedNeutral.length > 0) {
    parts.push(
      `${mixedNeutral.map((s) => s.category).join(", ")} show mixed-neutral effects`,
    );
  }

  // Check if there are unaffected categories
  if (unaffected.length > 0) {
    hasUnaffected = true;
  }

  if (parts.length === 0 && !hasUnaffected) {
    return "No significant changes detected.";
  }

  if (parts.length === 0 && hasUnaffected) {
    return "All categories remain unaffected.";
  }

  // Join with proper grammar
  let result = "";
  if (parts.length === 1) {
    result = parts[0];
  } else if (parts.length === 2) {
    result = parts.join(" and ");
  } else {
    const lastPart = parts.pop();
    result = parts.join(", ") + ", and " + lastPart;
  }

  // Add "the rest unaffected" if there are unaffected categories
  if (hasUnaffected) {
    result += ", the rest unaffected";
  }

  return result + ".";
});

// Generate HTML version with bold categories and colored directions
const summaryHTML = computed(() => {
  const getDirection = (stat) => {
    const { improved, worsened, unchangedPct } = stat;

    // Thresholds for classification
    const DOMINANT_THRESHOLD = 70;
    const MAJORITY_THRESHOLD = 50;

    if (unchangedPct == 100) {
      return "unaffected";
    }

    // Mixed requires BOTH improved AND worsened objectives
    const hasBoth = improved > 0 && worsened > 0;

    if (!hasBoth) {
      // Pure positive or negative (no mixing)
      if (improved > 0 && worsened === 0) {
        return stat.improvedPct > DOMINANT_THRESHOLD
          ? "positive"
          : "mostly positive";
      }
      if (worsened > 0 && improved === 0) {
        return stat.worsenedPct > DOMINANT_THRESHOLD
          ? "negative"
          : "mostly negative";
      }
    }

    // Has both - classify as mixed
    if (stat.improvedPct > DOMINANT_THRESHOLD) {
      return "positive";
    }

    if (stat.worsenedPct > DOMINANT_THRESHOLD) {
      return "negative";
    }

    if (stat.improvedPct > MAJORITY_THRESHOLD) {
      return "mostly positive";
    }

    if (stat.worsenedPct > MAJORITY_THRESHOLD) {
      return "mostly negative";
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
    if (direction === "positive" || direction === "mostly positive") {
      return "#3B82F6"; // Blue
    }
    if (direction === "negative" || direction === "mostly negative") {
      return "#EF4444"; // Red
    }
    if (direction === "mixed-positive") {
      return "#60A5FA"; // Light blue
    }
    if (direction === "mixed-negative") {
      return "#F87171"; // Light red
    }
    return "#6B7280"; // Gray for neutral/unaffected
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
  console.log(categorizedStats);

  // Group categories by direction
  const positive = categorizedStats.filter((s) => s.direction === "positive");
  const mostlyPositive = categorizedStats.filter(
    (s) => s.direction === "mostly positive",
  );
  const mixedPositive = categorizedStats.filter(
    (s) => s.direction === "mixed-positive",
  );
  const negative = categorizedStats.filter((s) => s.direction === "negative");
  const mostlyNegative = categorizedStats.filter(
    (s) => s.direction === "mostly negative",
  );
  const mixedNegative = categorizedStats.filter(
    (s) => s.direction === "mixed-negative",
  );
  const mixedNeutral = categorizedStats.filter(
    (s) => s.direction === "mixed-neutral",
  );
  const unaffected = categorizedStats.filter(
    (s) => s.direction === "unaffected",
  );

  // Build summary text with HTML
  const parts = [];
  let hasUnaffected = false;

  if (positive.length > 0) {
    parts.push(formatCategoryGroup(positive, "show positive effects"));
  }

  if (mostlyPositive.length > 0) {
    parts.push(
      formatCategoryGroup(mostlyPositive, "show mostly positive effects"),
    );
  }

  if (mixedPositive.length > 0) {
    parts.push(
      formatCategoryGroup(mixedPositive, "show mixed-positive effects"),
    );
  }

  if (negative.length > 0) {
    parts.push(formatCategoryGroup(negative, "show negative effects"));
  }

  if (mostlyNegative.length > 0) {
    parts.push(
      formatCategoryGroup(mostlyNegative, "show mostly negative effects"),
    );
  }

  if (mixedNegative.length > 0) {
    parts.push(
      formatCategoryGroup(mixedNegative, "show mixed-negative effects"),
    );
  }

  if (mixedNeutral.length > 0) {
    parts.push(formatCategoryGroup(mixedNeutral, "show mixed-neutral effects"));
  }

  // Check if there are unaffected categories
  if (unaffected.length > 0) {
    hasUnaffected = true;
  }

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

  // Scales
  const xScale = d3
    .scaleBand()
    .domain(categoryStats.value.map((d) => d.category))
    .range([0, chartWidth])
    .padding(0.3);

  const yScale = d3.scaleLinear().domain([-100, 100]).range([chartHeight, 0]);

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(10)
    .tickFormat((d) => `${Math.abs(d)}%`);

  // X-axis (at bottom)
  g.append("g")
    .attr("transform", `translate(0,${chartHeight * 1.1})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-20)")
    .style("text-anchor", "end")
    .style("font-size", "12px");

  // Y-axis
  g.append("g").call(yAxis).style("font-size", "12px");

  // Zero line
  g.append("line")
    .attr("x1", 0)
    .attr("x2", chartWidth)
    .attr("y1", yScale(0))
    .attr("y2", yScale(0))
    .attr("stroke", "#666")
    .attr("stroke-width", 2);

  // Improved bars (blue, upward)
  g.selectAll(".improved-bar")
    .data(categoryStats.value)
    .enter()
    .append("rect")
    .attr("class", "improved-bar")
    .attr("x", (d) => xScale(d.category))
    .attr("y", (d) => yScale(d.improvedPct))
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => yScale(0) - yScale(d.improvedPct))
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

  // Worsened bars (red, downward)
  g.selectAll(".worsened-bar")
    .data(categoryStats.value)
    .enter()
    .append("rect")
    .attr("class", "worsened-bar")
    .attr("x", (d) => xScale(d.category))
    .attr("y", yScale(0))
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => yScale(-d.worsenedPct) - yScale(0))
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

  // Labels on bars
  g.selectAll(".improved-label")
    .data(categoryStats.value.filter((d) => d.improvedPct > 5))
    .enter()
    .append("text")
    .attr("class", "improved-label")
    .attr("x", (d) => xScale(d.category) + xScale.bandwidth() / 2)
    .attr("y", (d) => yScale(d.improvedPct) - 5)
    .attr("text-anchor", "middle")
    .attr("fill", "#1E40AF")
    .attr("font-size", "11px")
    .attr("font-weight", "600")
    .text((d) => `${d.improved}`);

  g.selectAll(".worsened-label")
    .data(categoryStats.value.filter((d) => d.worsenedPct > 5))
    .enter()
    .append("text")
    .attr("class", "worsened-label")
    .attr("x", (d) => xScale(d.category) + xScale.bandwidth() / 2)
    .attr("y", (d) => yScale(-d.worsenedPct) + 15)
    .attr("text-anchor", "middle")
    .attr("fill", "#991B1B")
    .attr("font-size", "11px")
    .attr("font-weight", "600")
    .text((d) => `${d.worsened}`);

  // Axis labels
  svg
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "600")
    .text("Percentage of Objectives");

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "600")
    .text("Category");

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
