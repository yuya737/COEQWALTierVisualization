import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';

interface Objective {
  id: number;
  category: string;
  tier: string;
  baselineTier: string;
  [key: string]: any;
}

interface Props {
  objectives: Objective[];
  currentScenario: string;
  baselineScenario: string;
  categories: string[];
  tiers: string[];
}

const CategoryComparisonChart: React.FC<Props> = ({
  objectives,
  currentScenario,
  baselineScenario,
  categories,
  tiers,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Replicate Vue's 'computed' statistics logic
  const statsData = useMemo(() => {
    const stats = categories.map((category) => {
      const categoryObjectives = objectives.filter((obj) => obj.category === category);
      const total = categoryObjectives.length;

      if (total === 0) {
        return {
          category,
          improved: 0,
          worsened: 0,
          unchanged: 0,
          total: 0,
          improvedPct: 0,
          worsenedPct: 0,
          unchangedPct: 0,
        };
      }

      let improved = 0;
      let worsened = 0;
      let unchanged = 0;

      categoryObjectives.forEach((obj) => {
        const currentTierIndex = tiers.indexOf(obj.tier);
        const baselineTierIndex = tiers.indexOf(obj.baselineTier);

        // Assuming lower tier index is better (Tier 1 < Tier 2)
        if (currentTierIndex < baselineTierIndex) {
          improved++;
        } else if (currentTierIndex > baselineTierIndex) {
          worsened++;
        } else {
          unchanged++;
        }
      });

      return {
        category,
        improved,
        worsened,
        unchanged,
        total,
        improvedPct: (improved / total) * 100,
        worsenedPct: (worsened / total) * 100,
        unchangedPct: (unchanged / total) * 100,
      };
    });

    return stats;
  }, [objectives, categories, tiers]);

  // 2. Replicate the HTML Summary string logic
  const summaryHTML = useMemo(() => {
    const totalObjs = statsData.reduce((acc, curr) => acc + curr.total, 0);
    if (totalObjs === 0) return 'No data available.';

    const totalImproved = statsData.reduce((acc, curr) => acc + curr.improved, 0);
    const totalWorsened = statsData.reduce((acc, curr) => acc + curr.worsened, 0);
    
    // Simple formatting helper
    const fmt = (n: number) => ((n / totalObjs) * 100).toFixed(1) + '%';

    return `Across all categories, 
      <span class="font-bold text-blue-600"> ${totalImproved} (${fmt(totalImproved)}) </span> improved and 
      <span class="font-bold text-red-500"> ${totalWorsened} (${fmt(totalWorsened)}) </span> worsened 
      compared to the baseline.`;
  }, [statsData]);

  // 3. D3 Rendering Logic
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Cleanup previous render (including tooltips)
    d3.select(svgRef.current).selectAll('*').remove();
    d3.select('body').selectAll('.chart-tooltip').remove();

    // Dimensions
    const margin = { top: 30, right: 30, bottom: 100, left: 60 }; // Increased bottom for rotated labels
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = containerRef.current.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleBand()
      .range([0, width])
      .domain(statsData.map((d) => d.category))
      .padding(0.2);

    const y = d3.scaleLinear()
      .range([height, 0])
      .domain([0, 100]); // Percentage

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end');

    svg.append('g').call(d3.axisLeft(y).tickFormat((d) => `${d}%`));

    // Tooltip Helper
    const showTooltip = (event: MouseEvent, d: typeof statsData[0], type: 'improved' | 'worsened') => {
      const tooltip = d3.select('body')
        .selectAll('.chart-tooltip')
        .data([d])
        .join('div')
        .attr('class', 'chart-tooltip')
        .style('position', 'absolute')
        .style('background', 'white')
        .style('border', '1px solid #ccc')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
        .style('z-index', '1000');

      const content = type === 'improved'
        ? `<strong>${d.category}</strong><br/>
           <span style="color:#2c7fb8">Improved:</span> ${d.improved} (${d.improvedPct.toFixed(1)}%)<br/>
           Unchanged: ${d.unchanged} (${d.unchangedPct.toFixed(1)}%)<br/>
           Total: ${d.total}`
        : `<strong>${d.category}</strong><br/>
           <span style="color:#F87171">Worsened:</span> ${d.worsened} (${d.worsenedPct.toFixed(1)}%)<br/>
           Unchanged: ${d.unchanged} (${d.unchangedPct.toFixed(1)}%)<br/>
           Total: ${d.total}`;

      tooltip
        .html(content)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 10}px`)
        .style('opacity', 1);
    };

    const hideTooltip = () => {
      d3.selectAll('.chart-tooltip').remove();
    };

    // Draw Bars (Split bars: Up for improved, Down for worsened? Or side-by-side?)
    // Based on standard comparison charts, we often stack or group them.
    // Here we will draw two bars per category: Blue for Improved, Red for Worsened.
    
    // We'll use a sub-scale for grouping if needed, or just overlay them if they represent total share.
    // But since they are independent percentages of the total, let's stack them or put them side-by-side.
    // A simple approach is "Diverging" or just two bars. Let's do side-by-side for clarity.

    const xSub = d3.scaleBand()
      .domain(['improved', 'worsened'])
      .range([0, x.bandwidth()])
      .padding(0.05);

    // Render Groups
    const barGroups = svg.selectAll('.bar-group')
      .data(statsData)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${x(d.category)},0)`);

    // Improved Bar
    barGroups.append('rect')
      .attr('x', xSub('improved') || 0)
      .attr('y', (d) => y(d.improvedPct))
      .attr('width', xSub.bandwidth())
      .attr('height', (d) => height - y(d.improvedPct))
      .attr('fill', '#2c7fb8') // Blue
      .on('mouseover', (e, d) => showTooltip(e, d, 'improved'))
      .on('mouseout', hideTooltip);

    // Worsened Bar
    barGroups.append('rect')
      .attr('x', xSub('worsened') || 0)
      .attr('y', (d) => y(d.worsenedPct))
      .attr('width', xSub.bandwidth())
      .attr('height', (d) => height - y(d.worsenedPct))
      .attr('fill', '#F87171') // Red
      .on('mouseover', (e, d) => showTooltip(e, d, 'worsened'))
      .on('mouseout', hideTooltip);
      
    // Cleanup function when component unmounts
    return () => {
        d3.select('body').selectAll('.chart-tooltip').remove();
    };

  }, [statsData]);

  return (
    <div className="w-full h-full bg-white p-4 flex flex-col">
      <h3 className="text-base font-semibold text-gray-800 mb-1">
        Comparing {currentScenario} vs. {baselineScenario}
      </h3>
      
      {/* Container for SVG to measure dimensions */}
      <div className="flex-1 w-full relative" ref={containerRef}>
        <svg ref={svgRef} className="w-full h-full" style={{ display: 'block' }}></svg>
      </div>

      <p 
        className="text-sm text-gray-600 mb-3 italic mt-2"
        dangerouslySetInnerHTML={{ __html: summaryHTML }}
      />
    </div>
  );
};

export default CategoryComparisonChart;