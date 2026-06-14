export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    border: string;
    danger: string;
  };
  spacing: (n: number) => number; // n * 4
  radius: { sm: number; md: number; lg: number };
}

const spacing = (n: number): number => n * 4;
const radius = { sm: 6, md: 10, lg: 16 } as const;

// Metabase brand blue (#509EE3) as primary; neutral grays tuned for WCAG AA body text.
export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F7F9FB',
    text: '#1B1F26',
    textMuted: '#5A6472',
    primary: '#3B82C4',
    border: '#E2E7EE',
    danger: '#D14343',
  },
  spacing,
  radius,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#15191F',
    surface: '#1E242C',
    text: '#F2F4F7',
    textMuted: '#9AA4B2',
    primary: '#62A8E5',
    border: '#2C333D',
    danger: '#E5736E',
  },
  spacing,
  radius,
};
