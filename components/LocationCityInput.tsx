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
  placeholder = "e.g. Nashik, Mumbai, Pune...",
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
        className={className}
        autoComplete="off"
      />

      <datalist id={listId}>
        {MAHARASHTRA_CITIES.map(city => (
          <option key={city} value={city} />
        ))}
      </datalist>

      {/* Floating suggestion popup for faster visual clicking */}
      {isOpen && value.trim().length > 0 && filteredCities.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-white/15 bg-white dark:bg-black/95 shadow-xl backdrop-blur-md divide-y divide-gray-100 dark:divide-white/10 text-xs">
          {filteredCities.slice(0, 10).map(city => (
            <button
              key={city}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(city);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-slate-800 dark:text-gray-200 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between transition-colors"
            >
              <span>{city}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Maharashtra</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
