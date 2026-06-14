/**
 * Normalizes a user-entered Metabase base URL.
 * - trims whitespace
 * - prepends 'https://' when no scheme is present
 * - keeps an explicit 'http://' or 'https://'
 * - removes a single trailing slash (but preserves subpaths)
 * - preserves port and subpath
 * @throws Error('Invalid URL') when input is empty or cannot be parsed.
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new Error('Invalid URL');
  }

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid URL');
  }
  if (parsed.hostname === '') {
    throw new Error('Invalid URL');
  }

  // Reject hostnames that contain characters invalid in a DNS name or IP address.
  // Valid hostname chars: letters, digits, hyphens, dots (and IPv6 brackets handled by URL).
  if (!/^[a-zA-Z0-9\-\.]+$/.test(parsed.hostname)) {
    throw new Error('Invalid URL');
  }

  // Rebuild from parsed parts so we control trailing-slash handling exactly.
  // parsed.pathname is '/' for a bare host; collapse that to '' and otherwise
  // strip a single trailing slash.
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return `${parsed.protocol}//${parsed.host}${path}`;
}
