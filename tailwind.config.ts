import type { Config } from "tailwindcss";

/**
 * Netural Marktradar – Design-Tokens laut docs/design-spec.md
 * Schwarz/Weiß-Basis, Gelb als einziger Akzent, Grün/Rot rein funktional.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FFFFFF",
        gray: {
          900: "#1A1A1A",
          700: "#444444",
          500: "#6E6E6E",
          300: "#B8B8B4",
          150: "#E7E7E3",
          75: "#F4F4F1",
        },
        accent: { DEFAULT: "#F1BB1E", soft: "#FBEFC9" },
        pos: "#0E957D",
        neg: "#C9432F",
      },
      borderRadius: {
        card: "12px",
        el: "8px",
      },
      fontFamily: {
        sans: ["var(--font-hind)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
