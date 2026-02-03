import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import centroid from '@turf/centroid';
import { featureCollection } from '@turf/helpers';

// Ensure Mapbox CSS is imported
import 'mapbox-gl/dist/mapbox-gl.css';

// Set your Mapbox token here or via environment variable
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

interface Props {
  data?: any[]; // For ScatterplotLayer (if used)
  polygons?: any[]; // GeoJSON features to highlight
}

interface TooltipInfo {
  x: number;
  y: number;
  feature: any;
}



export const MapView: React.FC<Props> = ({ data = [], polygons = [] }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // 1. Initialize Map and Overlay
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    // Prevent double initialization in React Strict Mode
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v10', // Or your preferred style
      center: [-121.4944, 38.5816], // Default center (e.g., Sacramento)
      zoom: 6,
      pitch: 0,
      bearing: 0,
    });

    // Initialize Deck.GL Overlay
    const overlay = new MapboxOverlay({
      layers: [],
    });

    map.addControl(overlay as any);

    mapRef.current = map;
    overlayRef.current = overlay;

    // Cleanup on unmount
    return () => {
      map.remove();
      overlay.finalize();
    };
  }, []);

  // 2. Helper to generate layers
  // Wrapped in useMemo/function to be called inside effects
  const getLayers = () => {
    return [
      // Example Scatterplot Layer (from original default prop)
      new ScatterplotLayer({
        id: 'scatter-layer',
        data: data,
        getPosition: (d: any) => d.position,
        getFillColor: [255, 0, 0],
        getRadius: (d: any) => d.size,
        pickable: true,
      }),
      // The GeoJSON Polygon Layer
      new GeoJsonLayer({
        id: 'geojson-layer',
        data: polygons,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthScale: 20,
        lineWidthMinPixels: 2,
        getFillColor: [160, 160, 180, 100], // Semi-transparent fill
        getLineColor: [0, 255, 255, 255],   // Cyan outline
        getLineWidth: 1,
        onHover: (info) => {
          if (info.object) {
            setTooltip({
              x: info.x,
              y: info.y,
              feature: info.object,
            });
          } else {
            setTooltip(null);
          }
        },
      }),
    ];
  };

  // 3. Update Layers when props change
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({
        layers: getLayers(),
      });
    }
  }, [data, polygons]);

  // 4. Handle "Fly To" logic when polygons change
  useEffect(() => {
    if (!mapRef.current || !polygons || polygons.length === 0) return;

    try {
      let center;
      
      // Calculate centroid using Turf.js
      if (polygons.length === 1) {
        center = centroid(polygons[0]);
      } else {
        const fc = featureCollection(polygons);
        center = centroid(fc as any);
      }

      const [lng, lat] = center.geometry.coordinates;

      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 9, // Adjust zoom level as needed
        essential: true, // Animation will happen even if user has reduced motion enabled
      });

    } catch (error) {
      console.error("Error calculating centroid or flying to location:", error);
    }
  }, [polygons]);

  return (
    <div className="w-full h-full relative">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50 border border-gray-300"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)', // Shift up so cursor doesn't block it
            marginTop: '-10px'
          }}
        >
          <strong>ID: </strong>
          {tooltip.feature.id || tooltip.feature.properties?.id || "N/A"}
        </div>
      )}
    </div>
  );
};