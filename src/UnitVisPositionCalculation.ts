import * as d3 from "d3";

const margin = { top: 60, right: 50, bottom: 150, left: 60 };

const MAX_DOT_SIZE = 16;
const MIN_DOT_SIZE = 4;
const CELL_PADDING = 0;

export interface CategoryLayout {
  category: string;
  width: number;
  startX: number;
}

export const calculateCategoryWidths = (
  objectives: Objective[],
  categories: string[],
  gridWidth: number,
): CategoryLayout[] => {
  const dotSize = 16;
  const spacing = dotSize * 1.2;
  const MIN_CATEGORY_WIDTH = 50;

  // Count total objectives per category for proportional width allocation
  const categoryObjectiveCounts = new Map<string, number>();
  categories.forEach((category) => {
    const count = objectives.filter((obj) => obj.category === category).length;
    categoryObjectiveCounts.set(category, count);
  });

  // Calculate total objectives ONLY in the displayed categories
  const totalObjectives = Array.from(categoryObjectiveCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  const proportionalWidths = new Map<string, number>();
  categories.forEach((category) => {
    const count = categoryObjectiveCounts.get(category) || 0;
    const proportion =
      totalObjectives > 0 ? count / totalObjectives : 1 / categories.length;
    const categoryWidth = gridWidth * proportion;
    proportionalWidths.set(category, categoryWidth);
  });
  console.log("Proportional Widths:", proportionalWidths);

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
  console.log("Categories needing minimum width:", categoriesNeedingMin);

  // Calculate final widths
  const finalWidths = new Map<string, number>();
  const remainingWidth = gridWidth - totalMinWidth;

  // Assign minimum width to small categories
  categoriesNeedingMin.forEach((category) => {
    finalWidths.set(category, MIN_CATEGORY_WIDTH);
  });

  // Redistribute remaining width proportionally among larger categories
  if (categoriesAboveMin.length > 0) {
    if (remainingWidth > 0) {
      // Normal case: distribute remaining width proportionally
      const totalAboveMinObjectives = categoriesAboveMin.reduce((sum, cat) => {
        return sum + (categoryObjectiveCounts.get(cat) || 0);
      }, 0);

      categoriesAboveMin.forEach((category) => {
        const count = categoryObjectiveCounts.get(category) || 0;
        const proportion = count / totalAboveMinObjectives;
        const categoryWidth = remainingWidth * proportion;
        finalWidths.set(category, categoryWidth);
      });
    } else {
      // Not enough space: scale everything down proportionally
      const scaleFactor =
        gridWidth /
        (totalMinWidth + categoriesAboveMin.length * MIN_CATEGORY_WIDTH);

      // Re-assign scaled widths to min categories
      categoriesNeedingMin.forEach((category) => {
        finalWidths.set(category, MIN_CATEGORY_WIDTH * scaleFactor);
      });

      // Assign scaled widths to above-min categories
      categoriesAboveMin.forEach((category) => {
        finalWidths.set(category, MIN_CATEGORY_WIDTH * scaleFactor);
      });
    }
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
  locationId: string;
  locationName: string;
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
  showComparison: boolean,
): {
  positions: Position[];
  cellLayouts: Map<
    string,
    {
      contentHeight: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >;
} => {
  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  // Calculate category widths and positions
  const categoryLayouts = calculateCategoryWidths(
    objectives,
    categories,
    gridWidth,
  );
  const categoryWidths = new Map(
    categoryLayouts.map((l) => [l.category, l.width]),
  );
  const categoryStartX = new Map(
    categoryLayouts.map((l) => [l.category, l.startX]),
  );

  const cellHeight = gridHeight / tiers.length;
  const positions: Position[] = [];

  const computeMaxDotSizeForCell = (
    count: number,
    cellWidth: number,
    cellHeight: number,
  ) => {
    if (count <= 0) return MAX_DOT_SIZE;

    for (let size = MAX_DOT_SIZE; size >= MIN_DOT_SIZE; size -= 0.5) {
      const spacing = size * 1.2;
      // Calculate max columns that fit: need cols * spacing + size/2 <= cellWidth
      // Rearranging: cols <= (cellWidth - size/2) / spacing
      const maxCols = Math.floor(
        (cellWidth - CELL_PADDING - size / 2) / spacing,
      );
      const cols = Math.max(1, maxCols);
      const rows = Math.ceil(count / cols);
      // Actual height needed: rows * spacing + size / 2 (matching contentHeight calculation)
      const requiredHeight = rows * spacing + size / 2;
      const requiredWidth = cols * spacing + size / 2;
      if (
        requiredHeight <= cellHeight - CELL_PADDING &&
        requiredWidth <= cellWidth - CELL_PADDING
      ) {
        return size;
      }
    }
    return MIN_DOT_SIZE; // fallback
  };
  console.log("Grid Width:", gridWidth, "Grid Height:", gridHeight);

  // Determine a single dot size that fits every populated cell
  let globalDotSize = MAX_DOT_SIZE;
  tiers.forEach((tier) => {
    categories.forEach((category) => {
      // In comparison mode, a cell can contain both current-tier items and baseline markers
      const count = showComparison
        ? objectives.filter(
            (obj) =>
              obj.category === category &&
              (obj.tier === tier || obj.baselineTier === tier),
          ).length
        : objectives.filter(
            (obj) => obj.tier === tier && obj.category === category,
          ).length;

      if (count === 0) return;
      const cellWidth = categoryWidths.get(category) || 0;
      const maxSizeForCell = computeMaxDotSizeForCell(
        count,
        cellWidth,
        cellHeight,
      );
      globalDotSize = Math.min(globalDotSize, maxSizeForCell);
    });
  });
  const globalSpacing = globalDotSize * 1.2;

  const cellLayouts = new Map<
    string,
    {
      contentHeight: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >();

  // Normal mode or comparison mode with triangles
  if (!showComparison) {
    const grouped = d3.group(
      objectives,
      (d) => d.tier,
      (d) => d.category,
    );

    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const cellObjectives = grouped.get(tier)?.get(category) || [];
        if (cellObjectives.length === 0) {
          return;
        }

        const cellWidth = categoryWidths.get(category) || 0;
        const cellStartX = categoryStartX.get(category) || 0;

        const spacing = globalSpacing;
        const dotSize = globalDotSize;
        // Calculate dotsPerRow using same formula as computeMaxDotSizeForCell
        // Width needed: dotsPerRow * spacing + dotSize/2
        const dotsPerRow = Math.max(
          1,
          Math.floor((cellWidth - CELL_PADDING - dotSize / 2) / spacing),
        );

        let maxRow = -1;

        cellObjectives.forEach((obj, idx) => {
          const row = Math.floor(idx / dotsPerRow);
          const col = idx % dotsPerRow;

          const x_rel = col * spacing + dotSize;
          const y_rel = row * spacing + dotSize;

          // Calculate global position
          const globalX = margin.left + cellStartX + x_rel - dotSize / 2;
          const globalY =
            margin.top + tierIndex * cellHeight + y_rel - dotSize / 2;

          positions.push({
            id: obj.locationId,
            x: globalX,
            y: globalY,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: "rect",
          });

          maxRow = Math.max(maxRow, row);
        });

        // Calculate total height required for content
        const contentHeight =
          maxRow === -1 ? 0 : (maxRow + 1) * spacing + dotSize / 2;

        // Store cell layout info
        cellLayouts.set(`${tier}-${category}`, {
          contentHeight,
          x: margin.left + cellStartX,
          y: margin.top + tierIndex * cellHeight,
          width: cellWidth,
          height: cellHeight,
        });
      });
    });
  } else {
    // Comparison mode: split view with triangles and baseline rects
    tiers.forEach((tier, tierIndex) => {
      categories.forEach((category, catIndex) => {
        const categoryObjectives = objectives.filter(
          (obj) => obj.category === category,
        );
        console.log("Category Objectives:", tier, category, categoryObjectives);

        const spacing = globalSpacing;
        const dotSize = globalDotSize;
        const cellWidth = categoryWidths.get(category) || 0;
        const cellStartX = categoryStartX.get(category) || 0;
        // Calculate dotsPerRow using same formula as computeMaxDotSizeForCell
        // Width needed: dotsPerRow * spacing + dotSize/2
        const dotsPerRow = Math.max(
          1,
          Math.floor((cellWidth - CELL_PADDING - dotSize / 2) / spacing),
        );

        let currentObjectives = categoryObjectives.filter(
          (obj) => obj.tier === tier,
        );
        const movedAwayObjectives = categoryObjectives.filter(
          (obj) => obj.baselineTier === tier && obj.tier !== tier,
        );
        // Use simple grid without centering offsets to restore visibility

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

        let dotIndex = 0;
        let maxRow = -1;

        currentObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;

          const x_rel = col * spacing + dotSize;
          const y_rel = row * spacing + dotSize;

          const currentTierNum = tiers.indexOf(obj.tier);
          const baselineTierNum = tiers.indexOf(obj.baselineTier);

          let shape = "rect";
          if (currentTierNum < baselineTierNum) {
            shape = "triangle-up";
          } else if (currentTierNum > baselineTierNum) {
            shape = "triangle-down";
          }

          // Calculate global position
          const globalX = margin.left + cellStartX + x_rel - dotSize / 2;
          const globalY =
            margin.top + tierIndex * cellHeight + y_rel - dotSize / 2;

          positions.push({
            id: obj.locationId,
            x: globalX,
            y: globalY,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: shape,
          });

          dotIndex++;
          maxRow = Math.max(maxRow, row);
        });

        movedAwayObjectives.forEach((obj) => {
          const row = Math.floor(dotIndex / dotsPerRow);
          const col = dotIndex % dotsPerRow;

          const x_rel = col * spacing + dotSize;
          const y_rel = row * spacing + dotSize;

          // Calculate global position
          const globalX = margin.left + cellStartX + x_rel - dotSize / 2;
          const globalY =
            margin.top + tierIndex * cellHeight + y_rel - dotSize / 2;

          positions.push({
            id: `baseline-${obj.id}`,
            x: globalX,
            y: globalY,
            width: dotSize,
            height: dotSize,
            obj: obj,
            shape: "baseline-rect",
          });

          dotIndex++;
          maxRow = Math.max(maxRow, row);
        });

        const contentHeight =
          maxRow === -1 ? 0 : (maxRow + 1) * spacing + dotSize / 2;

        // Store cell layout info
        cellLayouts.set(`${tier}-${category}`, {
          contentHeight,
          x: margin.left + cellStartX, // abs x
          y: margin.top + tierIndex * cellHeight, // abs y
          width: cellWidth,
          height: cellHeight,
        });
      });
    });
  }

  return { positions, cellLayouts };
};

export const calculateTreemapPositions = (
  objectives: Objective[],
  width: number,
  height: number,
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
      id: d.data.obj.locationId,
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
  height: number,
): Position[] => {
  // Sort objectives by unmetDemand (descending - highest first)
  const sortedObjectives = [...objectives].sort(
    (a, b) => a.unmetDemand - b.unmetDemand,
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
      id: obj.locationId,
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
