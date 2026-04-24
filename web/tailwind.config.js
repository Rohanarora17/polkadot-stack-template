/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				ivory: {
					50: "#fffaf0",
					100: "#f7edda",
					200: "#ead7b6",
				},
				ink: {
					500: "#6e6758",
					700: "#3e3a31",
					900: "#211f1a",
					950: "#151611",
				},
				emerald: {
					50: "#edf7ef",
					100: "#d8eadc",
					600: "#326c52",
					700: "#275941",
					900: "#18372d",
				},
				coral: {
					50: "#fff0eb",
					400: "#c76849",
					500: "#ad4f39",
					800: "#8d3f2f",
				},
				surface: {
					950: "#151611",
					900: "rgba(255, 250, 240, 0.88)",
					800: "rgba(247, 237, 218, 0.9)",
					700: "rgba(234, 215, 182, 0.95)",
				},
				polka: {
					50: "#fff1f3",
					100: "#ffe0e5",
					200: "#ffc6cf",
					300: "#ff9bac",
					400: "#ff5f7a",
					500: "#e6007a",
					600: "#c30066",
					700: "#a30055",
					800: "#880049",
					900: "#740041",
				},
				accent: {
					blue: "#075985",
					purple: "#6d28d9",
					green: "#166534",
					orange: "#9a3412",
					red: "#991b1b",
					yellow: "#854d0e",
				},
				text: {
					primary: "#151611",
					secondary: "#3e3a31",
					tertiary: "#514b40",
					muted: "#665f52",
				},
			},
			fontFamily: {
				display: ['"Fraunces"', '"Instrument Sans"', "Georgia", "serif"],
				body: ['"Instrument Sans"', "system-ui", "-apple-system", "sans-serif"],
				mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
			},
			backgroundImage: {
				"gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
			},
			animation: {
				"fade-in": "fadeIn 0.4s ease-out forwards",
				"slide-up": "slideUp 0.5s ease-out forwards",
				"pulse-slow": "pulse 3s ease-in-out infinite",
			},
			keyframes: {
				fadeIn: {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				slideUp: {
					"0%": { opacity: "0", transform: "translateY(12px)" },
					"100%": { opacity: "1", transform: "translateY(0)" },
				},
			},
			borderRadius: {
				xl: "1rem",
				"2xl": "1.25rem",
			},
			boxShadow: {
				glow: "0 0 24px -4px rgba(230, 0, 122, 0.15)",
				"glow-lg": "0 0 48px -8px rgba(230, 0, 122, 0.2)",
				card: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
				"card-hover": "0 4px 12px 0 rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
			},
		},
	},
	plugins: [],
};
