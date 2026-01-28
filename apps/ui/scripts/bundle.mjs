import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uiRoot = path.resolve(__dirname, "..");
const entry = path.join(uiRoot, "dist", "main.js");
const outfile = path.join(uiRoot, "dist", "bundle.js");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

