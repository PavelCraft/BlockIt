import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

export function startServer(port = 8788) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = normalize(join(root, relative));
      if (!file.startsWith(root)) throw new Error("Invalid path");
      response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
  console.log("BlockIt cards: http://127.0.0.1:8788/");
}
