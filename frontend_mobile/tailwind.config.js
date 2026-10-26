/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.js', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Storywood palette from the web frontend's stylesheets.
      colors: {
        ink: '#120f0c',
        storywood: '#273d3e',
        card: '#1e3032',
        panel: '#19383c',
        moss: '#203a3d',
        gold: '#e5bc78',
        goldsoft: '#e8ce95',
        goldbright: '#edcf94',
        cream: '#f5e7c9',
        parchment: '#f0e8d9',
        snow: '#fff8ee',
        sage: '#c7d3c6',
        ember: '#542c36',
        blush: '#efae9a',
        rose: '#ffe5dc',
      },
    },
  },
  plugins: [],
};
