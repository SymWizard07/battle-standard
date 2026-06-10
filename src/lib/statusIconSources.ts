import type { StatusEffectId } from './types';

export type StatusIconSource = {
  id: StatusEffectId;
  label: string;
  short: string;
  color: string;
  author: string;
  authorName: string;
  slug: string;
};

/** Source metadata for status icons (game-icons.net, CC BY 3.0). */
export const STATUS_ICON_SOURCES: StatusIconSource[] = [
  { id: 'prone', label: 'Prone', short: 'Pr', color: '#94a3b8', author: 'sbed', authorName: 'sbed', slug: 'falling' },
  { id: 'poisoned', label: 'Poisoned', short: 'Ps', color: '#22c55e', author: 'sbed', authorName: 'sbed', slug: 'poison' },
  { id: 'stunned', label: 'Stunned', short: 'St', color: '#eab308', author: 'skoll', authorName: 'Skoll', slug: 'knockout' },
  { id: 'paralyzed', label: 'Paralyzed', short: 'Pa', color: '#a855f7', author: 'lorc', authorName: 'Lorc', slug: 'internal-injury' },
  { id: 'restrained', label: 'Restrained', short: 'Re', color: '#f97316', author: 'lorc', authorName: 'Lorc', slug: 'handcuffs' },
  { id: 'invisible', label: 'Invisible', short: 'In', color: '#38bdf8', author: 'delapouite', authorName: 'Delapouite', slug: 'invisible' },
  { id: 'frightened', label: 'Frightened', short: 'Fr', color: '#6366f1', author: 'lorc', authorName: 'Lorc', slug: 'screaming' },
  { id: 'grappled', label: 'Grappled', short: 'Gr', color: '#ef4444', author: 'lorc', authorName: 'Lorc', slug: 'grab' },
  { id: 'blinded', label: 'Blinded', short: 'Bl', color: '#64748b', author: 'delapouite', authorName: 'Delapouite', slug: 'blindfold' },
  { id: 'charmed', label: 'Charmed', short: 'Ch', color: '#ec4899', author: 'lorc', authorName: 'Lorc', slug: 'charm' },
  { id: 'deafened', label: 'Deafened', short: 'De', color: '#78716c', author: 'delapouite', authorName: 'Delapouite', slug: 'mute' },
  { id: 'incapacitated', label: 'Incapacitated', short: 'Ic', color: '#f43f5e', author: 'lorc', authorName: 'Lorc', slug: 'broken-skull' },
  { id: 'petrified', label: 'Petrified', short: 'Pe', color: '#6b7280', author: 'delapouite', authorName: 'Delapouite', slug: 'gargoyle' },
  {
    id: 'unconscious',
    label: 'Unconscious',
    short: 'Un',
    color: '#1e293b',
    author: 'delapouite',
    authorName: 'Delapouite',
    slug: 'dead-head',
  },
];
