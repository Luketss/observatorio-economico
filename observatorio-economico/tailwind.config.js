/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2563EB",
        secondary: "#60A5FA",
        accent: "#F59E0B",
        success: "#10B981",
        warning: "#FBBF24",
        danger: "#EF4444",
        background: "#F8FAFC",
        card: "#FFFFFF",
      },
      fontFamily: {
        sans: ["Inter", "Plus Jakarta Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
