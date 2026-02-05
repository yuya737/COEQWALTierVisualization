<template>
  <div class="w-full h-full relative">
    <div ref="mapContainer" class="w-full h-full"></div>
    <div
      v-if="hoveredFeature"
      class="absolute bg-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50 border border-gray-300"
      :style="{
        left: tooltipPosition.x + 10 + 'px',
        top: tooltipPosition.y + 10 + 'px',
      }"
    >
      <div v-if="hoveredFeature.properties">
        <div v-if="hoveredFeature.properties.location_name">
          <strong>Node:</strong>
          {{ hoveredFeature.properties.location_name }}
        </div>
        <div v-if="hoveredFeature.properties.tier_level">
          <strong>Tier:</strong> Tier {{ hoveredFeature.properties.tier_level }}
        </div>
      </div>
      <div v-else>
        <strong>ID:</strong>
        {{ hoveredFeature.id || "N/A" }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { Deck } from "@deck.gl/core";
import { TextLayer, GeoJsonLayer } from "@deck.gl/layers";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import centroid from "@turf/centroid";
import { featureCollection } from "@turf/helpers";
import { MapboxOverlay } from "@deck.gl/mapbox";

const mapContainer = ref(null);
let deck: any = null;
let map: any = null;

const hoveredFeature = ref<any>(null);
const tooltipPosition = ref({ x: 0, y: 0 });
const currentZoom = ref(10);

const props = defineProps({
  data: {
    type: Array,
    default: [
      { position: [-122.4, 37.8], size: 100, color: [255, 0, 0] },
      { position: [-122.5, 37.9], size: 100, color: [0, 255, 0] },
      { position: [-122.3, 37.7], size: 100, color: [0, 0, 255] },
    ],
  },
  polygons: {
    type: Array,
    default: () => [],
  },
  hoveredPolygon: {
    type: Object,
    default: null,
  },
  viewState: {
    type: Object,
    default: () => ({
      longitude: -122.4,
      latitude: 37.8,
      zoom: 10,
      pitch: 0,
      bearing: 0,
    }),
  },
});

const getLayers = () => {
  const layers: any[] = [];

  // Add GeoJSON polygon layer if polygons are provided
  if (props.polygons && props.polygons.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: "geojson-layer",
        data: props.polygons as any, // Can be single or multiple polygons
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          return f.properties.fillColor
            ? f.properties.fillColor
                .match(/[0-9a-f]{2}/g)
                .map((x) => parseInt(x, 16))
            : [0, 0, 0];
        },

        getLineColor: [60, 60, 60, 255], // Solid blue outline
        getPointColor: [250, 165, 60, 255],
        getLineWidth: 0.1,
        getPointRadius: 10000,
        pointRadiusScale: 1,
        pointRadiusMinPixels: 2,
        pointRadiusMaxPixels: 50,
        pointRadiusUnits: "meters",
        lineWidthMinPixels: 0.1,
        pickable: true,
        opacity: 0.15,
        onHover: (info: any) => {
          if (info.object) {
            hoveredFeature.value = info.object as any;
            tooltipPosition.value = { x: info.x, y: info.y };
          } else {
            hoveredFeature.value = null;
          }
        },
      }),
    );

    // Add text labels for each polygon at the first vertex
    layers.push(
      new TextLayer({
        id: "text-layer",
        data: props.polygons as any,
        getPosition: (f: any) => {
          // Get first coordinate of the geometry
          if (f.geometry.type === "Polygon") {
            return f.geometry.coordinates[0][0];
          } else if (f.geometry.type === "MultiPolygon") {
            return f.geometry.coordinates[0][0][0];
          } else if (f.geometry.type === "Point") {
            return f.geometry.coordinates;
          }
          return [0, 0];
        },
        getText: (f: any) => f.properties.location_name || "",
        getSize: 12,
        getColor: [0, 0, 0, 255],
        getAngle: 0,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Arial, sans-serif",
        fontWeight: "bold",
        pickable: false,
        background: true,
        getBackgroundColor: [255, 255, 255, 200],
        backgroundPadding: [2, 2],
      }),
    );
  }

  return layers;
};

let overlay: any = null;

const initDeck = () => {
  if (!mapContainer.value) return;

  // Initialize Mapbox map
  map = new mapboxgl.Map({
    container: mapContainer.value as HTMLElement,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json", // Free basemap, no token required
    center: [props.viewState.longitude, props.viewState.latitude],
    zoom: props.viewState.zoom,
    pitch: props.viewState.pitch,
    bearing: props.viewState.bearing,
    interactive: true,
    accessToken:
      "pk.eyJ1IjoieXV5YTczNyIsImEiOiJjbGY0ZmMzbG4wcjNvM3hxbTVqaWpqaDQ3In0.wkIMGbAn6HaRVqPs2CJSnA",
  });

  map.on("load", () => {
    overlay = new MapboxOverlay({
      layers: [],
    });
    map.addControl(overlay);

    overlay.setProps({
      layers: getLayers(),
    });

    // Create canvas for deck.gl
    const canvas = document.createElement("canvas");
    canvas.id = "deck-canvas";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "auto"; // Enable pointer events for hover
    mapContainer.value.appendChild(canvas);

    // Initialize Deck.gl overlay
    deck = new Deck({
      canvas: canvas,
      width: "100%",
      height: "100%",
      initialViewState: {
        longitude: map.getCenter().lng,
        latitude: map.getCenter().lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      },
      controller: true, // Enable controller for hover events
      layers: getLayers(),
      getCursor: () => "default", // Keep default cursor, let map handle panning
    });

    // Sync deck.gl view with Mapbox map movements
    const updateDeckView = () => {
      if (deck && !deck._isUpdating) {
        deck.setProps({
          viewState: {
            longitude: map.getCenter().lng,
            latitude: map.getCenter().lat,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
          },
        });
      }
    };

    // Sync Mapbox with deck.gl interactions
    deck.setProps({
      onViewStateChange: ({ viewState }: any) => {
        if (map && !map._isUpdating) {
          map._isUpdating = true;
          map.jumpTo({
            center: [viewState.longitude, viewState.latitude],
            zoom: viewState.zoom,
            bearing: viewState.bearing,
            pitch: viewState.pitch,
          });
          map._isUpdating = false;
        }
        return viewState;
      },
    });

    map.on("move", () => {
      map._isUpdating = true;
      updateDeckView();
      map._isUpdating = false;
    });
    map.on("zoom", updateDeckView);
    map.on("rotate", updateDeckView);
    map.on("pitch", updateDeckView);
  });
};

onMounted(() => {
  initDeck();
});

onUnmounted(() => {
  if (deck) {
    deck.finalize();
  }
  if (map) {
    map.remove();
  }
});

watch(
  () => props.data,
  () => {
    if (deck) {
      deck.setProps({
        layers: getLayers(),
      });
    }
  },
  { deep: true },
);

watch(props.polygons, () => {
  if (!overlay) return;

  overlay.setProps({
    layers: getLayers(),
  });
});

watch(
  () => props.polygons,
  () => {
    if (deck) {
      deck.setProps({
        layers: getLayers(),
      });
    }
    // Move map to polygon centroid
    if (props.polygons && props.polygons.length > 0 && map) {
      let center;
      if (props.polygons.length === 1) {
        // Single polygon
        center = centroid(props.polygons[0] as any);
      } else {
        // Multiple polygons - create feature collection
        const fc = featureCollection(props.polygons as any);
        center = centroid(fc);
      }

      map.flyTo({
        center: center.geometry.coordinates,
        zoom: props.polygons.length === 1 ? 8 : 6,
        duration: 2000,
      });
    }
  },
  { deep: true },
);
</script>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
}
</style>
