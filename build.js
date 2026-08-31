import * as esbuild from "esbuild";
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

console.log("[build.js] Cleaning and preparing dist/...");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("src", "dist", { recursive: true });

// Copy SES UMD runtime bundle
try {
  cpSync("node_modules/ses/dist/ses.umd.min.js", "dist/renderer/ses.umd.min.js");
} catch {}

console.log("[build.js] Bundling main process with esbuild (CommonJS)...");
await esbuild.build({
  entryPoints: ["src/main/main.ts", "src/main/protocols.ts"],
  outdir: "dist/main",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: false,
  sourcemap: true,
});

console.log("[build.js] Bundling renderer runtime with esbuild (CommonJS)...");
await esbuild.build({
  entryPoints: ["src/renderer/index.ts"],
  outfile: "dist/renderer/index.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: true,
  external: ["ses", "electron", "informa", "@cathodique/wl-serv-high", "@cathodique/wl-serv-high/registries"],
  sourcemap: true,
});

console.log("[build.js] Bundling renderer init with esbuild (CommonJS)...");
await esbuild.build({
  entryPoints: ["src/renderer/init.ts"],
  outfile: "dist/renderer/init.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: true,
  external: ["ses", "electron", "informa", "@cathodique/wl-serv-high", "@cathodique/wl-serv-high/registries"],
  sourcemap: true,
});

console.log("[build.js] Bundling modules with esbuild (CommonJS)...");
const modulesDir = "src/renderer/modules/cathodique";
if (existsSync(modulesDir)) {
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const entryFile = join(modulesDir, entry.name, "index.ts");
      if (existsSync(entryFile)) {
        await esbuild.build({
          entryPoints: [entryFile],
          outfile: `dist/renderer/modules/cathodique/${entry.name}/index.js`,
          platform: "node",
          format: "cjs",
          target: "node20",
          bundle: true,
          external: ["ses", "electron", "informa", "@cathodique/wl-serv-high", "@cathodique/wl-serv-high/registries"],
          sourcemap: true,
        });
      }
    }
  }
}

console.log("[build.js] Cleaning leftover .ts files in dist...");
function removeTsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      removeTsFiles(fullPath);
    } else if (entry.name.endsWith(".ts")) {
      rmSync(fullPath);
    }
  }
}
removeTsFiles("dist");

console.log("[build.js] Build complete!");
