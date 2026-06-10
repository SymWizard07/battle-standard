import type { StatusEffectId } from './types';
import { STATUS_ICON_SOURCES } from './statusIconSources';

const base = import.meta.env.BASE_URL;

export const STATUS_EFFECTS = STATUS_ICON_SOURCES.map((s) => ({
  id: s.id,
  label: s.label,
  short: s.short,
  color: s.color,
  icon: `${base}icons/status/${s.id}.svg`,
}));

export function statusMeta(id: StatusEffectId) {
  return STATUS_EFFECTS.find((s) => s.id === id);
}
