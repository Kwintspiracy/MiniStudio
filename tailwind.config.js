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
        // App theme colors
        background: {
          primary: '#0D1117',
          secondary: '#161B22',
          tertiary: '#21262D',
        },
        accent: {
          indigo: '#6366f1',
          emerald: '#10b981',
        },
      },
      fontFamily: {
        sans: ['System', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
