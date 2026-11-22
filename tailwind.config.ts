import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#7C3AED", dark: "#5B21B6" },
        accent: { DEFAULT: "#E879F9", light: "#F3E8FF" },
        surface: "#FFFFFF",
        page: "#F8FAFC",
        ink: "#0F172A",
        muted: "#475569",
        border: "#E2E8F0",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      borderRadius: { card: "16px", control: "11px" },
      fontFamily: { sans: ["var(--font-poppins)", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
