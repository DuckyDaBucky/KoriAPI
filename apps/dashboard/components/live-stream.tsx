"use client";

import { startTransition, useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";

type LiveStreamProps = {
  title: string;
  stream: "admin";
  adminToken?: string;
  sessionToken?: string;
};

export function LiveStream({ title, stream, adminToken, sessionToken }: LiveStreamProps) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const baseUrl = new URL(getApiBaseUrl());
    const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${baseUrl.host}/v1/ws/session?stream=${stream}&adminToken=${encodeURIComponent(adminToken ?? "")}&sessionToken=${encodeURIComponent(sessionToken ?? "")}`;
    const socket = new WebSocket(socketUrl);

    socket.addEventListener("message", (event) => {
      startTransition(() => {
        setMessages((previous) => [event.data, ...previous].slice(0, 60));
      });
    });

    socket.addEventListener("error", () => {
      startTransition(() => {
        setMessages((previous) => ["[socket-error]", ...previous].slice(0, 60));
      });
    });

    return () => {
      socket.close();
    };
  }, [adminToken, sessionToken, stream]);

  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="stream panel mono">
        {messages.length === 0 ? "Connect admin or session credentials to stream live events." : messages.join("\n\n")}
      </div>
    </section>
  );
}
