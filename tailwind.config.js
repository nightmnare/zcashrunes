/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 15px 50px rgba(30, 64, 175, 0.35)',
      },
      colors: {
        zcash: {
          gold: '#F4B728',
          teal: '#00F5D4',
        },
      },
    },
  },
  plugins: [],
};
