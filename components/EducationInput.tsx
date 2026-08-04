import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Maximize2, X, Check, GraduationCap } from 'lucide-react';
import { ALL_EDUCATION_DEGREES, CATEGORIZED_EDUCATION_DEGREES } from '../data/allEducationDegrees';

interface EducationInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

const filterAndRankDegrees = (searchVal: string): string[] => {
  const trimmed = searchVal.trim().toLowerCase();
  if (!trimmed) return ALL_EDUCATION_DEGREES;

  const cleanQuery = trimmed.replace(/[^a-z0-9\s]/g, '');
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  const isBE = tokens.includes('be') || trimmed === 'b.e' || trimmed === 'b.e.' || trimmed === 'be';
  const isBTech = tokens.includes('btech') || trimmed === 'b.tech';
  const isDiploma = tokens.includes('diploma') || tokens.includes('polytechnic');
  const isBSc = tokens.includes('bsc') || trimmed === 'b.sc';
  const isBCom = tokens.includes('bcom') || trimmed === 'b.com';
  const isBA = tokens.includes('ba') || trimmed === 'b.a';

  return ALL_EDUCATION_DEGREES.filter(deg => {
    const degLower = deg.toLowerCase();
    const degClean = degLower.replace(/[^a-z0-9\s]/g, '');

    if (isBE && (degLower.includes('b.e') || degClean.includes('b e') || degLower.includes('b.tech') || degClean.includes('btech'))) {
      return true;
    }
    if (isBTech && (degLower.includes('b.tech') || degClean.includes('btech') || degLower.includes('b.e'))) {
      return true;
    }
    if (isDiploma && (degLower.includes('diploma') || degLower.includes('polytechnic'))) {
      return true;
    }
    if (isBSc && (degLower.includes('b.sc') || degLower.includes('science'))) {
      return true;
    }
    if (isBCom && (degLower.includes('b.com') || degLower.includes('commerce'))) {
      return true;
    }
    if (isBA && (degLower.includes('b.a') || degLower.includes('arts'))) {
      return true;
    }

    return tokens.every(token => degLower.includes(token) || degClean.includes(token));
  }).sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    if (isBE) {
      const aHasBE = aLower.includes('b.e');
      const bHasBE = bLower.includes('b.e');
      if (aHasBE && !bHasBE) return -1;
      if (!aHasBE && bHasBE) return 1;
    }

    if (isBTech) {
      const aHasTech = aLower.includes('b.tech');
      const bHasTech = bLower.includes('b.tech');
      if (aHasTech && !bHasTech) return -1;
      if (!aHasTech && bHasTech) return 1;
    }

    return 0;
  });
};

export const EducationInput: React.FC<EducationInputProps> = ({
  value,
  onChange,
  placeholder = "e.g. B.Tech Civil, BE Mech, Diploma, MBA...",
  className = "w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] px-3 text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 text-xs"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isBigModalOpen, setIsBigModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [customDegreeText, setCustomDegreeText] = useState('');

  const filteredDegrees = filterAndRankDegrees(value);
  const modalFilteredDegrees = filterAndRankDegrees(modalSearch);

  const handleSelectDegree = (degreeName: string) => {
    onChange(degreeName);
    setIsOpen(false);
    setIsBigModalOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
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
          onClick={() => {
            setModalSearch('');
            setIsBigModalOpen(true);
          }}
          className="absolute right-1.5 p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
          title="Open Big Full-Screen Education Selection View"
        >
          <Maximize2 size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Floating recommendation inline popup */}
      {isOpen && filteredDegrees.length > 0 && !isBigModalOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-[#0c0c0d] p-1 shadow-2xl backdrop-blur-md divide-y divide-gray-100 dark:divide-white/10 text-xs animate-in fade-in duration-100">
          <div className="p-1.5 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Education Recommendations</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsBigModalOpen(true);
                setIsOpen(false);
              }}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 size={10} />
              Open Big View
            </button>
          </div>

          {filteredDegrees.slice(0, 25).map(deg => (
            <button
              key={deg}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectDegree(deg);
              }}
              className="w-full text-left px-3 py-2 text-slate-800 dark:text-gray-200 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-between gap-2 transition-colors cursor-pointer rounded-md"
            >
              <span className="whitespace-normal leading-snug font-medium text-xs pr-1">{deg}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Select
              </span>
            </button>
          ))}
        </div>
      )}

      {/* BIG SCREEN VIEW EDUCATION SELECTION MODAL */}
      {isBigModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setIsBigModalOpen(false)}
          >
            <div
              className="flex flex-col w-full max-w-5xl h-[88vh] bg-white dark:bg-[#0c0c0d] border border-gray-300 dark:border-white/20 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-[#121214] border-b border-gray-200 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                      Select Education Qualification
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Pick any Engineering branch, Diploma trade, Management, Commerce, Arts, or type custom degree.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBigModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-gray-300 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search & Custom Typo Input */}
              <div className="p-4 sm:p-5 bg-gray-100/70 dark:bg-[#161618] border-b border-gray-200 dark:border-white/10 shrink-0 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Realtime Search Bar */}
                  <div className="sm:col-span-2 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 size-4" />
                    <input
                      type="text"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Search Engineering branch, BE, Diploma, B.Com, MBA..."
                      className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-[#080809] text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 dark:focus:border-blue-400 shadow-sm"
                      autoFocus
                    />
                  </div>

                  {/* Custom Degree Input Field */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customDegreeText}
                      onChange={(e) => setCustomDegreeText(e.target.value)}
                      placeholder="Or type custom degree..."
                      className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-[#080809] text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 dark:focus:border-blue-400"
                    />
                    <button
                      type="button"
                      disabled={!customDegreeText.trim()}
                      onClick={() => {
                        if (customDegreeText.trim()) {
                          handleSelectDegree(customDegreeText.trim());
                        }
                      }}
                      className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
                    >
                      Use Custom
                    </button>
                  </div>
                </div>
              </div>

              {/* Categorized Visual Grid */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {CATEGORIZED_EDUCATION_DEGREES.map((catGroup) => {
                  const matches = catGroup.degrees.filter(d =>
                    modalSearch.trim() === '' || modalFilteredDegrees.includes(d)
                  );

                  if (matches.length === 0) return null;

                  return (
                    <div key={catGroup.category} className="space-y-3">
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-200 dark:border-white/10">
                        <span className="text-lg">{catGroup.icon}</span>
                        <h4 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-slate-800 dark:text-gray-200">
                          {catGroup.category} ({matches.length})
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {matches.map((deg) => {
                          const isSelected = value === deg;
                          return (
                            <button
                              key={deg}
                              type="button"
                              onClick={() => handleSelectDegree(deg)}
                              className={`p-3 rounded-xl border text-left flex items-start justify-between gap-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300 font-bold shadow-sm'
                                  : 'bg-gray-50/70 dark:bg-white/[0.03] border-gray-200 dark:border-white/10 text-slate-800 dark:text-gray-200 hover:bg-blue-50/50 dark:hover:bg-white/[0.07] hover:border-blue-400 dark:hover:border-white/20'
                              }`}
                            >
                              <span className="text-xs font-medium leading-relaxed">{deg}</span>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                                  <Check size={12} strokeWidth={3} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
