// TicketRoom — jeden Durable Object na ticket. Živý stav vlákna a dvousměrného Ganttu
// (drag pruhu ⇄ datum). WebSocket hibernation; data trvale v D1, DO jen koordinuje.

import { Env } from "./types";

export class TicketRoom {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // interní broadcast z Workeru (nová zpráva, změna stavu, posun v Ganttu)
    if (url.pathname.endsWith("/broadcast") && req.method === "POST") {
      const body = await req.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(body);
        } catch {
          /* zavřený socket */
        }
      }
      return new Response(null, { status: 204 });
    }

    // klient se připojuje na živý kanál
    if (req.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]); // hibernation-aware
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response("TicketRoom", { status: 200 });
  }

  // Echo od klienta (typing indikátor, optimistický posun pruhu) → ostatním.
  async webSocketMessage(sender: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== sender) {
        try {
          ws.send(msg);
        } catch {
          /* zavřený socket */
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* už zavřeno */
    }
  }
}
