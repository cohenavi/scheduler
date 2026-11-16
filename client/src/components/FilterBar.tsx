import React from 'react';
import { GripVertical, Search } from 'lucide-react';
import type { AssignmentType, Category, SortMode } from '../types';
import { getContrastTextColor } from '../utils';

interface FilterBarProps {
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  selectedCategoryId: string;
  onChangeCategory: (id: string) => void;
  selectedAssignmentId: string;
  onChangeAssignment: (id: string) => void;
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  categories: Category[];
  assignmentTypes: AssignmentType[];
  canEdit: boolean;
  onClickPaletteAssignment: (assignmentTypeId: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onChangeSearch,
  selectedCategoryId,
  onChangeCategory,
  selectedAssignmentId,
  onChangeAssignment,
  sortMode,
  onChangeSort,
  categories,
  assignmentTypes,
  canEdit,
  onClickPaletteAssignment,
}) => {
  const filteredAssignments = selectedCategoryId
    ? assignmentTypes.filter((a) => a.categoryId === selectedCategoryId)
    : assignmentTypes;

  return (
    <div className="no-print border-b border-slate-200 bg-white px-3 py-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Filter staff..."
              className="h-7 w-40 rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none sm:w-48"
            />
          </div>

          <select
            value={selectedCategoryId}
            onChange={(e) => {
              onChangeCategory(e.target.value);
              onChangeAssignment('');
            }}
            aria-label="Filter by category"
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedAssignmentId}
            onChange={(e) => onChangeAssignment(e.target.value)}
            aria-label="Filter by assignment type"
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none"
          >
            <option value="">All Assignments</option>
            {filteredAssignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.shortCode} — {a.name}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(e) => onChangeSort(e.target.value as SortMode)}
            aria-label="Sort staff"
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none"
          >
            <option value="order">Sort: Default Order</option>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="role">Sort: Role</option>
            <option value="shifts">Sort: Shifts (High–Low)</option>
            <option value="hours">Sort: Hours (High–Low)</option>
          </select>
        </div>

        {/* Assignment Quick Palette (Admin Draft Mode) */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">
              Drag or click to assign:
            </span>
            {assignmentTypes.map((at) => {
              const fg = getContrastTextColor(at.colorHex);
              return (
                <button
                  key={at.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-assignment-type-id', at.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onClickPaletteAssignment(at.id)}
                  title={`${at.name} (${at.timeBlockLabel}: ${at.startTime}–${at.endTime})${
                    at.shortcutKey ? ` • Key [${at.shortcutKey}]` : ''
                  }`}
                  style={{ backgroundColor: at.colorHex, color: fg }}
                  className="inline-flex cursor-grab items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold shadow-xs transition-transform hover:scale-[1.03] active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3 opacity-60" />
                  <span>{at.shortCode}</span>
                  {at.shortcutKey && (
                    <span
                      className="ml-0.5 rounded px-1 text-[10px] font-bold"
                      style={{
                        backgroundColor: fg === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.12)',
                      }}
                    >
                      {at.shortcutKey}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
