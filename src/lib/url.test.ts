import { normalizeBaseUrl } from './url';

describe('normalizeBaseUrl', () => {
  it('adds https:// when scheme is missing', () => {
    expect(normalizeBaseUrl('metabase.example.com')).toBe('https://metabase.example.com');
  });

  it('keeps http:// when explicitly present', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('keeps https:// when explicitly present', () => {
    expect(normalizeBaseUrl('https://mb.acme.io')).toBe('https://mb.acme.io');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  metabase.example.com  ')).toBe('https://metabase.example.com');
  });

  it('strips a single trailing slash', () => {
    expect(normalizeBaseUrl('https://mb.acme.io/')).toBe('https://mb.acme.io');
  });

  it('preserves an explicit port', () => {
    expect(normalizeBaseUrl('mb.acme.io:3000')).toBe('https://mb.acme.io:3000');
  });

  it('preserves a subpath and strips its trailing slash', () => {
    expect(normalizeBaseUrl('http://localhost:3000/metabase/')).toBe(
      'http://localhost:3000/metabase',
    );
  });

  it('preserves a subpath without a trailing slash', () => {
    expect(normalizeBaseUrl('https://acme.io/tools/metabase')).toBe(
      'https://acme.io/tools/metabase',
    );
  });

  it("throws Error('Invalid URL') on empty string", () => {
    expect(() => normalizeBaseUrl('')).toThrow('Invalid URL');
  });

  it("throws Error('Invalid URL') on whitespace-only string", () => {
    expect(() => normalizeBaseUrl('   ')).toThrow('Invalid URL');
  });

  it("throws Error('Invalid URL') on garbage input", () => {
    expect(() => normalizeBaseUrl('ht!tp://%%%not a url')).toThrow('Invalid URL');
  });

  it("throws Error('Invalid URL') on a scheme with no host", () => {
    expect(() => normalizeBaseUrl('https://')).toThrow('Invalid URL');
  });
});
