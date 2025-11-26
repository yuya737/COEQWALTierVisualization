<template>
  <div class="w-full h-full relative">
    <div ref="mapContainer" class="w-full h-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { Deck } from "@deck.gl/core";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import centroid from "@turf/centroid";
import { featureCollection } from "@turf/helpers";

const mapContainer = ref(null);
let deck: any = null;
let map: any = null;

// Sample data - replace with actual lat/lon data
const sampleData = [
  { position: [-122.4, 37.8], size: 100, color: [255, 0, 0] },
  { position: [-122.5, 37.9], size: 100, color: [0, 255, 0] },
  { position: [-122.3, 37.7], size: 100, color: [0, 0, 255] },
];

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
        getFillColor: [60, 165, 250, 100], // Semi-transparent blue
        getLineColor: [60, 165, 250, 255], // Solid blue outline
        getPointColor: [250, 165, 60, 255],
        getPointRadius: 10000,
        getLineWidth: 2,
        lineWidthMinPixels: 2,
        pickable: true,
      })
    );
  }

  return layers;
};

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
    // Create canvas for deck.gl
    const canvas = document.createElement("canvas");
    canvas.id = "deck-canvas";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none"; // Let map handle interactions
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
      controller: false, // Let Mapbox handle controls
      layers: getLayers(),
    });

    // Sync deck.gl view with Mapbox map movements
    const updateDeckView = () => {
      if (deck) {
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

    map.on("move", updateDeckView);
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
  { deep: true }
);

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
  { deep: true }
);
</script>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
}
</style>
