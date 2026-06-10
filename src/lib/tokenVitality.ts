import type { TokenVitalityState } from './types';

const base = import.meta.env.BASE_URL;

export const BLOODIED_ICON = `${base}icons/token-states/bloodied.svg`;

export const TOKEN_VITALITY_STATES: {
  id: TokenVitalityState;
  label: string;
}[] = [
  { id: 'bloodied', label: 'Bloodied' },
  { id: 'dead', label: 'Dead' },
];
