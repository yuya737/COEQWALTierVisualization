// Use CORS proxy (temporary solution for GitHub Pages deployment)
const API_ROOT = "https://corsproxy.io/?https://api.coeqwal.org/api";

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
  return [
    { category: tierData.name, tier: tierData.level, withinCategoryIndex: 0 },
  ];
};

const processMultiValueData = (tierData: any) => {
  const data = tierData.data;
  const ret: any[] = [];
  Object.keys(data).forEach((key) => {
    let currentTier = parseInt(key) + 1; // tiers are 1-indexed
    for (let i = 0; i < data[key]["value"]; i++) {
      ret.push({
        category: tierData.name,
        tier: currentTier,
        withinCategoryIndex: i,
      });
    }
  });
  console.log(ret);
  return ret;
};

export const fetchData = async (scenarioID: string, tiers: string[]) => {
  try {
    const response = await fetch(
      `${API_ROOT}/tiers/scenarios/${scenarioID}/tiers`
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
        const waterVolume = Math.floor(pseudoRandom * (1000 - 10 + 1)) + 10;

        return {
          ...obj,
          id: index,
          tier: tiers[obj.tier - 1],
          waterVolume: waterVolume,
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

export const fetchGeoShapes = async (short_code: string) => {
  try {
    const response = await fetch(`${API_ROOT}/tier-map/s0020/${short_code}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(
      `Error fetching geoshapes for scenario ${short_code}:`,
      error
    );
  }
};

export const fetchAvailableScenarios = async () => {
  try {
    const response = await fetch(`${API_ROOT}/tier-map/scenarios`);
    const data = await response.json();
    return data.scenarios;
  } catch (error) {
    console.error("Error fetching available scenarios:", error);
    return [];
  }
};
