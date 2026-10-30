/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        earth: {
          bg: "#F8F6F0",        // Linen Oat Milk
          surface: "#FFFFFF",   // Pure White
          border: "#E5E0D8",    // Warm Border
          primary: "#10B981",   // Botanical Emerald
          primaryDark: "#059669",
          danger: "#EF4444",    // Crimson Alert
          dangerDark: "#DC2626",
          dangerBg: "#FEF2F2",
          warning: "#F59E0B",   // Warm Gold
          warningBg: "#FFFBEB",
          text: "#1F1D1A",      // Roasted Charcoal
          muted: "#6B7280",     // Subdued Slate
          cardHover: "#FAF8F5",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
