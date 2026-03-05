<template>
  <button
    @click="startTour"
    class="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg transition-colors flex items-center gap-2"
    title="Start Tour"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <span class="text-sm font-semibold">Help</span>
  </button>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import introJs from "intro.js";
import "intro.js/introjs.css";

const startTour = () => {
  const intro = introJs();

  intro.setOptions({
    steps: [
      {
        intro:
          "Welcome to the COEQWAL Scenario Exploration Tool! This tool helps you explore and compare water management scenarios across California and their tier classifications across the state.",
      },
      {
        element: document.querySelector('[data-tour="scenario-selector"]'),
        intro:
          "Select which scenario you want to view. Each scenario represents a different water management strategy.",
        position: "bottom",
      },
      {
        element: document.querySelector('[data-tour="compare-button"]'),
        intro:
          "Click 'Compare' to enable comparison mode, allowing you to see how two scenarios differ.",
        position: "bottom",
      },
      {
        element: document.querySelector('[data-tour="view-mode"]'),
        intro:
          "Switch between Grid view (organized by tiers and outcomes categories) and Tree view (to understand water usage of each location of interest) to see your data in different layouts.",
        position: "bottom",
      },
      {
        element: document.querySelector('[data-tour="color-mode"]'),
        intro:
          "Choose how to color the visualization: by tier level, category, or water volume.",
        position: "bottom",
      },
      {
        element: document.querySelector('[data-tour="search-bar"]'),
        intro:
          "Search for specific locations of interest by name or ID. Click a result to highlight it on the grid/tree and map.",
        position: "bottom",
      },
      {
        element: document.querySelector(".tier-background"),
        intro:
          "The grid is organized by tiers and outcomes categories. Each colored background represents a tier level, with locations grouped by their tier classification. You can click on the squares to select all locations of interest in that square.",
        position: "right",
      },
      {
        element: document.querySelector(".animated-shape"),
        intro:
          "Each box represents a location of interest, and each location has a tier assignment in COEQWAL. Hover over shapes for details, click to select and view on the map.",
        position: "right",
      },
      {
        element: document.querySelector('[data-tour="selected-nodes"]'),
        intro:
          "Selected locations of interest appear here. Click to view their location on the map, or remove them from the selection.",
        position: "left",
      },
      {
        element: document.querySelector('[data-tour="map"]'),
        intro:
          "The map shows the geographic location of selected locations of interest. Hover over polygons to see details.",
        position: "left",
      },
      {
        intro:
          "That's it! You're ready to explore. Click the Help button anytime to see this tour again.",
      },
    ],
    showProgress: true,
    showBullets: true,
    exitOnOverlayClick: true,
    exitOnEsc: true,
    nextLabel: "Next",
    prevLabel: "Back",
    doneLabel: "Done",
    scrollToElement: true,
    // scrollPadding: 30,
  });

  // Add custom highlighting for SVG shapes and tier backgrounds
  intro.onbeforechange(function (targetElement) {
    // Remove any previous highlights
    document
      .querySelectorAll(".animated-shape, .tier-background")
      .forEach((el) => {
        el.classList.remove("intro-highlight");
      });

    // If we're on a visualization step, add highlight
    if (targetElement) {
      if (
        targetElement.classList.contains("animated-shape") ||
        targetElement.classList.contains("tier-background")
      ) {
        targetElement.classList.add("intro-highlight");
      }
    }

    return true;
  });

  intro.onexit(function () {
    // Clean up highlights when tour ends
    document
      .querySelectorAll(".animated-shape, .tier-background")
      .forEach((el) => {
        el.classList.remove("intro-highlight");
      });
  });

  intro.start();
};

onMounted(() => {
  // Check if user has seen the tour before
  const hasSeenTour = localStorage.getItem("coeqwal-tour-seen");

  if (!hasSeenTour) {
    // Wait a bit for the page to fully load
    setTimeout(() => {
      startTour();
      localStorage.setItem("coeqwal-tour-seen", "true");
    }, 1000);
  }
});
</script>

<style>
/* Custom intro.js styling to match your app */
.introjs-tooltip {
  max-width: 400px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Helvetica Neue", sans-serif;
  font-size: 15px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  color: #1f2937;
}

.introjs-tooltiptext {
  font-weight: 400;
}

/* Hide the tooltip header since we don't have titles */
.introjs-tooltip-header {
  display: none;
}

.introjs-tooltip-title {
  font-weight: 600;
  font-size: 16px;
  color: #111827;
}

.introjs-button {
  text-shadow: none;
  font-size: 14px;
  padding: 10px 18px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Helvetica Neue", sans-serif;
  border-radius: 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 0.2s ease;
  cursor: pointer;
}

.introjs-nextbutton {
  background-color: #2563eb;
  border: 1px solid #2563eb;
  color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.introjs-nextbutton:hover {
  background-color: #1d4ed8;
  border: 1px solid #1d4ed8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.introjs-prevbutton {
  background-color: white;
  border: 1px solid #d1d5db;
  color: #374151;
}

.introjs-prevbutton:hover {
  background-color: #f9fafb;
  border: 1px solid #9ca3af;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.introjs-donebutton {
  background-color: #10b981;
  border: 1px solid #10b981;
  color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.introjs-donebutton:hover {
  background-color: #059669;
  border: 1px solid #059669;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.introjs-skipbutton {
  color: #6b7280;
}

.introjs-skipbutton:hover {
  color: #374151;
}

/* Highlight effect for SVG shapes during tour */
:global(.animated-shape.intro-highlight) {
  stroke: #2563eb !important;
  stroke-width: 3 !important;
  filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.6));
  animation: pulse-highlight 2s ease-in-out infinite;
}

/* Highlight effect for tier backgrounds during tour */
:global(.tier-background.intro-highlight) {
  stroke: #2563eb !important;
  stroke-width: 3 !important;
  opacity: 0.8 !important;
  filter: drop-shadow(0 0 12px rgba(37, 99, 235, 0.8));
  animation: pulse-highlight 2s ease-in-out infinite;
}

@keyframes pulse-highlight {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
