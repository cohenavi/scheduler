import React from 'react';
import {
  BarChart3,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Printer,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react';
import type { PublishStatus, RangeMode, ViewMode } from '../types';

interface TopBarProps {
  isAdmin: boolean;
  adminViewMode: PublishStatus;
  onChangeAdminViewMode: (mode: PublishStatus) => void;
  unpublishedCount: number;
  onPublish: () => void;
  onDiscard: () => void;
  publishing: boolean;
  rangeMode: RangeMode;
  onChangeRangeMode: (mode: RangeMode) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  dateRangeLabel: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenShortcuts: () => void;
  onOpenRoster: () => void;
  onOpenCategories: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
  onOpenTemplates: () => void;
  onOpenAutoScheduler: () => void;
  onOpenStats: () => void;
  onOpenSyncCalendar: () => void;
  onPrint: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isAdmin,
  adminViewMode,
  onChangeAdminViewMode,
  unpublishedCount,
  onPublish,
  onDiscard,
  publishing,
  rangeMode,
  onChangeRangeMode,
  viewMode,
  onChangeViewMode,
  dateRangeLabel,
  onPrev,
  onToday,
  onNext,
  onOpenLogin,
  onLogout,
  onOpenShortcuts,
  onOpenRoster,
  onOpenCategories,
  onOpenSettings,
  onOpenRules,
  onOpenTemplates,
  onOpenAutoScheduler,
  onOpenStats,
  onOpenSyncCalendar,
  onPrint,
}) => {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
      {/* Primary Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-4">
        {/* Brand + Date Navigation */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 pr-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
              <CalendarDays className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Team Scheduler
            </span>
          </div>

          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={onPrev}
              className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Previous period"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onToday}
              className="px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded"
            >
              Today
            </button>
            <button
              onClick={onNext}
              className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Next period"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-xs font-medium text-slate-700 tabular-nums">{dateRangeLabel}</span>

          <div className="hidden sm:flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(
              [
                ['week', '7d'],
                ['biweek', '14d'],
                ['month', '28d'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onChangeRangeMode(mode)}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  rangeMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Grid vs My Agenda View Switcher */}
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => onChangeViewMode('grid')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => onChangeViewMode('agenda')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                viewMode === 'agenda'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>My Agenda</span>
            </button>
          </div>

          {/* Public Sync Calendar & Print Wall Chart */}
          <button
            type="button"
            onClick={onOpenSyncCalendar}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Calendar className="h-3.5 w-3.5 text-blue-600" />
            <span className="hidden md:inline">Sync My Calendar</span>
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Print Wall Chart"
          >
            <Printer className="h-3.5 w-3.5 text-slate-600" />
            <span className="hidden lg:inline">Print Wall Chart</span>
          </button>

          {/* Admin Draft/Publish Controls */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-1.5 border-l border-slate-200 pl-2">
              <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  onClick={() => onChangeAdminViewMode('DRAFT')}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    adminViewMode === 'DRAFT'
                      ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-300/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Working Draft
                </button>
                <button
                  onClick={() => onChangeAdminViewMode('PUBLISHED')}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    adminViewMode === 'PUBLISHED'
                      ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live Published View
                </button>
              </div>

              {unpublishedCount > 0 && (
                <span
                  data-testid="unpublished-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums"
                >
                  {unpublishedCount} Unpublished
                </span>
              )}

              <button
                onClick={onPublish}
                disabled={publishing || unpublishedCount === 0}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
                <span>Publish Changes</span>
              </button>

              {unpublishedCount > 0 && (
                <button
                  onClick={onDiscard}
                  disabled={publishing}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  title="Discard unpublished draft changes"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden lg:inline">Discard Drafts</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && (
            <button
              onClick={onOpenShortcuts}
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}

          {isAdmin ? (
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          ) : (
            <button
              onClick={onOpenLogin}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Admin Login</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Toolbar Row */}
      {isAdmin && (
        <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs md:px-4">
          <button
            onClick={onOpenRoster}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <span>Staff Roster</span>
          </button>
          <button
            onClick={onOpenCategories}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <Tags className="h-3.5 w-3.5 text-slate-500" />
            <span>Categories &amp; Assignments</span>
          </button>

          <div className="mx-1 h-3.5 w-px shrink-0 bg-slate-200" />

          <button
            onClick={onOpenRules}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <span>Rules &amp; Constraints</span>
          </button>
          <button
            onClick={onOpenTemplates}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <Layers className="h-3.5 w-3.5 text-indigo-600" />
            <span>Rotation Templates</span>
          </button>
          <button
            onClick={onOpenAutoScheduler}
            className="inline-flex shrink-0 items-center gap-1.5 rounded bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span>Auto-Fill Schedule</span>
          </button>
          <button
            onClick={onOpenStats}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Stats &amp; Analytics</span>
          </button>

          <div className="mx-1 h-3.5 w-px shrink-0 bg-slate-200" />

          <button
            onClick={onOpenSettings}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs"
          >
            <Settings className="h-3.5 w-3.5 text-slate-500" />
            <span>Admin Settings &amp; Backup</span>
          </button>
        </div>
      )}
    </header>
  );
};
