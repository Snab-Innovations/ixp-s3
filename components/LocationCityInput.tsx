import React, { useState, useRef, useEffect } from 'react';
import {
  INDIAN_STATES_CITIES,
  getStateForCity,
  isCityMatchingQuery
} from '../data/maharashtraCities';

interface LocationCityInputProps {
  value: string;
  onChange: (val: string) => void;
  selectedState?: string;
  onStateChange?: (stateName: string) => void;
  placeholder?: string;
  className?: string;
}

export const LocationCityInput: React.FC<LocationCityInputProps> = ({
  value,
  onChange,
  selectedState,
  onStateChange,
  placeholder = "Type city name (e.g. Nashik, Pune, Mumbai...)",
  className = "w-full h-9 rounded-[6px] border border-white/[0.11] bg-[#111] px-3 text-white outline-none focus:border-white/30 text-xs"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCitySelect = (cityName: string, stateName?: string) => {
    const targetState = stateName || getStateForCity(cityName) || 'Maharashtra';
    onChange(cityName);
    if (onStateChange) {
      onStateChange(targetState);
    }
    setIsOpen(false);
  };

  // Filter groups and cities based on current typed query using typo-tolerant smart matching
  const currentQuery = searchTerm.trim() || value.trim();

  const filteredGroups = INDIAN_STATES_CITIES.map(group => {
    const matchedCities = group.cities.filter(city => {
      if (!currentQuery) return true;
      return isCityMatchingQuery(city, currentQuery) || group.state.toLowerCase().includes(currentQuery.toLowerCase());
    });

    if (matchedCities.length === 0) return null;
    return {
      state: group.state,
      cities: matchedCities
    };
  }).filter(Boolean) as Array<{ state: string; cities: string[] }>;

  return (
    <div ref={wrapperRef} className="relative w-full space-y-1">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`${className} pr-8`}
          autoComplete="off"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2.5 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          <i className={`fas fa-chevron-down text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
        </button>
      </div>

      {/* Recommended City Popover Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-72 overflow-y-auto rounded-2xl border border-gray-200 dark:border-white/15 bg-white dark:bg-[#121214] shadow-2xl backdrop-blur-md text-xs text-slate-900 dark:text-white p-3 space-y-2.5 animate-in fade-in duration-150">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 pb-2">
            <span className="font-extrabold text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              📍 Recommended Cities ({filteredGroups.reduce((acc, g) => acc + g.cities.length, 0)})
            </span>
            <span className="text-[10px] text-emerald-500 font-extrabold flex items-center gap-1">
              <span>Smart Typo Tolerant</span>
            </span>
          </div>

          {/* City Recommendations List */}
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {filteredGroups.length > 0 ? (
              filteredGroups.map(group => (
                <div key={group.state} className="space-y-1">
                  <div className="px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded flex justify-between">
                    <span>{group.state}</span>
                    <span>{group.cities.length} Cities</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {group.cities.map(cityName => {
                      const isChecked = value.toLowerCase() === cityName.toLowerCase();
                      return (
                        <button
                          key={cityName}
                          type="button"
                          onClick={() => handleCitySelect(cityName, group.state)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                              : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                        >
                          <span className="truncate">{cityName}</span>
                          {isChecked && <i className="fas fa-check text-[10px] text-white"></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                No matching city recommendations for &quot;{currentQuery}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
