// Import local GeoJSON files
import GW_STOR from "./GW_STOR.js";
import RES_STOR from "./RES_STOR.js";
import Fuse from "fuse.js";

// Use CORS proxy (temporary solution for GitHub Pages deployment)
const USE_CORS_PROXY = false; // Set to false when running locally or when API supports CORS

const CORS_PROXY = "https://cors-anywhere.com/";

const API_BASE = "https://api.coeqwal.org/api";
const API_ROOT = USE_CORS_PROXY ? `${CORS_PROXY}${API_BASE}` : API_BASE;

export const calculateMeanTier = (objectives: any[]): number => {
  if (!objectives || objectives.length === 0) {
    return 0;
  }

  const sum = objectives.reduce((acc, obj) => {
    // Extract tier number from "Tier X" string
    const tierNumber = parseInt(obj.tier.replace("Tier ", ""));
    return acc + tierNumber;
  }, 0);
  const mean = sum / objectives.length;

  // Ensure mean is within [1, 4]
  return Math.max(1, Math.min(4, mean));
};

const processSingleValueData = (tierData: any) => {
  console.log("Processing single value data:", tierData);
  return [
    { category: tierData.name, tier: tierData.level, withinCategoryIndex: 0 },
  ];
};

const processMultiValueData = (tierData: any) => {
  console.log("Processing multi value data:", tierData);
  const data = tierData.data;
  const ret: any[] = [];
  let counter = 0;
  Object.keys(data).forEach((key) => {
    let currentTier = parseInt(key) + 1; // tiers are 1-indexed
    for (let i = 0; i < data[key]["value"]; i++) {
      ret.push({
        category: tierData.name,
        tier: currentTier,
        withinCategoryIndex: counter,
      });
      counter++;
    }
  });
  console.log(ret);
  return ret;
};

export const fetchData = async (scenarioID: string, tiers: string[]) => {
  try {
    const response = await fetch(
      `${API_ROOT}/tiers/scenarios/${scenarioID}/tiers`,
    );
    const data = await response.json();
    const categories = Object.values(data.tiers).map((value: any) => {
      return value.name;
    });
    const ret = Object.values(data.tiers)
      .map((tierData: any) => {
        if (tierData.type === "single_value") {
          return processSingleValueData(tierData);
        } else if (tierData.type === "multi_value") {
          return processMultiValueData(tierData);
        }
      })
      .flat()
      .map((obj: any, index: number) => {
        // Use seeded pseudo-random for consistent waterVolume across fetches
        // TODO: Replace with real water volume data when available
        const seed = index * 9301 + 49297; // Simple LCG parameters
        const pseudoRandom = (seed % 233280) / 233280;

        // Use exponential distribution for more variation (cube the random value)
        const exponentialRandom = Math.pow(pseudoRandom, 3);
        const waterVolume =
          Math.floor(exponentialRandom * (5000 - 10 + 1)) + 10;

        // Generate unmetDemand (10-80% of waterVolume)
        const seed2 = index * 7919 + 31337; // Different seed for unmetDemand
        const pseudoRandom2 = (seed2 % 233280) / 233280;
        const unmetDemandPercent = 0.1 + pseudoRandom2 * 0.7; // 10% to 80%
        const unmetDemand = Math.floor(waterVolume * unmetDemandPercent);

        return {
          ...obj,
          id: index,
          tier: tiers[obj.tier - 1],
          waterVolume: waterVolume,
          unmetDemand: unmetDemand,
        };
      });
    console.log("Processed baseline data:", ret);
    return { data: ret, categories };
  } catch (error) {
    console.error("Error fetching baseline data:", error);
    return { data: null, categories: [] };
  }
};

export const fetchShortCodes = async () => {
  try {
    const response = await fetch(`${API_ROOT}/tiers/list`);
    const data = await response.json();
    console.log("Available scenarios:", data);
    return data;
  } catch (error) {
    console.error("Error fetching scenario list:", error);
  }
};

export const fetchGeoShapes = async (
  scenarioID: string,
  short_code: string,
) => {
  try {
    const response = await fetch(
      `${API_ROOT}/tier-map/${scenarioID}/${short_code}`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(
      `Error fetching geoshapes for scenario ${scenarioID}, category ${short_code}:`,
      error,
    );
  }
};

export const fetchTierLocations = async (
  scenarioID: string,
  short_code: string,
) => {
  try {
    const response = await fetch(
      `${API_ROOT}/tier-map/${scenarioID}/${short_code}/locations`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(
      `Error fetching tier locations for scenario ${scenarioID}, category ${short_code}:`,
      error,
    );
  }
};

export const fetchAvailableScenarios = async () => {
  try {
    const response = await fetch(`${API_ROOT}/tier-map/scenarios`);
    const data = await response.json();

    const ret = data.scenarios.filter(
      (scenario: any) =>
        scenario.scenario_code == "s0020" || scenario.scenario_code == "s0021",
    );
    return ret;
  } catch (error) {
    console.error("Error fetching available scenarios:", error);
    return [];
  }
};

export const fetchDataFromTierMap = async (
  scenarioID: string,
  tierShortList: any[],
  tiers: string[],
) => {
  const geoJSONs: any = {};
  const allObjectives: any[] = [];
  const categories: string[] = [];
  let globalId = 0;

  // Map of local GeoJSON files
  const localGeoJSONMap: any = {
    GW_STOR: GW_STOR,
    RES_STOR: RES_STOR,
  };

  for (const tier of tierShortList) {
    try {
      let geoJSONData;

      // Check if we should use local GeoJSON
      if (localGeoJSONMap[tier.short_code]) {
        geoJSONData = localGeoJSONMap[tier.short_code];

        // Fetch tier levels from the locations endpoint
        const locationsData = await fetchTierLocations(
          scenarioID,
          tier.short_code,
        );

        if (locationsData && locationsData.locations) {
          // Create a map of location_id -> tier_level from API response
          const tierLevelMap = new Map();
          locationsData.locations.forEach((location: any) => {
            tierLevelMap.set(location.location_id, location.tier_level);
          });

          // Update local GeoJSON with API tier levels
          geoJSONData = {
            ...geoJSONData,
            features: geoJSONData.features.map((feature: any) => {
              const apiTierLevel = tierLevelMap.get(
                feature.properties.location_id,
              );
              return {
                ...feature,
                properties: {
                  ...feature.properties,
                  tier_level:
                    apiTierLevel !== undefined
                      ? apiTierLevel
                      : feature.properties.tier_level,
                },
              };
            }),
          };
        }
      } else {
        // Fetch from API as usual
        geoJSONData = await fetchGeoShapes(scenarioID, tier.short_code);
      }

      if (!geoJSONData || !geoJSONData.features) {
        console.warn(`No data for ${tier.short_code}, skipping...`);
        continue;
      }

      geoJSONs[tier.short_code] = geoJSONData;
      categories.push(tier.name);

      // Extract objectives from features
      geoJSONData.features.forEach((feature: any, index: number) => {
        const tierLevel = feature.properties.tier_level;
        const tierName = tiers[tierLevel - 1]; // Convert tier_level (1-4) to tier name

        // Generate mock data
        const seed = globalId * 9301 + 49297;
        const pseudoRandom = (seed % 233280) / 233280;
        const exponentialRandom = Math.pow(pseudoRandom, 3);
        const waterVolume =
          Math.floor(exponentialRandom * (5000 - 10 + 1)) + 10;

        const seed2 = globalId * 7919 + 31337;
        const pseudoRandom2 = (seed2 % 233280) / 233280;
        const unmetDemandPercent = 0.1 + pseudoRandom2 * 0.7;
        const unmetDemand = Math.floor(waterVolume * unmetDemandPercent);

        allObjectives.push({
          id: globalId,
          category: tier.name,
          tier: tierName,
          tierLevel: tierLevel,
          locationId: feature.properties.location_id,
          locationName: feature.properties.location_name,
          waterVolume: waterVolume,
          unmetDemand: unmetDemand,
        });

        globalId++;
      });
    } catch (error) {
      console.error(`Error fetching data for ${tier.short_code}:`, error);
      continue;
    }
  }

  return { data: allObjectives, categories, geoJSONs };
};

// Fuse.js search configuration and function
export const createSearchIndex = (objectives: any[]) => {
  if (!objectives || objectives.length === 0) {
    return null;
  }

  return new Fuse(objectives, {
    keys: [
      { name: "locationName", weight: 2 }, // Prioritize location name
      { name: "locationId", weight: 1.5 },
    ],
    threshold: 0.3, // 0 = exact match, 1 = match anything
    ignoreLocation: true, // Don't care where in the string the match is
    minMatchCharLength: 1,
  });
};

export const searchObjectives = (
  searchIndex: Fuse<any> | null,
  query: string,
) => {
  if (!searchIndex || !query.trim()) {
    return [];
  }

  const results = searchIndex.search(query.trim());
  return results.map((result) => result.item);
};
