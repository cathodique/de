import * as esbuild from "esbuild";
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

console.log("[build.mjs] Type-checking TypeScript source...");
execSync("npx tsc --noEmit", { stdio: "inherit" });

console.log("[build.mjs] Cleaning and preparing dist/...");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("src", "dist", { recursive: true });

// Copy SES UMD runtime bundle
try {
  cpSync("node_modules/ses/dist/ses.umd.min.js", "dist/renderer/ses.umd.min.js");
} catch { }

const hostExternals = [
  "ses",
  "electron",
  "informa",
  "@cathodique/wl-serv-high",
  "@cathodique/wl-serv-high/registries",
  "@cathodique/wl-serv-high/objects",
  "@cathodique/usocket2",
];

console.log("[build.mjs] Bundling main process with esbuild (CommonJS)...");
await esbuild.build({
  entryPoints: ["src/main/main.ts", "src/main/protocols.ts", "src/main/dmabuf-bridge.ts"],
  outdir: "dist/main",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: false,
  sourcemap: true,
});

console.log("[build.mjs] Bundling renderer runtime shell with esbuild (CommonJS)...");
await esbuild.build({
  entryPoints: ["src/renderer/index.ts"],
  outfile: "dist/renderer/index.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: true,
  external: hostExternals,
  sourcemap: true,
});

console.log("[build.mjs] Transpiling renderer bridge clients...");
await esbuild.build({
  entryPoints: ["src/renderer/dmabuf-client.ts"],
  outfile: "dist/renderer/dmabuf-client.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  bundle: false,
  sourcemap: true,
});

console.log("[build.mjs] Compiling modules as individual modular units...");
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
          bundle: false,
          sourcemap: true,
        });
      }
    }
  }
}

console.log("[build.mjs] Cleaning leftover .ts files in dist...");
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

console.log("[build.mjs] Build complete!");
