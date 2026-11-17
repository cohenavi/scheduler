export type PublishStatus = 'DRAFT' | 'PUBLISHED';
export type TimeBlock = 'FULL_DAY' | 'AM' | 'PM' | 'CUSTOM';
export type RangeMode = 'week' | 'biweek' | 'month';
export type ViewMode = 'grid' | 'agenda';
export type GridDisplayMode = 'person' | 'assignment';
export type SortMode = 'order' | 'name' | 'role' | 'shifts' | 'hours';

export interface Person {
  id: string;
  name: string;
  role: string;
  sortOrder: number;
  calendarToken?: string;
  allowedAssignmentIds?: string[];
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface AssignmentType {
  id: string;
  categoryId: string;
  name: string;
  shortCode: string;
  colorHex: string;
  allowedDaysOfWeek: number[];
  requiredStaffPerDay?: number;
  timeBlockLabel: string;
  startTime: string;
  endTime: string;
  shortcutKey?: string | null;
  sortOrder: number;
}

export interface Shift {
  id: string;
  personId: string;
  assignmentTypeId: string;
  date: string; // YYYY-MM-DD
  isLocked: boolean;
  note: string | null;
  customStartTime: string | null;
  customEndTime: string | null;
  status?: PublishStatus;
  publishedPairId?: string | null;
}

export interface Unavailability {
  id: string;
  personId: string;
  date: string; // YYYY-MM-DD
  timeBlock: TimeBlock;
  startTime: string | null;
  endTime: string | null;
  note?: string | null;
  status?: PublishStatus;
}

export interface ConstraintRule {
  id: string;
  name: string;
  ruleType: string;
  enforcement: 'HARD_BLOCK' | 'SOFT_WARN';
  assignmentTypeId: string | null;
  personId: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
  priority: number;
}

export interface ConstraintViolation {
  shiftId: string | null;
  personId: string;
  personName: string;
  date: string;
  weekStart?: string;
  assignmentTypeId: string | null;
  assignmentShortCode: string;
  ruleId: string;
  ruleName: string;
  ruleType: string;
  enforcement: 'HARD_BLOCK' | 'SOFT_WARN';
  message: string;
}

export interface TemplateEntry {
  id: string;
  templateId: string;
  weekIndex: number;
  dayOfWeek: number;
  personId: string | null;
  assignmentTypeId: string;
  note: string | null;
  customStartTime: string | null;
  customEndTime: string | null;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  cycleWeeks: number;
  entries: TemplateEntry[];
}

export interface AutoGenerateResult {
  applied: boolean;
  slotsFilled: number;
  lockedPreserved: number;
  removedCount?: number;
  created?: Shift[];
  removed?: Shift[];
  proposedShifts?: Array<{
    personId: string;
    personName: string;
    assignmentTypeId: string;
    assignmentShortCode: string;
    assignmentColor: string;
    date: string;
  }>;
  unfilledGaps: Array<{
    date: string;
    assignmentTypeId: string;
    assignmentName: string;
    shortCode: string;
    reason: string;
  }>;
  categoryVariance: {
    before: Array<{
      categoryId: string;
      categoryName: string;
      totalHours: number;
      avgHours: number;
      minHours: number;
      maxHours: number;
      stdDev: number;
    }>;
    after: Array<{
      categoryId: string;
      categoryName: string;
      totalHours: number;
      avgHours: number;
      minHours: number;
      maxHours: number;
      stdDev: number;
    }>;
  };
  unpublishedChangesCount?: number;
}

export interface AnalyticsData {
  viewMode: PublishStatus;
  kpis: {
    totalShifts: number;
    totalHours: number;
    conflictCount: number;
    ptoCount: number;
    ptoHours: number;
    coverageRate: number;
    requiredSlots: number;
    avgPersonHours: number;
  };
  categoryTotals: Array<{
    categoryId: string;
    name: string;
    shifts: number;
    hours: number;
  }>;
  personStats: Array<{
    personId: string;
    name: string;
    role: string;
    totalShifts: number;
    totalHours: number;
    ptoCount: number;
    byCategory: Record<string, { shifts: number; hours: number }>;
    varianceFromAvgHours: number;
  }>;
}

export interface ScheduleData {
  people: Person[];
  categories: Category[];
  assignmentTypes: AssignmentType[];
  shifts: Shift[];
  unavailabilities: Unavailability[];
  rules?: ConstraintRule[];
  violations?: ConstraintViolation[];
  unpublishedChangesCount?: number;
  viewMode?: PublishStatus;
}

export interface CellCoord {
  row: number;
  col: number;
}

export interface ClipboardItem {
  rowOffset: number;
  colOffset: number;
  assignmentTypeId: string;
  note: string | null;
  customStartTime: string | null;
  customEndTime: string | null;
}

export interface ClipboardState {
  items: ClipboardItem[];
  sourceKeys: Set<string>; // "personId::date" for marching ants
  isCut: boolean;
}

export interface UndoEntry {
  description: string;
  deleteIds: string[];
  restoreShifts: Array<{
    personId: string;
    assignmentTypeId: string;
    date: string;
    isLocked: boolean;
    note: string | null;
    customStartTime: string | null;
    customEndTime: string | null;
    publishedPairId: string | null;
  }>;
}
