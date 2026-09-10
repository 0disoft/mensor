import { createServer } from "node:http";
import app from "./dist/server.js";

const port = Number(process.env.PORT ?? 4174);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be 0-65535 (0 selects a free port)");
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65536) { outgoing.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const method = incoming.method ?? "GET";
    const request = new Request(new URL(incoming.url ?? "/", `http://127.0.0.1:${server.address().port}`), {
      method, headers: incoming.headers,
      ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }),
    });
    const response = await app.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end("Request failed");
  }
});
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? "Port already in use; choose another PORT." : error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
server.listen(port, "127.0.0.1", () => console.log(`RSVP: http://127.0.0.1:${server.address().port}/rsvp`));
