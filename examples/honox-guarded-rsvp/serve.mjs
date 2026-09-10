import { createServer } from "node:http";
import app from "./dist/server.js";

const port = Number(process.env.PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1-65535");
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65536) { outgoing.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const method = incoming.method ?? "GET";
    const request = new Request(new URL(incoming.url, `http://127.0.0.1:${port}`), {
      method, headers: incoming.headers,
      ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }),
    });
    const response = await app.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end("Request failed");
  }
}).listen(port, "127.0.0.1", () => console.log(`RSVP: http://127.0.0.1:${port}/rsvp`));
