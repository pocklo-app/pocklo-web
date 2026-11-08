export const FRIENDEN_LOGIN_KEY = 'pocklo.frienden.login';

export function loginDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) {
    return '/res';
  }
  const destination = new URL(value, window.location.origin);
  if (destination.origin !== window.location.origin ||
      !/^\/(?:res(?:\/[^/]+){0,2}|account(?:\/applications)?|developer(?:\/(?:admin|docs))?|oauth\/authorize\/[0-9a-f-]{36})$/.test(destination.pathname)) {
    return '/res';
  }
  return destination.pathname + destination.search + destination.hash;
}
