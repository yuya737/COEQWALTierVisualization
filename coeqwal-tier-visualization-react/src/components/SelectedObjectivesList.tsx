import React from 'react';

interface Objective {
  id: number | string;
  category: string;
  tier: string;
  baselineTier?: string;
  // Add other properties if necessary
  [key: string]: any;
}

interface Props {
  selectedObjectives?: Objective[];
}

export const SelectedObjectivesList: React.FC<Props> = ({ selectedObjectives = [] }) => {
  return (
    <div className="w-full border border-gray-200 rounded-lg p-4 bg-white">
      {/* Replicating Vue's scoped styles for the scrollbar. 
        In a real project, this might go in a global CSS file or a CSS Module.
      */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>

      <h3 className="text-lg font-semibold mb-3 text-gray-800">
        Selected Objectives
      </h3>

      <div className="overflow-y-auto pr-2 custom-scrollbar" style={{ height: '200px' }}>
        {selectedObjectives.length === 0 ? (
          <div className="text-gray-500 text-sm">
            Click on a cell or category to see objectives
          </div>
        ) : (
          <div className="space-y-2">
            {selectedObjectives.map((obj) => (
              <div
                key={obj.id}
                className="p-3 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <div className="text-sm font-semibold text-gray-800">
                  {obj.category}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  <span className="font-medium">ID:</span> {obj.id} |{' '}
                  <span className="font-medium">Tier:</span> {obj.tier}
                  
                  {/* Conditional Rendering for Baseline Tier */}
                  {obj.baselineTier && (
                    <>
                      {' '}| <span className="font-medium">Baseline:</span>{' '}
                      {obj.baselineTier}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};