import type { SessionProperties } from '@/api/schemas';

const cache = new Map<string, SessionProperties>();

export function setSessionProps(instanceId: string, props: SessionProperties): void {
  cache.set(instanceId, props);
}

export function getSessionProps(instanceId: string): SessionProperties | null {
  return cache.get(instanceId) ?? null;
}
