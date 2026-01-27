import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT ?? 3000);
const distDir = path.join(__dirname, "dist");
const publicDir = path.join(__dirname, "public");
const sharedDistDir = path.resolve(__dirname, "..", "..", "packages", "shared", "dist");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const contentType = contentTypes.get(ext) ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function resolveAssetPath(relativePath, roots) {
  for (const root of roots) {
    const direct = path.join(root, relativePath);
    if (fs.existsSync(direct)) {
      return direct;
    }
    if (!path.extname(relativePath)) {
      const withJs = `${relativePath}.js`;
      const candidate = path.join(root, withJs);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return path.join(roots[roots.length - 1], relativePath);
}

const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
    if (urlPath.startsWith("/shared/")) {
      const relativePath = urlPath.replace(/^\/shared\/+/, "");
      const candidate = resolveAssetPath(relativePath, [sharedDistDir]);
      return sendFile(res, candidate);
    }
    if (urlPath === "/" || urlPath === "/index.html") {
      return sendFile(res, path.join(publicDir, "index.html"));
    }

    const relativePath = urlPath.replace(/^\/+/, "");
    const candidate = resolveAssetPath(relativePath, [publicDir, distDir]);
    const hasExtension = Boolean(path.extname(relativePath));
    if (!hasExtension && !fs.existsSync(candidate)) {
      return sendFile(res, path.join(publicDir, "index.html"));
    }
    return sendFile(res, candidate);
  });

server.listen(port, () => {
  console.log("ui.startup", { ts: new Date().toISOString(), port });
});

function shutdown(signal) {
  console.log("ui.shutdown", { ts: new Date().toISOString(), signal });
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
