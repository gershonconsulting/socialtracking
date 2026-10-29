import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // v4.9.0 — "Charcoal & Signal Red". Geist for text, Geist Mono for numbers.
    fontFamily: {
      sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
    },
    extend: {
      colors: {
        // Warm neutrals replace Tailwind's cool grays everywhere at once, and
        // "red" becomes the Gershon signal red. Every page picks this up
        // without being edited.
        // v0.6.0 — unified Gershon.ai look (Linalysis master, Gershon.ai red):
        // neutral grays with #e5e7eb borders and #1d1d1f ink, and "red" is the
        // Gershon.ai red #CC3333 / dark #a8281f / tint #fdf2f2. Every page picks
        // this up without being edited.
        gray: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#1D1D1F",
          950: "#0E0F12",
        },
        red: {
          50: "#FDF2F2",
          100: "#FBE1DF",
          200: "#F3C9C5",
          300: "#EA9F98",
          400: "#DD6A60",
          500: "#D44A3F",
          600: "#CC3333",
          700: "#A8281F",
          800: "#86201A",
          900: "#6F1A14",
        },
        brand: {
          DEFAULT: "#CC3333",
          hover: "#A8281F",
          charcoal: "#111317",
          ink: "#1D1D1F",
          paper: "#F7F7F8",
          stone: "#E5E7EB",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        status: {
          green: "#16a34a",
          red: "#dc2626",
          yellow: "#d97706",
          gray: "#6b7280",
        },
      },
      // Flat cards: a hairline border does the work, not a shadow.
      boxShadow: {
        sm: "0 1px 2px rgba(21, 23, 28, 0.04)",
        DEFAULT: "0 1px 3px rgba(21, 23, 28, 0.06)",
        md: "0 4px 12px rgba(21, 23, 28, 0.08)",
        lg: "0 12px 32px rgba(21, 23, 28, 0.12)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
