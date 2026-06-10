import { customAlphabet, nanoid } from 'nanoid';

const roomAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;
export const createRoomCode = customAlphabet(roomAlphabet, ROOM_CODE_LENGTH);

export function normalizeRoomCode(raw: string): string {
  const upper = raw.replace(/^#+/, '').trim().toUpperCase();
  let out = '';
  for (const ch of upper) {
    if (roomAlphabet.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

export const newId = () => nanoid(12);
