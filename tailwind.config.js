/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Design System Colors
        background: {
          primary: '#1E1E2B',
          secondary: '#12121F',
          tertiary: '#8B8B91',
          bottom: '#8B8B91',
        },
        text: {
          primary: '#F4F4F4',
          secondary: '#8B8B91',
          dark: '#1D1D1D',
        },
        button: {
          primary: '#0058DB',
          danger: '#FA0439',
          secondary: 'rgba(255, 255, 255, 0.05)',
          dark: 'rgba(0, 0, 0, 0.3)',
          white: '#F4F4F4',
        },
        accent: {
          blue: '#518CFF',
          red: '#FA0439',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.05)',
        },
      },
      fontFamily: {
        sans: ['System', 'SF Pro Display', 'sans-serif'],
        display: ['SF Pro Display', 'System', 'sans-serif'],
        text: ['SF Pro Text', 'System', 'sans-serif'],
      },
      fontSize: {
        'xs': ['13px', { lineHeight: '1.08' }],
        'sm': ['14px', { lineHeight: '1' }],
        'base': ['16px', { lineHeight: '1' }],
        'lg': ['18px', { lineHeight: '1' }],
        'xl': ['20px', { lineHeight: '1' }],
        '2xl': ['24px', { lineHeight: '1' }],
        '3xl': ['32px', { lineHeight: '0.4375' }],
      },
      letterSpacing: {
        'tight': '-0.0314em',
        'normal': '-0.0291em',
        'wide': '-0.0255em',
        'wider': '-0.02em',
        'widest': '-0.0127em',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '24px',
        'full': '32px',
      },
      spacing: {
        '4.5': '18px',
        '12.5': '50px',
        '15': '60px',
      },
    },
  },
  plugins: [],
};
