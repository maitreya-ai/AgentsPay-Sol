import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works on GitHub Pages or any static host.
  base: "./",
  plugins: [react(), tailwindcss()],
});
