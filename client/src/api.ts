import type {
  AnalyticsData,
  AssignmentType,
  AutoGenerateResult,
  Category,
  ConstraintRule,
  ConstraintViolation,
  Person,
  PublishStatus,
  ScheduleData,
  ScheduleTemplate,
  Shift,
  TimeBlock,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Auth
  getMe: () => request<{ isAdmin: boolean }>('/api/auth/me'),
  login: (password: string) =>
    request<{ isAdmin: boolean; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () =>
    request<{ isAdmin: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Schedule Reads
  getPublicSchedule: (startDate: string, endDate: string) =>
    request<ScheduleData>(`/api/schedule/public?startDate=${startDate}&endDate=${endDate}`),

  getAdminSchedule: (startDate: string, endDate: string, viewMode: PublishStatus) =>
    request<ScheduleData>(
      `/api/schedule/admin?startDate=${startDate}&endDate=${endDate}&viewMode=${viewMode}`
    ),

  // Publish / Discard
  publishChanges: () =>
    request<{ publishedShifts: number; publishedUnavailabilities: number; unpublishedChangesCount: number }>(
      '/api/schedule/publish',
      { method: 'POST' }
    ),
  discardDrafts: () =>
    request<{ restoredShifts: number; restoredUnavailabilities: number; unpublishedChangesCount: number }>(
      '/api/schedule/discard',
      { method: 'POST' }
    ),

  // Shifts
  createShift: (payload: {
    personId: string;
    assignmentTypeId: string;
    date: string;
    note?: string | null;
    isLocked?: boolean;
  }) =>
    request<{ shift: Shift; unpublishedChangesCount: number }>('/api/schedule/shifts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateShift: (
    id: string,
    payload: Partial<{
      personId: string;
      assignmentTypeId: string;
      date: string;
      note: string | null;
      isLocked: boolean;
      customStartTime: string | null;
      customEndTime: string | null;
    }>
  ) =>
    request<{ shift: Shift; unpublishedChangesCount: number }>(`/api/schedule/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteShift: (id: string) =>
    request<{ deleted: Shift; unpublishedChangesCount: number }>(`/api/schedule/shifts/${id}`, {
      method: 'DELETE',
    }),

  // Batch
  batchAssign: (
    assignmentTypeId: string,
    cells: Array<{ personId: string; date: string }>,
    replaceExisting = false
  ) =>
    request<{
      created: Shift[];
      removed: Shift[];
      skippedLocked: number;
      skippedPto: number;
      unpublishedChangesCount: number;
    }>('/api/schedule/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'assign', assignmentTypeId, cells, replaceExisting }),
    }),

  batchLock: (isLocked: boolean, cells: Array<{ personId: string; date: string }>) =>
    request<{ updatedCount: number; unpublishedChangesCount: number }>('/api/schedule/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'lock', isLocked, cells }),
    }),

  batchPaste: (
    items: Array<{
      personId: string;
      date: string;
      assignmentTypeId: string;
      note?: string | null;
      customStartTime?: string | null;
      customEndTime?: string | null;
    }>,
    targetCells: Array<{ personId: string; date: string }>
  ) =>
    request<{
      created: Shift[];
      removed: Shift[];
      skippedLocked: number;
      skippedPto: number;
      unpublishedChangesCount: number;
    }>('/api/schedule/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'paste', items, targetCells }),
    }),

  batchRestore: (
    deleteIds: string[],
    restoreShifts: Array<{
      personId: string;
      assignmentTypeId: string;
      date: string;
      isLocked: boolean;
      note: string | null;
      customStartTime: string | null;
      customEndTime: string | null;
      publishedPairId: string | null;
    }>
  ) =>
    request<{ success: boolean; unpublishedChangesCount: number }>('/api/schedule/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore', deleteIds, restoreShifts }),
    }),

  batchDelete: (cells: Array<{ personId: string; date: string }>) =>
    request<{ deletedShifts: Shift[]; skippedLockedCount: number; unpublishedChangesCount: number }>(
      '/api/schedule/batch',
      {
        method: 'DELETE',
        body: JSON.stringify({ cells }),
      }
    ),

  // Unavailability
  toggleUnavailability: (payload: {
    cells?: Array<{ personId: string; date: string }>;
    personId?: string;
    date?: string;
    timeBlock?: TimeBlock;
    startTime?: string | null;
    endTime?: string | null;
    note?: string | null;
  }) =>
    request<{ action: 'added' | 'removed'; count: number; unpublishedChangesCount: number }>(
      '/api/schedule/unavailability/toggle',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  deleteUnavailability: (id: string) =>
    request<{ success: boolean; unpublishedChangesCount: number }>(`/api/schedule/unavailability/${id}`, {
      method: 'DELETE',
    }),

  // Admin People CRUD
  createPerson: (payload: Partial<Person>) =>
    request<Person>('/api/people', { method: 'POST', body: JSON.stringify(payload) }),
  updatePerson: (id: string, payload: Partial<Person>) =>
    request<Person>(`/api/people/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePerson: (id: string) => request<{ success: boolean }>(`/api/people/${id}`, { method: 'DELETE' }),

  // Admin Categories CRUD
  createCategory: (name: string) =>
    request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, payload: Partial<Category>) =>
    request<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCategory: (id: string) =>
    request<{ success: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),

  // Admin AssignmentTypes CRUD
  createAssignmentType: (payload: Partial<AssignmentType>) =>
    request<AssignmentType>('/api/assignment-types', { method: 'POST', body: JSON.stringify(payload) }),
  updateAssignmentType: (id: string, payload: Partial<AssignmentType>) =>
    request<AssignmentType>(`/api/assignment-types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAssignmentType: (id: string) =>
    request<{ success: boolean }>(`/api/assignment-types/${id}`, { method: 'DELETE' }),

  // --- Milestone 2 APIs ---
  rotateCalendarToken: (personId: string) =>
    request<{ id: string; calendarToken: string }>(`/api/people/${personId}/rotate-calendar-token`, {
      method: 'POST',
    }),
  getCalendarLink: (personId: string) =>
    request<{ personId: string; name: string; calendarToken: string }>(`/api/calendar/link/${personId}`),

  // Constraint Rules
  getRules: () => request<ConstraintRule[]>('/api/rules'),
  createRule: (payload: Partial<ConstraintRule>) =>
    request<ConstraintRule>('/api/rules', { method: 'POST', body: JSON.stringify(payload) }),
  updateRule: (id: string, payload: Partial<ConstraintRule>) =>
    request<ConstraintRule>(`/api/rules/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRule: (id: string) => request<{ success: boolean }>(`/api/rules/${id}`, { method: 'DELETE' }),

  // Rotation Templates
  getTemplates: () => request<ScheduleTemplate[]>('/api/templates'),
  createTemplate: (payload: {
    name: string;
    description?: string;
    cycleWeeks: number;
    startDate: string;
  }) =>
    request<ScheduleTemplate>('/api/templates', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),
  applyTemplate: (
    id: string,
    payload: {
      targetStartDate?: string;
      repeatAcrossMonth?: boolean;
      targetMonth?: string;
      mode: 'MERGE' | 'REPLACE_UNLOCKED';
      conflictMode?: 'SKIP_CONFLICTS' | 'ATOMIC_ROLLBACK';
    }
  ) =>
    request<{
      created: Shift[];
      removed: Shift[];
      skippedLocked: number;
      skippedConflicts: number;
      violations: ConstraintViolation[];
      unpublishedChangesCount: number;
    }>(`/api/templates/${id}/apply`, { method: 'POST', body: JSON.stringify(payload) }),

  // Auto-Scheduler
  autoGenerate: (payload: {
    startDate: string;
    endDate: string;
    personIds?: string[];
    categoryIds?: string[];
    assignmentTypeIds?: string[];
    mode: 'FILL_GAPS' | 'REBALANCE_UNLOCKED';
    apply: boolean;
  }) =>
    request<AutoGenerateResult>('/api/schedule/auto-generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Analytics
  getAnalytics: (startDate: string, endDate: string, viewMode: PublishStatus) =>
    request<AnalyticsData>(
      `/api/admin/analytics?startDate=${startDate}&endDate=${endDate}&viewMode=${viewMode}`
    ),

  // Restore
  restoreBackup: (bundle: unknown) =>
    request<{ success: boolean; restoredCounts: Record<string, number> }>('/api/admin/restore', {
      method: 'POST',
      body: JSON.stringify(bundle),
    }),
};
