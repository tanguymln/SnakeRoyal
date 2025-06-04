import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue"; // ou react, ou autre selon ton stack

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "src/main.ts", // Assure-toi que c’est ton point d’entrée
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
