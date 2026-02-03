import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import * as d3 from 'd3';
import {
  fetchData,
  fetchAvailableScenarios,
  fetchShortCodes,
  fetchGeoShapes,
} from '../utils'; // Ensure these paths match your project structure
import GW_STOR from '../GW_STOR';
import RES_STOR from '../RES_STOR';
import CategoryComparisonChart from './CategoryComparisonChart'; // Assuming this is also converted
import {
  calculateBarPlotPositions,
  calculateTierPositions,
  calculateTreemapPositions,
  calculateCategoryWidths,
} from '../UnitVisPositionCalculation';


// --- Interfaces ---
interface Scenario {
  scenario_code: string;
  name?: string;
}

export interface Objective {
  id: number;
  category: string;
  tier: string;
  baselineTier: string;
  waterVolume: number;
  unmetDemand: number;
  withinCategoryIndex: number;
  [key: string]: any;
}

interface PolygonFeature {
  type: string;
  properties: any;
  geometry: any;
}

interface TierShortCode {
  short_code: string;
  name: string;
}

// Props accepted by the component
interface Props {
  className?: string;
  onPolygonSelect?: (polygons: any[]) => void;
  onObjectivesSelect?: (objectives: Objective[]) => void;
  onObjectivesInit?: (objectives: Objective[]) => void;
}

// Methods exposed to the parent via ref
export interface AnimatedTierTreemapHandle {
  updateMapFromSelection: (objectives: Objective[]) => void;
}

// --- Constants ---
const TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const MARGIN = { top: 60, right: 50, bottom: 150, left: 100 };

const COLORS = {
  grayColor: "#D1D5DB",
  lightBlue: "#93C5FD",
  defaultBlue: "#2c7fb8",
  redColor: "#F87171",
};

const TIER_COLOR_MAP: Record<string, number[]> = {
  "Tier 1": [74, 200, 167], // Muted green
  "Tier 2": [120, 165, 250], // Muted blue
  "Tier 3": [253, 212, 103], // Muted yellow
  "Tier 4": [244, 126, 126], // Muted red
};

export const AnimatedTierTreemap = forwardRef<AnimatedTierTreemapHandle, Props>((props, ref) => {
  // --- State ---
  const [currentScenario, setCurrentScenario] = useState("s0011");
  const [baselineScenario, setBaselineScenario] = useState("s0020");
  const [availableScenarios, setAvailableScenarios] = useState<Scenario[]>([]);
  const [viewMode, setViewMode] = useState<"tier" | "treemap" | "barplot">("tier");
  const [showComparison, setShowComparison] = useState(false);
  const [colorMode, setColorMode] = useState<"default" | "tier" | "category" | "waterVolume">("default");
  const [selectedObjectives, setSelectedObjectives] = useState<Objective[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCategoryChart, setShowCategoryChart] = useState(false);

  // Data State
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Refs for D3 and heavy data
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const geoJSONs = useRef<Record<string, { features: PolygonFeature[] }>>({});
  const tierShortList = useRef<TierShortCode[]>([]);
  
  // Scales
  const categoryColorScale = useMemo(() => d3.scaleOrdinal(d3.schemeTableau10), []);

  // --- Helpers ---

  // Helper to trigger effects only when dependencies change deeply (optional, but standard React useEffect dependency arrays handle most cases)
  
  // Expose method to parent
  useImperativeHandle(ref, () => ({
    updateMapFromSelection(newObjectives: Objective[]) {
      if (!newObjectives || newObjectives.length === 0) {
        setSelectedObjectives([]);
        // Clear highlights manually via D3 to be instant
        const svg = d3.select(svgRef.current);
        svg.selectAll(".animated-shape").classed("highlighted", false);
      } else {
        setSelectedObjectives(newObjectives);
        // Note: The useEffect for selectedObjectives will handle the prop notification,
        // but we can force the visual update here immediately if needed.
        highlightObjectives(newObjectives);
      }
    }
  }));

  const highlightObjectives = (objs: Objective[]) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll(".animated-shape").classed("highlighted", false);
    objs.forEach((obj) => {
      svg.selectAll(".animated-shape")
         .filter((d: any) => d.obj.id === obj.id)
         .classed("highlighted", true);
    });
  };

  // --- D3 Logic ---

  const drawLegends = (width: number, height: number) => {
    const svg = d3.select(svgRef.current);
    // Remove old legends
    svg.selectAll(".legend-item").remove();
    svg.selectAll(".legend-gradient").remove();

    // Comparison Legend
    if (viewMode === "tier" && showComparison) {
      const legendX = MARGIN.left;
      const legendY = MARGIN.top - 25;
      const legendItemSize = 18;
      const legendSpacing = 120;

      // Up triangle
      const upPath = `M ${legendX},${legendY - legendItemSize * 0.4} L ${legendX + legendItemSize * 0.45},${legendY + legendItemSize * 0.4} L ${legendX - legendItemSize * 0.45},${legendY + legendItemSize * 0.4} Z`;
      svg.append("path").attr("class", "legend-item").attr("d", upPath).attr("fill", COLORS.defaultBlue);
      svg.append("text").attr("class", "legend-item").attr("x", legendX + 15).attr("y", legendY + 5).style("font-size", "1.1rem").text("Improved");

      // Square
      svg.append("rect").attr("class", "legend-item").attr("x", legendX + legendSpacing - legendItemSize / 2).attr("y", legendY - legendItemSize / 2).attr("width", legendItemSize).attr("height", legendItemSize).attr("fill", COLORS.lightBlue);
      svg.append("text").attr("class", "legend-item").attr("x", legendX + legendSpacing + 15).attr("y", legendY + 5).style("font-size", "1.1rem").text("No Change");

      // Down triangle
      const downPath = `M ${legendX + legendSpacing * 2},${legendY + legendItemSize * 0.4} L ${legendX + legendSpacing * 2 + legendItemSize * 0.45},${legendY - legendItemSize * 0.4} L ${legendX + legendSpacing * 2 - legendItemSize * 0.45},${legendY - legendItemSize * 0.4} Z`;
      svg.append("path").attr("class", "legend-item").attr("d", downPath).attr("fill", COLORS.redColor);
      svg.append("text").attr("class", "legend-item").attr("x", legendX + legendSpacing * 2 + 15).attr("y", legendY + 5).style("font-size", "1.1rem").text("Worsened");

      // Baseline Box
      svg.append("rect").attr("class", "legend-item").attr("x", legendX + legendSpacing * 3 - legendItemSize / 2).attr("y", legendY - legendItemSize / 2).attr("width", legendItemSize).attr("height", legendItemSize).attr("stroke", COLORS.lightBlue).attr("stroke-width", 1).attr("stroke-dasharray", "2.5,2.5").attr("fill", "none");
      svg.append("text").attr("class", "legend-item").attr("x", legendX + legendSpacing * 3 + 15).attr("y", legendY + 5).style("font-size", "1.1rem").text("Baseline");
    }

    // Water Volume Legend
    if (colorMode === "waterVolume" && objectives.length > 0) {
      const waterVolumeExtent = d3.extent(objectives, (d) => d.waterVolume) as [number, number];
      const colorScale = d3.scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2)).domain(waterVolumeExtent);

      const legendX = width - 200;
      const legendY = 0;
      const gradientWidth = 150;
      const gradientHeight = 20;

      const gradientId = "waterVolumeGradient";
      svg.selectAll(`#${gradientId}`).remove();
      const defs = svg.select("defs").size() ? svg.select("defs") : svg.append("defs");
      const gradient = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("x2", "100%");

      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const value = waterVolumeExtent[0] + t * (waterVolumeExtent[1] - waterVolumeExtent[0]);
        gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(value));
      }

      svg.append("rect").attr("class", "legend-gradient").attr("x", legendX).attr("y", legendY).attr("width", gradientWidth).attr("height", gradientHeight).style("fill", `url(#${gradientId})`).attr("stroke", "#999").attr("stroke-width", 1);
      svg.append("text").attr("class", "legend-gradient").attr("x", legendX).attr("y", legendY - 5).style("font-size", "0.9rem").style("font-weight", "600").text("Water Volume (Random)");
      svg.append("text").attr("class", "legend-gradient").attr("x", legendX).attr("y", legendY + gradientHeight + 15).style("font-size", "0.8rem").text(`${Math.round(waterVolumeExtent[0])} TAF`);
      svg.append("text").attr("class", "legend-gradient").attr("x", legendX + gradientWidth).attr("y", legendY + gradientHeight + 15).attr("text-anchor", "end").style("font-size", "0.8rem").text(`${Math.round(waterVolumeExtent[1])} TAF`);
    }

    // Category Legend
    if (colorMode === "category") {
      const legendX = MARGIN.left;
      const legendY = 0;
      const colorBoxSize = 14;
      const itemSpacing = 15;
      const rowSpacing = 22;
      const itemsPerRow = Math.ceil(categories.length / 2);
      
      let currentX = legendX;
      let currentRow = 0;

      categories.forEach((category, i) => {
        if (i === itemsPerRow) {
          currentX = legendX;
          currentRow = 1;
        }
        const yPos = legendY + currentRow * rowSpacing;
        
        svg.append("rect").attr("class", "legend-item").attr("x", currentX).attr("y", yPos).attr("width", colorBoxSize).attr("height", colorBoxSize).attr("fill", categoryColorScale(category)).attr("stroke", "#999").attr("stroke-width", 1);
        const text = svg.append("text").attr("class", "legend-item").attr("x", currentX + colorBoxSize + 5).attr("y", yPos + colorBoxSize / 2).attr("alignment-baseline", "middle").style("font-size", "0.75rem").text(category);
        
        const textWidth = text.node()?.getComputedTextLength() || 0;
        currentX += colorBoxSize + 5 + textWidth + itemSpacing;
      });
    }

    // Tier Legend
    if (colorMode === "tier" && !showComparison) {
      const legendX = MARGIN.left;
      const legendY = 0;
      const colorBoxSize = 14;
      const itemSpacing = 15;
      const rowSpacing = 22;
      const itemsPerRow = TIERS.length;
      
      let currentX = legendX;
      let currentRow = 0;

      TIERS.forEach((tier, i) => {
        if (i === itemsPerRow) {
          currentX = legendX;
          currentRow = 1;
        }
        const yPos = legendY + currentRow * rowSpacing;
        const tierColor = TIER_COLOR_MAP[tier];

        svg.append("rect").attr("class", "legend-item").attr("x", currentX).attr("y", yPos).attr("width", colorBoxSize).attr("height", colorBoxSize).attr("fill", `rgb(${tierColor[0]}, ${tierColor[1]}, ${tierColor[2]})`).attr("stroke", "#999").attr("stroke-width", 1);
        const text = svg.append("text").attr("class", "legend-item").attr("x", currentX + colorBoxSize + 5).attr("y", yPos + colorBoxSize / 2).attr("alignment-baseline", "middle").style("font-size", "0.75rem").text(tier);
        
        const textWidth = text.node()?.getComputedTextLength() || 0;
        currentX += colorBoxSize + 5 + textWidth + itemSpacing;
      });
    }
  };

  const drawLabelsAndGrid = (width: number, height: number, cellLayouts: any[]) => {
    const svg = d3.select(svgRef.current);
    const gridWidth = width - MARGIN.left - MARGIN.right;
    const gridHeight = height - MARGIN.top - MARGIN.bottom;
    const cellHeight = gridHeight / TIERS.length;

    // Cleanup
    svg.selectAll(".tier-label").remove();
    svg.selectAll(".category-label-group").remove();
    svg.selectAll(".grid-line").remove();
    svg.selectAll(".y-axis").remove();
    svg.selectAll(".axis-label").remove();

    if (viewMode === "barplot") {
      const plotHeight = height - MARGIN.top - MARGIN.bottom;
      const maxUnmetDemand = d3.max(objectives, (d) => d.unmetDemand) || 0;
      const yScale = d3.scaleLinear().domain([0, maxUnmetDemand]).range([MARGIN.top + plotHeight, MARGIN.top]);
      const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => `${d}`);
      
      svg.append("g").attr("class", "y-axis").attr("transform", `translate(${MARGIN.left}, 0)`).call(yAxis).style("font-size", "11px");
      svg.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -(MARGIN.top + plotHeight / 2)).attr("y", MARGIN.left - 40).attr("text-anchor", "middle").style("font-size", "12px").style("font-weight", "600").text("Unmet Demand (TAF)");
      return;
    }

    if (viewMode !== "tier") return;

    // Grid Lines
    const categoryLayouts = calculateCategoryWidths(objectives, categories, gridWidth);
    
    // Vertical lines
    categoryLayouts.forEach((layout: any) => {
      svg.append("line").attr("class", "grid-line").attr("x1", MARGIN.left + layout.startX).attr("y1", MARGIN.top).attr("x2", MARGIN.left + layout.startX).attr("y2", MARGIN.top + gridHeight).attr("stroke", "#D1D5DB").attr("stroke-width", 1);
    });
    // Final vertical line
    svg.append("line").attr("class", "grid-line").attr("x1", MARGIN.left + gridWidth).attr("y1", MARGIN.top).attr("x2", MARGIN.left + gridWidth).attr("y2", MARGIN.top + gridHeight).attr("stroke", "#D1D5DB").attr("stroke-width", 1);

    // Horizontal lines
    TIERS.forEach((_, i) => {
      svg.append("line").attr("class", "grid-line").attr("x1", MARGIN.left).attr("y1", MARGIN.top + i * cellHeight).attr("x2", MARGIN.left + gridWidth).attr("y2", MARGIN.top + i * cellHeight).attr("stroke", "#D1D5DB").attr("stroke-width", 1);
    });

    // Tier Labels
    svg.selectAll(".tier-label").data(TIERS).enter().append("text").attr("class", "tier-label").attr("x", MARGIN.left - 10).attr("y", (d, i) => MARGIN.top + i * cellHeight + cellHeight / 2).attr("text-anchor", "end").attr("alignment-baseline", "middle").style("font-size", "1rem").text((d) => d);

    // Category Labels (Grouped)
    const categoryGroups = svg.selectAll(".category-label-group").data(categoryLayouts).enter().append("g").attr("class", "category-label-group").attr("transform", (layout: any) => {
      const x_trans = MARGIN.left + layout.startX + layout.width / 2;
      const y_trans = MARGIN.top + gridHeight + 25;
      return `translate(${x_trans}, ${y_trans}) rotate(90)`;
    }).style("cursor", "pointer");

    categoryGroups.each(function(d: any) {
      const group = d3.select(this);
      const bg = group.append("rect").attr("class", "category-bg").attr("rx", 4).attr("ry", 4).attr("fill", "#F9FAFB").attr("stroke", "#E5E7EB").attr("stroke-width", 1);
      
      const text = group.append("text").attr("class", "category-label").attr("text-anchor", "start").attr("y", 0).style("font-size", "0.875rem").style("font-weight", "500").style("fill", "#4B5563");
      
      // Simple text wrapping logic (simplified for React port)
      text.text(d.category);

      const bbox = text.node()?.getBBox();
      if (bbox) {
        const padding = 6;
        bg.attr("x", bbox.x - padding).attr("y", bbox.y - padding).attr("width", bbox.width + padding * 2).attr("height", bbox.height + padding * 2);
      }
    });

    // Label interactions
    categoryGroups
      .on("mouseover", function() { d3.select(this).select(".category-bg").transition().duration(150).attr("fill", "#F3F4F6").attr("stroke", "#D1D5DB"); })
      .on("mouseout", function() { d3.select(this).select(".category-bg").transition().duration(150).attr("fill", "#F9FAFB").attr("stroke", "#E5E7EB"); })
      .on("click", (event, d: any) => handleCategorySelect(d.category));
  };

  const drawTierBackgrounds = (width: number, height: number) => {
    const svg = d3.select(svgRef.current);
    const gridWidth = width - MARGIN.left - MARGIN.right;
    const gridHeight = height - MARGIN.top - MARGIN.bottom;
    const cellHeight = gridHeight / TIERS.length;
    const tierColors = ["#ECFDF5", "#EFF6FF", "#FEFCE8", "#FEF2F2"];
    
    const categoryLayouts = calculateCategoryWidths(objectives, categories, gridWidth);
    
    const cellBackgrounds: any[] = [];
    TIERS.forEach((tier, tierIndex) => {
      categoryLayouts.forEach((layout: any) => {
        cellBackgrounds.push({
          tier, tierIndex, category: layout.category,
          x: MARGIN.left + layout.startX,
          y: MARGIN.top + tierIndex * cellHeight,
          width: layout.width, height: cellHeight
        });
      });
    });

    svg.selectAll(".tier-background")
      .data(cellBackgrounds, (d: any) => `${d.tier}-${d.category}`)
      .join("rect")
      .attr("class", "tier-background")
      .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("width", (d) => d.width).attr("height", (d) => d.height)
      .attr("fill", (d) => tierColors[d.tierIndex])
      .attr("stroke", "#D1D5DB").attr("stroke-width", 0.5)
      .attr("opacity", viewMode === "tier" ? 1 : 0)
      .style("cursor", "pointer")
      .on("click", (event, d) => handleCategoryTierSelect(d.category, d.tier));
  };

  const animateTransition = (shouldAnimate = true) => {
    if (!svgRef.current || objectives.length === 0) return;

    const width = containerRef.current?.getBoundingClientRect().width || 800;
    const height = containerRef.current?.getBoundingClientRect().height || 600;
    const svg = d3.select(svgRef.current);
    const duration = shouldAnimate ? 1500 : 0;

    // Backgrounds & Grid
    drawTierBackgrounds(width, height);
    drawLabelsAndGrid(width, height, []); // Layouts recalculated inside
    drawLegends(width, height);

    // Calculate Positions
    const { positions: tierPositions, cellLayouts } = calculateTierPositions(objectives, categories, TIERS, width, height, showComparison);
    const treemapPositions = calculateTreemapPositions(objectives, width, height);
    const barPlotPositions = calculateBarPlotPositions(objectives, width, height);

    const tierPosMap = new Map(tierPositions.map((p: any) => [p.id, p]));
    const treemapPosMap = new Map(treemapPositions.map((p: any) => [p.id, p]));
    const barPlotPosMap = new Map(barPlotPositions.map((p: any) => [p.id, p]));

    // Determine Fill Color
    const getFillColor = (d: any) => {
      if (colorMode === "waterVolume") {
        const waterVolumeExtent = d3.extent(objectives, (obj) => obj.waterVolume) as [number, number];
        const colorScale = d3.scaleSequential((t) => d3.interpolateBlues(t * 0.7 + 0.2)).domain(waterVolumeExtent);
        return colorScale(d.waterVolume);
      }
      if (colorMode === "category") return categoryColorScale(d.category);
      if (colorMode === "tier" || colorMode === "default") {
        if (showComparison) {
          const cT = TIERS.indexOf(d.tier);
          const bT = TIERS.indexOf(d.baselineTier);
          if (cT === bT) return COLORS.lightBlue;
          return cT < bT ? COLORS.defaultBlue : COLORS.redColor;
        }
        if (colorMode === "tier") {
          const c = TIER_COLOR_MAP[d.tier];
          return c ? `rgb(${c[0]},${c[1]},${c[2]})` : COLORS.defaultBlue;
        }
        return COLORS.defaultBlue;
      }
      return COLORS.defaultBlue;
    };

    // Shape Data
    const allData = viewMode === "tier" ? tierPositions : (viewMode === "treemap" ? treemapPositions : barPlotPositions);
    
    // Join
    const shapes = svg.selectAll(".animated-shape").data(allData, (d: any) => d.id);

    const createPath = (d: any, pos: any) => {
      if (pos.shape === "triangle-up") {
        const cx = pos.x + pos.width / 2, cy = pos.y + pos.height / 2;
        return `M ${cx},${cy - pos.height / 2} L ${cx + pos.width * 0.45},${cy + pos.height / 2} L ${cx - pos.width * 0.45},${cy + pos.height / 2} Z`;
      }
      if (pos.shape === "triangle-down") {
        const cx = pos.x + pos.width / 2, cy = pos.y + pos.height / 2;
        return `M ${cx},${cy + pos.height / 2} L ${cx + pos.width * 0.45},${cy - pos.height / 2} L ${cx - pos.width * 0.45},${cy - pos.height / 2} Z`;
      }
      return null;
    };

    const enterShapes = shapes.enter().append("path")
      .attr("class", "animated-shape")
      .attr("stroke", "#fff").attr("stroke-width", 1)
      .style("cursor", "pointer")
      .attr("fill", (d: any) => getFillColor(d.obj))
      .attr("opacity", (d: any) => categoryFilter === "all" || d.obj.category === categoryFilter ? 1 : 0.15);

    // Initial position for enter
    enterShapes.each(function(d: any) {
        // Simple default if not transitioning from another view
        const pos = viewMode === "tier" ? tierPosMap.get(d.id) : (viewMode === "treemap" ? treemapPosMap.get(d.id) : barPlotPosMap.get(d.id));
        if(!pos) return;
        const path = createPath(d.obj, pos);
        d3.select(this).attr("d", path || `M ${pos.x},${pos.y} h ${pos.width} v ${pos.height} h -${pos.width} Z`);
    });

    const allShapes = enterShapes.merge(shapes as any);

    allShapes.transition().duration(duration).ease(d3.easeCubicOut)
      .attr("d", (d: any) => {
        const targetPos = viewMode === "tier" ? tierPosMap.get(d.id) : (viewMode === "treemap" ? treemapPosMap.get(d.id) : barPlotPosMap.get(d.id));
        if (!targetPos) return "";
        const path = createPath(d.obj, targetPos);
        return path || `M ${targetPos.x},${targetPos.y} h ${targetPos.width} v ${targetPos.height} h -${targetPos.width} Z`;
      })
      .attr("fill", (d: any) => d.shape === "baseline-rect" ? "none" : getFillColor(d.obj))
      .attr("stroke", (d: any) => {
        const isSelected = selectedObjectives.some(o => o.id === d.obj.id);
        if (isSelected) return "#333";
        if (d.shape === "baseline-rect") {
            const worsened = d.obj.tier > d.obj.baselineTier;
            return worsened ? COLORS.redColor : COLORS.lightBlue;
        }
        return "#fff";
      })
      .attr("stroke-width", (d: any) => selectedObjectives.some(o => o.id === d.obj.id) ? 3 : 1)
      .attr("stroke-dasharray", (d: any) => d.shape === "baseline-rect" ? "2.5,2.5" : "0")
      .attr("opacity", (d: any) => categoryFilter === "all" || d.obj.category === categoryFilter ? 1 : 0.15);

    shapes.exit().remove();

    // Event Listeners
    allShapes
      .on("click", (event, d: any) => handleShapeClick(d.obj))
      .on("mouseover", function(event, d: any) {
        if (!selectedObjectives.some(o => o.id === d.obj.id)) {
           d3.select(this).classed("highlighted", true);
        }
      })
      .on("mouseout", function(event, d: any) {
        if (!selectedObjectives.some(o => o.id === d.obj.id)) {
           d3.select(this).classed("highlighted", false);
        }
      });
  };

  // --- Interaction Handlers ---

  const handleShapeClick = (obj: Objective) => {
    const isSelected = selectedObjectives.some(o => o.id === obj.id);
    let newSelection = [];
    if (isSelected) {
      newSelection = selectedObjectives.filter(o => o.id !== obj.id);
    } else {
      newSelection = [...selectedObjectives, obj];
    }
    setSelectedObjectives(newSelection);
    highlightObjectives(newSelection);
  };

  const removeSelectedObjective = (id: number) => {
    const newSelection = selectedObjectives.filter(o => o.id !== id);
    setSelectedObjectives(newSelection);
    highlightObjectives(newSelection);
  };

  const clearAllSelected = () => {
    setSelectedObjectives([]);
    highlightObjectives([]);
  };

  const handleCategorySelect = (categoryName: string) => {
    const newSelection = objectives.filter(o => o.category === categoryName);
    setSelectedObjectives(newSelection);
    highlightObjectives(newSelection);
  };

  const handleCategoryTierSelect = (categoryName: string, tierName: string) => {
    const newSelection = objectives.filter(o => o.category === categoryName && o.tier === tierName);
    setSelectedObjectives(newSelection);
    highlightObjectives(newSelection);
  };

  // --- Lifecycle Effects ---

  // 1. Initial Data Fetch
  useEffect(() => {
    const init = async () => {
      const scenarios = await fetchAvailableScenarios();
      setAvailableScenarios(scenarios);

      const codes = await fetchShortCodes();
      tierShortList.current = codes;

      // Load GeoShapes
      for (const tier of codes) {
        if (tier.short_code === "GW_STOR") geoJSONs.current[tier.short_code] = GW_STOR;
        else if (tier.short_code === "RES_STOR") geoJSONs.current[tier.short_code] = RES_STOR;
        else {
          geoJSONs.current[tier.short_code] = await fetchGeoShapes(tier.short_code);
        }
      }
      
      loadData();
    };
    init();
  }, []);

  // 2. Load Data when Scenarios Change
  const loadData = async () => {
    const [baseRes, compRes] = await Promise.all([
      fetchData(baselineScenario, TIERS),
      fetchData(currentScenario, TIERS)
    ]);

    if (!baseRes?.data || !compRes?.data) {
      console.warn("Data loading failed or returned empty: ", {baseRes, compRes});
      return;
    }

    setCategories(baseRes.categories || []);

    const processedObjectives = baseRes.data.map((obj: any) => {
      const compObj = compRes.data.find((c: any) => c.id === obj.id);
      return {
        ...obj,
        unmetDemand: obj.unmetDemand ?? 0,
        baselineTier: obj.tier,
        tier: compObj ? compObj.tier : obj.tier,
      };
    });

    setObjectives(processedObjectives);
    if (props.onObjectivesInit) props.onObjectivesInit(processedObjectives);
  };

  useEffect(() => {
    loadData();
  }, [currentScenario, baselineScenario]);

  // 3. Render / Animate when state changes
  useEffect(() => {
    animateTransition(true);
  }, [objectives, viewMode, showComparison, colorMode, categoryFilter]);

  // 4. Handle Polygon Emission (equivalent to Vue watcher on selectedObjectives)
  useEffect(() => {
    if (selectedObjectives.length === 0) {
      if (props.onPolygonSelect) props.onPolygonSelect([]);
      if (props.onObjectivesSelect) props.onObjectivesSelect([]);
      return;
    }

    const polygons = selectedObjectives.map(objective => {
       const tierCode = tierShortList.current.find(t => t.name === objective.category)?.short_code;
       if (!tierCode || !geoJSONs.current[tierCode]) return null;
       
       const features = geoJSONs.current[tierCode].features;
       const feature = features[objective.withinCategoryIndex % features.length];
       const tierColor = TIER_COLOR_MAP[objective.tier];
       
       return {
         ...feature,
         properties: {
           ...feature.properties,
           fillColor: tierColor,
           id: objective.id
         }
       };
    }).filter(p => p !== null);

    if (props.onPolygonSelect) props.onPolygonSelect(polygons);
    if (props.onObjectivesSelect) props.onObjectivesSelect(selectedObjectives);

  }, [selectedObjectives]);

  return (
    <div className={`w-full h-full bg-white p-5 relative flex flex-col overflow-hidden ${props.className || ''}`}>
      <style>{`
        .animated-shape.highlighted { stroke: #333 !important; stroke-width: 2 !important; }
      `}</style>
      
      {/* Controls Header */}
      <div className="flex flex-col gap-3 mb-5 mt-3">
        <h2 className="font-semibold text-gray-800 m-0 text-lg">
          {showComparison ? `Comparing ${currentScenario} and ${baselineScenario}` : `Viewing scenario ${currentScenario}`}
        </h2>

        <div className="flex gap-4 items-center flex-wrap">
          {/* Scenario Select */}
          <div className="flex gap-2 items-center">
            <label className="text-sm font-semibold text-gray-700">{showComparison ? "Scenario 1:" : "Scenario:"}</label>
            <select value={currentScenario} onChange={(e) => setCurrentScenario(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
              {availableScenarios.map(s => <option key={s.scenario_code} value={s.scenario_code}>{s.scenario_code}</option>)}
            </select>
          </div>

          {/* Comparison Toggle */}
          <button 
            onClick={() => { setShowComparison(!showComparison); setViewMode('tier'); }} // Force tier view on compare toggle
            disabled={viewMode !== 'tier'}
            className={`px-3 py-1.5 border rounded-md text-sm flex items-center gap-1.5 ${viewMode !== 'tier' ? 'bg-gray-100 text-gray-400' : (showComparison ? 'bg-blue-500 text-white' : 'bg-white text-blue-600')}`}
          >
             {showComparison ? "Comparing" : "Compare?"}
          </button>

          {showComparison && (
             <div className="flex gap-2 items-center">
               <label className="text-sm font-semibold text-gray-700">Scenario 2:</label>
               <select value={baselineScenario} onChange={(e) => setBaselineScenario(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
                 {availableScenarios.map(s => <option key={s.scenario_code} value={s.scenario_code}>{s.scenario_code}</option>)}
               </select>
             </div>
          )}

          <div className="h-6 w-px bg-gray-300"></div>

          {/* View Mode */}
          <div className="flex gap-2 items-center">
             <label className="text-sm font-semibold text-gray-700">View:</label>
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" value="tier" checked={viewMode === 'tier'} onChange={() => setViewMode('tier')} /> Tier Grid
             </label>
             <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" value="treemap" checked={viewMode === 'treemap'} onChange={() => setViewMode('treemap')} /> Treemap
             </label>
          </div>
          
          <div className="h-6 w-px bg-gray-300"></div>

          {/* Filters */}
           <div className="flex gap-2 items-center">
            <label className="text-sm font-semibold text-gray-700">Color:</label>
            <select value={colorMode} onChange={(e) => setColorMode(e.target.value as any)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
              <option value="default">Default</option>
              <option value="tier">Tier</option>
              <option value="category">Category</option>
              <option value="waterVolume">Water Volume</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-semibold text-gray-700">Filter:</label>
             <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

           <button 
             onClick={() => setShowCategoryChart(true)}
             disabled={viewMode !== 'tier' || !showComparison}
             className={`px-4 py-1.5 border border-gray-300 rounded-md text-sm ${viewMode !== 'tier' || !showComparison ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
           >
             View Comparison Summary
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex flex-col bg-gray-50 border border-gray-200 rounded-md p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
             <h3 className="text-sm font-semibold text-gray-700">Selected Outcomes</h3>
             {selectedObjectives.length > 0 && (
               <button onClick={clearAllSelected} className="px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md border border-red-300">Clear All</button>
             )}
          </div>
          
          <div className="flex-1 overflow-auto flex flex-col gap-1.5">
             {selectedObjectives.length === 0 ? (
                <div className="text-gray-400 text-sm text-center mt-10">Click on tier boxes to select them</div>
             ) : (
               selectedObjectives.map(obj => (
                 <div key={obj.id} className="flex items-center gap-2 bg-white border border-gray-300 rounded px-2 py-1 text-xs hover:bg-gray-50">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                       <span className="font-semibold text-gray-900">{obj.id}</span>
                       <span className="text-gray-400">|</span>
                       <span className="text-gray-500 truncate">{obj.category}</span>
                       <span className="text-gray-400 text-[10px]">{obj.tier}</span>
                    </div>
                    <button onClick={() => removeSelectedObjective(obj.id)} className="shrink-0 text-gray-400 hover:text-red-600 font-bold">×</button>
                 </div>
               ))
             )}
          </div>
        </div>

        {/* Visualization */}
        <div className="flex-1 overflow-auto relative" ref={containerRef}>
          <svg ref={svgRef} className="w-full h-full"></svg>
        </div>
      </div>

      {/* Modal */}
      {showCategoryChart && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-10" onClick={() => setShowCategoryChart(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full h-[500px] relative" onClick={e => e.stopPropagation()}>
             <button onClick={() => setShowCategoryChart(false)} className="absolute top-4 right-4 text-gray-500 text-2xl font-bold">×</button>
             <CategoryComparisonChart 
                objectives={objectives}
                currentScenario={currentScenario}
                baselineScenario={baselineScenario}
                categories={categories}
                tiers={TIERS}
             />
          </div>
        </div>
      )}
    </div>
  );
});