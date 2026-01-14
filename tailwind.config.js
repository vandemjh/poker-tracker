/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neo-brutalist color palette
        'nb-yellow': '#FFE500',
        'nb-pink': '#FF6B9D',
        'nb-blue': '#0088FF',
        'nb-green': '#00D26A',
        'nb-orange': '#FF9500',
        'nb-purple': '#A855F7',
        'nb-red': '#FF3B30',
        'nb-cyan': '#00CED1',
        'nb-lime': '#BFFF00',
        'nb-cream': '#FFF8E7',
        'nb-white': '#FFFFFF',
        'nb-black': '#000000',
      },
      boxShadow: {
        // Neo-brutalist offset shadows (no blur)
        'nb': '4px 4px 0px 0px #000000',
        'nb-sm': '2px 2px 0px 0px #000000',
        'nb-lg': '6px 6px 0px 0px #000000',
        'nb-xl': '8px 8px 0px 0px #000000',
        'nb-hover': '2px 2px 0px 0px #000000',
        'nb-active': '0px 0px 0px 0px #000000',
      },
      borderWidth: {
        '3': '3px',
        '4': '4px',
        '5': '5px',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      translate: {
        'nb': '4px',
        'nb-hover': '2px',
      },
    },
  },
  plugins: [],
}
