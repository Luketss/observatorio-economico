/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0f172a", // slate-900
        secondary: "#1e293b", // slate-800
        accent: "#2563eb", // blue-600
        muted: "#94a3b8", // slate-400
        background: "#f8fafc", // slate-50
      },
      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.05)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
