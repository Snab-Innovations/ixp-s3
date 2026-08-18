import React, { useState, useEffect, useMemo } from 'react';
import {
  EDUCATION_QUALIFICATIONS,
  EDUCATION_QUALIFICATION_ICONS,
  EDUCATION_SPECIALIZATIONS,
  EducationQualification,
  getQualificationForSpecialization
} from '../data/allEducationDegrees';

export interface EducationInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  showCustomOption?: boolean;
}

export const EducationInput: React.FC<EducationInputProps> = ({
  value,
  onChange,
  className = "",
  selectClassName,
  showCustomOption = true
}) => {
  // Try to find the matching qualification for the given value
  const initialQualification = useMemo(() => {
    if (!value || !value.trim()) return '';
    const possibleQuals = getQualificationForSpecialization(value);
    if (possibleQuals.length > 0) return possibleQuals[0];
    
    // Check if the value itself is one of the qualifications (e.g. "Graduate" or "Diploma")
    const qualMatch = EDUCATION_QUALIFICATIONS.find(
      q => q.toLowerCase() === value.trim().toLowerCase()
    );
    if (qualMatch) return qualMatch;

    return '';
  }, [value]);

  const [selectedQual, setSelectedQual] = useState<string>(initialQualification || '');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');

  // Sync internal selected qualification when parent value changes
  useEffect(() => {
    if (value && value.trim()) {
      const possibleQuals = getQualificationForSpecialization(value);
      if (possibleQuals.length > 0 && (!selectedQual || !possibleQuals.includes(selectedQual as EducationQualification))) {
        setSelectedQual(possibleQuals[0]);
      } else if (!possibleQuals.length && !EDUCATION_QUALIFICATIONS.some(q => q.toLowerCase() === value.trim().toLowerCase())) {
        // It's a custom value
        // Keep selectedQual if user already picked one
      }
    } else if (!value) {
      // do not forcibly reset selectedQual if user is actively picking
    }
  }, [value]);

  const availableSpecializations = useMemo(() => {
    if (!selectedQual || !EDUCATION_SPECIALIZATIONS[selectedQual as EducationQualification]) {
      return [];
    }
    return EDUCATION_SPECIALIZATIONS[selectedQual as EducationQualification];
  }, [selectedQual]);

  const handleQualificationChange = (newQual: string) => {
    setSelectedQual(newQual);
    setIsCustomMode(false);
    // If user changed qualification, check if current value is in new qualification's list
    if (newQual && EDUCATION_SPECIALIZATIONS[newQual as EducationQualification]) {
      const specs = EDUCATION_SPECIALIZATIONS[newQual as EducationQualification];
      if (specs.includes(value)) {
        // Already matches
      } else {
        // Reset or select default
        onChange('');
      }
    } else {
      onChange('');
    }
  };

  const handleSpecializationChange = (newSpec: string) => {
    if (newSpec === '__custom__') {
      setIsCustomMode(true);
      setCustomText('');
      onChange('');
      return;
    }
    setIsCustomMode(false);
    onChange(newSpec);
  };

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      onChange(customText.trim());
    }
  };

  const defaultSelectClass = "h-9 w-full rounded-[6px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] px-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 font-medium transition-colors cursor-pointer shadow-xs";
  const selectStyle = selectClassName || className || defaultSelectClass;

  return (
    <div className="w-full space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {/* Selector 1: Qualification */}
        <div className="relative">
          <select
            value={selectedQual}
            onChange={(e) => handleQualificationChange(e.target.value)}
            className={selectStyle}
          >
            <option value="" className="bg-white dark:bg-[#111111] text-gray-400">
              -- 1. Select Qualification --
            </option>
            {EDUCATION_QUALIFICATIONS.map((qual) => (
              <option
                key={qual}
                value={qual}
                className="bg-white dark:bg-[#111111] text-slate-900 dark:text-white font-medium"
              >
                {qual}
              </option>
            ))}
          </select>
        </div>

        {/* Selector 2: Specialization (Dynamically populated based on chosen Qualification) */}
        <div className="relative">
          {!isCustomMode ? (
            <select
              value={availableSpecializations.includes(value) ? value : ''}
              onChange={(e) => handleSpecializationChange(e.target.value)}
              disabled={!selectedQual}
              className={`${selectStyle} ${
                !selectedQual
                  ? 'opacity-60 cursor-not-allowed bg-gray-100 dark:bg-white/[0.03]'
                  : ''
              }`}
            >
              <option value="" className="bg-white dark:bg-[#111111] text-gray-400">
                {selectedQual
                  ? `-- 2. Select ${selectedQual} Specialization --`
                  : '-- 2. Select Qualification First --'}
              </option>
              {availableSpecializations.map((spec) => (
                <option
                  key={spec}
                  value={spec}
                  className="bg-white dark:bg-[#111111] text-slate-900 dark:text-white font-medium"
                >
                  {spec}
                </option>
              ))}
              {showCustomOption && selectedQual && (
                <option
                  value="__custom__"
                  className="bg-white dark:bg-[#111111] text-blue-600 dark:text-blue-400 font-semibold"
                >
                  Other / Custom Specialization...
                </option>
              )}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  onChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomSubmit();
                  }
                }}
                placeholder={`Type custom ${selectedQual || ''} specialization...`}
                className={selectStyle}
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(false);
                  onChange('');
                }}
                className="h-9 px-2.5 rounded-[6px] border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 text-xs font-semibold shrink-0 cursor-pointer"
                title="Back to list"
              >
                List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selected Indicator badge if selected */}
      {value && selectedQual && availableSpecializations.includes(value) && (
        <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-0.5">
          <span>✓ Selected:</span>
          <span className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 px-1.5 py-0.2 rounded text-[10px]">
            {selectedQual} &rarr; {value}
          </span>
        </div>
      )}
    </div>
  );
};
