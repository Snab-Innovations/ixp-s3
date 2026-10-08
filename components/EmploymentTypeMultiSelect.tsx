import React, { useState, useRef, useEffect } from 'react';
import { Briefcase, Check, ChevronDown, X } from 'lucide-react';
import { EMPLOYMENT_TYPE_OPTIONS, EmploymentTypeOption } from '../services/resumeService';

interface EmploymentTypeMultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  variant?: 'dropdown' | 'pills' | 'both';
  className?: string;
  buttonClassName?: string;
  badgeLimit?: number;
}

export const EmploymentTypeMultiSelect: React.FC<EmploymentTypeMultiSelectProps> = ({
  values = [],
  onChange,
  placeholder = 'Select Employment Types...',
  variant = 'dropdown',
  className = '',
  buttonClassName = '',
  badgeLimit = 2,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (option: string) => {
    if (values.includes(option)) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  };

  const handleSelectAll = () => {
    onChange([...EMPLOYMENT_TYPE_OPTIONS]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // If variant === 'pills', render simple interactive pill badges
  if (variant === 'pills') {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPE_OPTIONS.map((opt) => {
            const isSelected = values.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => handleToggleOption(opt)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer select-none text-left ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 border-emerald-500 text-white dark:text-black'
                      : 'border-slate-300 dark:border-white/20 bg-white dark:bg-black/40'
                  }`}
                >
                  {isSelected && <Check size={10} strokeWidth={3} />}
                </div>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-[#8f8f8f] pt-0.5">
          <span>{values.length} selected</span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="hover:text-black dark:hover:text-white underline cursor-pointer"
          >
            Select All
          </button>
          {values.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-red-500 hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  // Dropdown Variant
  const summaryText =
    values.length === 0
      ? placeholder
      : values.length === 1
      ? values[0]
      : `${values.length} options selected`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-[8px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 text-left transition-colors cursor-pointer ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Briefcase size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
          <span className={`truncate font-medium ${values.length === 0 ? 'text-gray-400 dark:text-[#6b7280]' : ''}`}>
            {summaryText}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {values.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 px-1.5 text-[10px] font-bold text-white">
              {values.length}
            </span>
          )}
          <ChevronDown
            size={13}
            className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Selected Pills */}
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.slice(0, badgeLimit).map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-[6px] bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50"
            >
              <span className="truncate max-w-[200px]">{v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleOption(v);
                }}
                className="text-blue-500 hover:text-red-500 cursor-pointer ml-0.5"
                title={`Remove ${v}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {values.length > badgeLimit && (
            <span
              className="inline-flex items-center rounded-[6px] bg-gray-100 dark:bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-[#8f8f8f]"
              title={values.slice(badgeLimit).join(', ')}
            >
              +{values.length - badgeLimit} more
            </span>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-[99999] mt-1 w-full min-w-[280px] max-w-sm rounded-[10px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-[#0c0c0d] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.08] px-2 pb-2 mb-1.5">
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#8f8f8f]">
              Select Multiple Options ({values.length}/{EMPLOYMENT_TYPE_OPTIONS.length})
            </span>
            <div className="flex items-center gap-2 text-[10px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                All
              </button>
              <span className="text-gray-300 dark:text-white/20">|</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-red-500 font-semibold hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
            {EMPLOYMENT_TYPE_OPTIONS.map((opt) => {
              const isChecked = values.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-start gap-2.5 rounded-[6px] px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 font-semibold'
                      : 'text-slate-800 dark:text-[#d4d4d4] hover:bg-gray-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleOption(opt)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 dark:border-white/20 bg-white dark:bg-[#111] text-blue-600 focus:ring-0 cursor-pointer accent-blue-600"
                  />
                  <span className="leading-tight text-[11px]">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
