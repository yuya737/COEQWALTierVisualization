import React, { useState, useRef } from 'react';
// Assuming these components are also being converted to React
import { AnimatedTierTreemap, AnimatedTierTreemapHandle, Objective } from './components/AnimatedTierTreemap'; 
import { MapView } from './components/MapView';

// Define interfaces for your data types
interface PolygonData {
  // Add specific properties if known, e.g., id: string; coordinates: ...
  [key: string]: any; 
}

export const App: React.FC = () => {
  // 1. State Management
  // In React, refs are for DOM access/imperative handles, not reactive data.
  // We use useState for data that changes the UI.
  const treemapRef = useRef<AnimatedTierTreemapHandle>(null);
  const [selectedPolygons, setSelectedPolygons] = useState<PolygonData[]>([]);
  const [allObjectives, setAllObjectives] = useState<Objective[]>([]);
  const [selectedObjectives, setSelectedObjectives] = useState<Objective[]>([]);
  const [searchBarVal, setSearchBarVal] = useState<string>("");

  // 2. Handlers
  const handlePolygonSelect = (polygonData: PolygonData[]) => {
    setSelectedPolygons(polygonData);
  };

  const handleObjectivesSelect = (objectives: Objective[]) => {
    setSelectedObjectives(objectives);
  };

  const initAllObjectives = (objectives: Objective[]) => {
    setAllObjectives(objectives);
  };

  const searchObjectives = () => {
    if (!Array.isArray(allObjectives)) {
      console.error("allObjectives is not ready:", allObjectives);
      return;
    }

    const input = Number(searchBarVal);
    console.log("Searching for objectives with ID containing: " + input);
    console.log("objectives:", allObjectives);

    // Check for valid number (and allow 0)
    if (!input && input !== 0) {
      return;
    }

    const match = allObjectives.filter((obj) => obj.id === input);

    // Update state
    setSelectedObjectives(match);
    
    // Call the imperative method exposed by the child component
    if (treemapRef.current) {
      treemapRef.current.updateMapFromSelection(match);
    }
  };

  const clearSearch = () => {
    setSearchBarVal("");
    if (treemapRef.current) {
      treemapRef.current.updateMapFromSelection([]);
    }
  };

  return (
    <div className="w-full h-screen flex flex-row">
      <div className="h-full flex-[7] bg-white shadow">
        {/* Note: React props use camelCase (onPolygonSelect) rather than 
          kebab-case (@polygon-select) 
        */}
        <AnimatedTierTreemap
          ref={treemapRef}
          className="h-full"
          onObjectivesInit={initAllObjectives}
          onPolygonSelect={handlePolygonSelect}
          onObjectivesSelect={handleObjectivesSelect}
        />
      </div>
      
      <div className="h-full flex-[2] bg-white shadow p-5 flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            id="searchObjectivesBar"
            placeholder="Search for outcomes by ID"
            className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchBarVal}
            onChange={(e) => setSearchBarVal(e.target.value)}
            onKeyUp={searchObjectives}
          />
          
          {searchBarVal && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>
        
        <div className="flex-1 min-h-0">
          <MapView polygons={selectedPolygons} />
        </div>
      </div>
    </div>
  );
};