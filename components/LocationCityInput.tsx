import React, { useState, useId } from 'react';
import { MAHARASHTRA_CITIES } from '../data/maharashtraCities';

interface LocationCityInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const LocationCityInput: React.FC<LocationCityInputProps> = ({
  value,
  onChange,
  placeholder = "Select or search city (e.g. Nashik, Pune, Mumbai...)",
  className = "w-full h-9 rounded-[6px] border border-white/[0.11] bg-[#111] px-3 text-white outline-none focus:border-white/30 text-xs"
}) => {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const filteredCities = value.trim()
    ? MAHARASHTRA_CITIES.filter(city =>
        city.toLowerCase().includes(value.trim().toLowerCase())
      )
    : MAHARASHTRA_CITIES;

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          list={listId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder={placeholder}
          className={`${className} pr-8`}
          autoComplete="off"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors pointer-events-auto cursor-pointer"
        >
          <i className={`fas fa-chevron-down text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
        </button>
      </div>

      <datalist id={listId}>
        {MAHARASHTRA_CITIES.map(city => (
          <option key={city} value={city} />
        ))}
      </datalist>

      {/* Floating suggestion dropdown list (shows all cities on focus/click even if value is empty) */}
      {isOpen && filteredCities.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/15 bg-white dark:bg-slate-900 shadow-2xl backdrop-blur-md divide-y divide-gray-100 dark:divide-white/10 text-xs animate-in fade-in duration-150">
          <div className="p-2 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex justify-between items-center">
            <span>Select City ({filteredCities.length})</span>
            <span>Click to Pick</span>
          </div>
          {filteredCities.map(city => (
            <button
              key={city}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(city);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/40 flex items-center justify-between transition-colors cursor-pointer ${
                value.toLowerCase() === city.toLowerCase()
                  ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-600 dark:text-blue-400'
                  : 'text-slate-800 dark:text-gray-200'
              }`}
            >
              <span className="font-semibold text-xs">{city}</span>
              {value.toLowerCase() === city.toLowerCase() ? (
                <i className="fas fa-check text-blue-600 dark:text-blue-400 text-xs"></i>
              ) : (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Maharashtra</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
