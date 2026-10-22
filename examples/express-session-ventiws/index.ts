// Follows `ws`'s `examples/express-session-parse` (MIT), with ventiws in place of `ws`.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";
import express from "express";
import session from "express-session";
import { WebSocketServer } from "ventiws";
import type { Request, Response } from "express";
import type { WebSocket } from "ventiws";

/// Express and the upgrade handler must share one parser instance, or the request the
/// WebSocket server sees carries no session.
const parseSession = session({ resave: false, saveUninitialized: false, secret: "$eCuRiTy" });

/// Logout closes the socket the session opened, so the connection is tracked per user.
const sessions = new Map<string, WebSocket>();

const app = express();

app.use(express.static(join(import.meta.dirname, "public")));

app.use(parseSession);

app.post("/login", (request, response) => {
  request.session.userId = randomUUID();
  response.send({ result: "OK", message: "Session updated" });
});

app.delete("/logout", (request, response) => {
  const socket = sessions.get(request.session.userId ?? "");
  request.session.destroy(() => {
    if (socket !== undefined) socket.close();
    response.send({ result: "OK", message: "Session destroyed" });
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ clientTracking: false, noServer: true });

function onSocketError(error: Error): void {
  console.error(error);
}

/// The session cookie rides the upgrade request, so parsing it before the handshake is what
/// lets the socket read `request.session`; an unauthenticated upgrade is refused with a 401.
server.on("upgrade", (request, socket, head) => {
  socket.on("error", onSocketError);

  // SAFETY: Express's session middleware decorates the upgrade request before this handler runs.
  const sessionRequest = request as Request;

  parseSession(
    sessionRequest,
    // SAFETY: an upgrade has no Express response, and the middleware only reads the request.
    {} as Response,
    () => {
      const userId = sessionRequest.session.userId;

      if (userId === undefined) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();

        return;
      }

      socket.removeListener("error", onSocketError);
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    },
  );
});

wss.on("connection", (socket, request) => {
  // SAFETY: `handleUpgrade` hands back the same request the session parser decorated above.
  const sessionRequest = request as Request;
  const userId = sessionRequest.session.userId;

  if (userId === undefined) return;

  sessions.set(userId, socket);
  socket.on("error", onSocketError);
  socket.on("message", (message) => console.log(`received ${message.toString()} from ${userId}`));
  socket.on("close", () => sessions.delete(userId));
});

const port = Number(process.env.PORT ?? 8080);

server.listen(port, () => {
  const address = server.address();
  const bound = address instanceof Object ? address.port : port;
  console.log(`listening on http://localhost:${bound}`);
});
