import type { ObjectRef } from './types';

export function serializeObjectRef(ref: ObjectRef): string {
  return `${ref.kind}:${ref.sceneId ?? ''}:${ref.id}`;
}

export function patchTouchesRef(patchRef: ObjectRef, targetKey: string): boolean {
  return serializeObjectRef(patchRef) === targetKey;
}
