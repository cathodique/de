/**
 * Protocol handlers for Electron main process.
 * Serves app://top and handles https://mods.cathodique.de virtual module repository.
 */

import { net, protocol } from "electron";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: false,
      allowServiceWorkers: false,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const DANGEROUS_EXTENSIONS = new Set([
  ".html", ".htm", ".xhtml", ".xht", ".php", ".asp", ".aspx", ".jsp", ".exe", ".sh", ".bat", ".cmd",
]);

const MIME_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

function createHeaders(contentType: string): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "X-Content-Type-Options": "nosniff",
  });
}

function resolveSafePath(rootDir: string, subPath: string): string | null {
  const norm = decodeURIComponent(subPath).replace(/^\/+/, "");
  const target = resolve(rootDir, norm);
  const root = resolve(rootDir);
  return target === root || target.startsWith(root + "/") ? target : null;
}

function scanModules(modulesDir: string): Array<Record<string, any>> {
  const catalog: Array<Record<string, any>> = [];
  if (!existsSync(modulesDir)) return catalog;

  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const subDir = join(modulesDir, entry.name);
      const manifestPath = join(subDir, "manifest.json");
      if (existsSync(manifestPath)) {
        try {
          catalog.push(JSON.parse(readFileSync(manifestPath, "utf-8")));
          continue;
        } catch {}
      }
      for (const modEntry of readdirSync(subDir, { withFileTypes: true })) {
        if (modEntry.isDirectory()) {
          const modManifest = join(subDir, modEntry.name, "manifest.json");
          if (existsSync(modManifest)) {
            try {
              catalog.push(JSON.parse(readFileSync(modManifest, "utf-8")));
            } catch {}
          }
        }
      }
    }
  }
  return catalog;
}

async function handleModsServer(request: Request, rendererDir: string): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: createHeaders("text/plain") });
  }

  const modulesDir = join(rendererDir, "modules");

  // 1. Catalog index
  if (pathname === "/" || pathname === "/index.json") {
    const modules = scanModules(modulesDir);
    return new Response(JSON.stringify({ domain: "mods.cathodique.de", modules }, null, 2), {
      status: 200,
      headers: createHeaders("application/json; charset=utf-8"),
    });
  }

  // 2. Parse scope and module name
  const clean = pathname.replace(/^\/+/, "");
  let scope = "cathodique";
  let modName = clean;
  let subPath = "";

  if (clean.startsWith("@")) {
    const parts = clean.slice(1).split("/");
    scope = parts[0];
    modName = parts[1] ?? "";
    subPath = parts.slice(2).join("/");
  } else if (clean.startsWith("modules/")) {
    const parts = clean.replace(/^modules\//, "").split("/");
    scope = parts[0];
    modName = parts[1] ?? "";
    subPath = parts.slice(2).join("/");
  }

  const cleanModName = modName.replace(/\.(js|mjs)$/, "");
  const modFolder = resolveSafePath(join(modulesDir, scope), cleanModName);

  if (modFolder && existsSync(modFolder) && statSync(modFolder).isDirectory()) {
    if (subPath === "manifest.json" || clean.endsWith("manifest.json")) {
      const mf = join(modFolder, "manifest.json");
      if (existsSync(mf)) {
        return new Response(await readFile(mf), { status: 200, headers: createHeaders("application/json; charset=utf-8") });
      }
    }

    if (subPath) {
      const assetFile = resolveSafePath(modFolder, subPath);
      if (assetFile && existsSync(assetFile) && statSync(assetFile).isFile()) {
        const ext = extname(assetFile).toLowerCase();
        if (DANGEROUS_EXTENSIONS.has(ext)) {
          return new Response("Forbidden: Dangerous file types blocked.", { status: 403, headers: createHeaders("text/plain") });
        }
        const mime = MIME_TYPES[ext] ?? "application/octet-stream";
        return new Response(await readFile(assetFile), { status: 200, headers: createHeaders(mime) });
      }
    }

    // Serve module entry file (index.js)
    const entryPath = join(modFolder, "index.js");
    if (existsSync(entryPath)) {
      return new Response(await readFile(entryPath), { status: 200, headers: createHeaders("application/javascript; charset=utf-8") });
    }
  }

  // Fallback to renderer files
  const cand = resolveSafePath(rendererDir, clean);
  if (cand && existsSync(cand) && statSync(cand).isFile()) {
    const ext = extname(cand).toLowerCase();
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(await readFile(cand), { status: 200, headers: createHeaders(mime) });
  }

  return new Response(`Not Found: ${pathname}`, { status: 404, headers: createHeaders("text/plain") });
}

export const registerProtocols = () => {
  const rendererDir = resolve(__dirname, "../renderer");

  // Handle app://top/...
  protocol.handle("app", (request) => {
    const reqUrl = new URL(request.url);

    switch (reqUrl.host) {
      case "top": {
        if (reqUrl.pathname.split("/").some((v) => v === "." || v === "..")) {
          return new Response("Forbidden", { status: 403 });
        }
        const filePath = resolveSafePath(rendererDir, reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname);
        if (filePath && existsSync(filePath)) {
          return net.fetch(pathToFileURL(filePath).toString());
        }
        return new Response("Not found", { status: 404 });
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  });

  // Handle https://mods.cathodique.de/...
  protocol.handle("https", async (request) => {
    const url = new URL(request.url);
    if (url.hostname === "mods.cathodique.de" || url.hostname.endsWith(".cathodique.de")) {
      return await handleModsServer(request, rendererDir);
    }
    return net.fetch(request);
  });
};
