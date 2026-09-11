/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          blue: "#004B8D",
          "blue-dark": "#003266",
          "blue-light": "#E8F0FA",
          yellow: "#FFB800",
        },
        sidebar: {
          DEFAULT: "#0C2856",
          hover: "#1a3a6b",
          active: "#0068FF",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
