import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "fs";
import path from "path";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
);

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    "import.meta.env.VITE_PLATFORM": JSON.stringify("google-sheets"),
  },
  publicDir: false,
  build: {
    outDir: "dist-gsheets",
    rollupOptions: {
      input: { index: path.resolve(__dirname, "google-sheets.html") },
    },
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
  },
});
