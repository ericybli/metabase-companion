import { lightTheme, darkTheme } from './theme';

describe('theme', () => {
  it('spacing(3) === 12', () => {
    expect(lightTheme.spacing(3)).toBe(12);
    expect(darkTheme.spacing(3)).toBe(12);
  });

  it('exposes both modes with required color keys', () => {
    expect(lightTheme.mode).toBe('light');
    expect(darkTheme.mode).toBe('dark');
    for (const t of [lightTheme, darkTheme]) {
      expect(t.colors).toEqual(
        expect.objectContaining({
          background: expect.any(String),
          surface: expect.any(String),
          text: expect.any(String),
          textMuted: expect.any(String),
          primary: expect.any(String),
          border: expect.any(String),
          danger: expect.any(String),
        }),
      );
    }
  });

  it('exposes radius scale', () => {
    expect(lightTheme.radius).toEqual({ sm: 6, md: 10, lg: 16 });
  });
});
