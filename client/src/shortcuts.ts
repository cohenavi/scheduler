export type ShortcutActionId =
  | 'help'
  | 'editCell'
  | 'lock'
  | 'note'
  | 'delete'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'undo'
  | 'selectAll';

export type ShortcutMap = Record<ShortcutActionId, string>;

export interface ShortcutDefinition {
  id: ShortcutActionId;
  description: string;
  defaultCombo: string;
  adminOnly?: boolean;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'help',
    description: 'Show keyboard shortcuts & customization popup',
    defaultCombo: 'h',
  },
  {
    id: 'editCell',
    description: 'Open day cell editor for the focused cell',
    defaultCombo: 'e',
    adminOnly: true,
  },
  {
    id: 'note',
    description: 'Add or edit shift note (max 160 chars)',
    defaultCombo: 'n',
    adminOnly: true,
  },
  {
    id: 'lock',
    description: 'Lock / unlock shifts in selection',
    defaultCombo: 'l',
    adminOnly: true,
  },
  {
    id: 'delete',
    description: 'Delete unlocked shifts in selection',
    defaultCombo: 'Delete',
    adminOnly: true,
  },
  {
    id: 'copy',
    description: 'Copy selected 2D shift pattern',
    defaultCombo: 'ctrl+c',
    adminOnly: true,
  },
  {
    id: 'cut',
    description: 'Cut selected 2D shift pattern',
    defaultCombo: 'ctrl+x',
    adminOnly: true,
  },
  {
    id: 'paste',
    description: 'Paste copied shift pattern',
    defaultCombo: 'ctrl+v',
    adminOnly: true,
  },
  {
    id: 'undo',
    description: 'Undo last single or batch grid change',
    defaultCombo: 'ctrl+z',
    adminOnly: true,
  },
  {
    id: 'selectAll',
    description: 'Select all visible cells',
    defaultCombo: 'ctrl+a',
    adminOnly: true,
  },
];

export const DEFAULT_SHORTCUTS: ShortcutMap = SHORTCUT_DEFINITIONS.reduce((acc, def) => {
  acc[def.id] = def.defaultCombo;
  return acc;
}, {} as ShortcutMap);

const STORAGE_KEY = 'scheduler_custom_shortcuts_v1';

export function loadShortcuts(): ShortcutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    const parsed = JSON.parse(raw) as Partial<ShortcutMap>;
    return { ...DEFAULT_SHORTCUTS, ...parsed };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function resetShortcuts(): ShortcutMap {
  const defaults = { ...DEFAULT_SHORTCUTS };
  saveShortcuts(defaults);
  return defaults;
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt']);

export function eventToCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && e.key.length > 1) parts.push('shift');

  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  parts.push(key);
  return parts.join('+');
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  const eventCombo = eventToCombo(e);
  if (!eventCombo) return false;
  return eventCombo.toLowerCase() === combo.toLowerCase();
}

export function formatCombo(combo: string): string {
  if (!combo) return 'Unbound';
  return combo
    .split('+')
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'ctrl') return 'Ctrl/Cmd';
      if (lower === 'alt') return 'Alt';
      if (lower === 'shift') return 'Shift';
      if (part.length === 1) return part.toUpperCase();
      return part;
    })
    .join(' + ');
}
