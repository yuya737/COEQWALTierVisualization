import * as d3 from "d3";

const margin = { top: 60, right: 50, bottom: 150, left: 100 };

export interface CategoryLayout {
  category: string;
  width: number;
  startX: number;
}

export const calculateCategoryWidths = (
  objectives: Objective[],
  categories: string[],
  gridWidth: number
): CategoryLayout[] => {
  const dotSize = 16;
  const spacing = dotSize * 1.2; // 19.2
  // const MIN_CATEGORY_WIDTH = spacing * 1.5; // ~29px - ensures at least 1 dot fits
  const MIN_CATEGORY_WIDTH = 120;

  const categoryObjectiveCounts = new Map<string, number>();
  categories.forEach((category) => {
    const count = objectives.filter((obj) => obj.category === category).length;
    categoryObjectiveCounts.set(category, count);
  });

  const totalObjectives = objectives.length;

  // First pass: calculate proportional widths
  const proportionalWidths = new Map<string, number>();
  categories.forEach((category) => {
    const count = categoryObjectiveCounts.get(category) || 0;
    const proportion = count / totalObjectives;
    const categoryWidth = gridWidth * proportion;
    proportionalWidths.set(category, categoryWidth);
  });

  // Find categories that need minimum width
  const categoriesNeedingMin: string[] = [];
  const categoriesAboveMin: string[] = [];
  let totalMinWidth = 0;

  categories.forEach((category) => {
    const width = proportionalWidths.get(category) || 0;
    if (width < MIN_CATEGORY_WIDTH) {
      categoriesNeedingMin.push(category);
      totalMinWidth += MIN_CATEGORY_WIDTH;
    } else {
      categoriesAboveMin.push(category);
    }
  });

  // Calculate final widths
  const finalWidths = new Map<string, number>();
  const remainingWidth = gridWidth - totalMinWidth;

  // Assign minimum width to small categories
  categoriesNeedingMin.forEach((category) => {
    finalWidths.set(category, MIN_CATEGORY_WIDTH);
  });

  // Redistribute remaining width proportionally among larger categories
  if (categoriesAboveMin.length > 0 && remainingWidth > 0) {
    const totalAboveMinObjectives = categoriesAboveMin.reduce((sum, cat) => {
      return sum + (categoryObjectiveCounts.get(cat) || 0);
    }, 0);

    categoriesAboveMin.forEach((category) => {
      const count = categoryObjectiveCounts.get(category) || 0;
      const proportion = count / totalAboveMinObjectives;
      const categoryWidth = remainingWidth * proportion;
      finalWidths.set(category, categoryWidth);
    });
  }

  // Build layouts with cumulative positions
  const layouts: CategoryLayout[] = [];
  let currentX = 0;

  categories.forEach((category) => {
    const width = finalWidths.get(category) || MIN_CATEGORY_WIDTH;
    layouts.push({
      category,
      width,
      startX: currentX,
    });
    currentX += width;
  });

  return layouts;
};

interface Objective {
  id: number;
  tier: string;
  baselineTier: string;
  category: string;
  waterVolume: number;
  unmetDemand: number;
  withinCategoryIndex: number;
}

interface Position {
  id: number | string;
  x: number;
  y: number;
  width: number;
  height: number;
  obj: Objective;
  shape: string;
}

export const calculateTierPositions = (
  objectives: Objective[],
  categories: string[],
  tiers: string[],
  width: number,
  height: number,
  showComparison: boolean
): Position[] => {
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  // Calculate category widths and positions
  const categoryLayouts = calculateCategoryWidths(
    objectives,
    categories,
    gridWidth
  );
  const categoryWidths = new Map(
    categoryLayouts.map((l) => [l.category, l.width])
  );
  const categoryStartX = new Map(
    categoryLayouts.map((l) => [l.category, l.startX])
  );

  const cellHeight = gridHeight / tiers.length;
  const dotSize = 16;
  const spacing = dotSize * 1.2;

  const positions: Position[] = [];

  // Normal mode or comparison mode with triangles
  if (!showComparison) {
    const grouped = d3.group(
      objectives,
      (d) => d.tier,
      (d) => d.category
    );

    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const cellObjectives = grouped.get(tier)?.get(category) || [];

        const cellWidth = categoryWidths.get(category) || 0;
        const cellStartX = categoryStartX.get(category) || 0;
        const dotsPerRow = Math.max(
          1,
          Math.floor((cellWidth - spacing / 2) / spacing)
        );

        cellObjectives.forEach((obj, idx) => {
          const row = Math.floor(idx / dotsPerRow);
          const col = idx % dotsPerRow;

          const x = margin.left + cellStartX + col * spacing + dotSize;
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
    // Comparison mode: split view with triangles and baseline rects
    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const categoryObjectives = objectives.filter(
          (obj) => obj.category === category
        );

        const cellWidth = categoryWidths.get(category) || 0;
        const cellStartX = categoryStartX.get(category) || 0;
        const dotsPerRow = Math.max(
          1,
          Math.floor((cellWidth - spacing / 2) / spacing)
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

        currentObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;

          const x = margin.left + cellStartX + col * spacing + dotSize;
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

        movedAwayObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;

          const x = margin.left + cellStartX + col * spacing + dotSize;
          const y =
            margin.top + tierIndex * cellHeight + row * spacing + dotSize;

          positions.push({
            id: `baseline-${obj.id}`,
            x: x - dotSize / 2,
            y: y - dotSize / 2,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: "baseline-rect",
          });

          dotIndex++;
        });
      });
    });
  }

  return positions;
};

export const calculateTreemapPositions = (
  objectives: Objective[],
  width: number,
  height: number
): Position[] => {
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

  const root: any = d3
    .hierarchy(data)
    .sum((d: any) => d.value)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  // Calculate treemap area respecting margins
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  d3.treemap<any>().size([plotWidth, plotHeight]).padding(2).round(true)(root);

  const positions: Position[] = [];
  root.leaves().forEach((d: any) => {
    positions.push({
      id: d.data.obj.id,
      x: d.x0 + margin.left, // Offset by left margin
      y: d.y0 + margin.top, // Offset by top margin
      width: d.x1 - d.x0,
      height: d.y1 - d.y0,
      obj: d.data.obj,
      shape: "rect",
    });
  });

  return positions;
};

export const calculateBarPlotPositions = (
  objectives: Objective[],
  width: number,
  height: number
): Position[] => {
  // Sort objectives by unmetDemand (descending - highest first)
  const sortedObjectives = [...objectives].sort(
    (a, b) => a.unmetDemand - b.unmetDemand
  );

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Calculate bar width and spacing
  const barWidth = plotWidth / sortedObjectives.length;
  const barPadding = Math.min(2, barWidth * 0.1); // 10% padding or 2px max
  const actualBarWidth = barWidth - barPadding;

  // Find max unmetDemand for scaling
  const maxUnmetDemand = d3.max(objectives, (d) => d.unmetDemand) || 1;

  const positions: Position[] = [];
  sortedObjectives.forEach((obj, index) => {
    // Position from right to left (highest on right)
    const xIndex = sortedObjectives.length - 1 - index;
    const x = margin.left + xIndex * barWidth + barPadding / 2;

    // Scale height based on unmetDemand
    const barHeight = (obj.unmetDemand / maxUnmetDemand) * plotHeight;
    const y = margin.top + plotHeight - barHeight;

    positions.push({
      id: obj.id,
      x: x,
      y: y,
      width: actualBarWidth,
      height: barHeight,
      obj: obj,
      shape: "rect",
    });
  });

  return positions;
};
