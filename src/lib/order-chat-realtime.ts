"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ChatMessage } from "./nestjs-api";

export type ReceiptUpdate = {
  messageId?: string;
  senderType: "customer" | "admin";
  receiptStatus: "delivered" | "seen";
  at: string;
};

export type AdminChatConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting";

export function mergeChatMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
) {
  const index = messages.findIndex(
    (message) =>
      message.id === incoming.id ||
      (incoming.clientMessageId &&
        message.clientMessageId === incoming.clientMessageId),
  );
  if (index < 0) return [...messages, incoming];
  const next = [...messages];
  next[index] = incoming;
  return next;
}

export function applyReceipt(messages: ChatMessage[], update: ReceiptUpdate) {
  const readAt = new Date(update.at).getTime();
  return messages.map((message) => {
    const applies = update.messageId
      ? message.id === update.messageId
      : message.senderType === update.senderType &&
        new Date(message.createdAt).getTime() <= readAt;
    if (!applies || message.receiptStatus === "seen") return message;
    if (
      update.receiptStatus === "delivered" &&
      message.receiptStatus !== "sent"
    ) {
      return message;
    }
    return {
      ...message,
      receiptStatus: update.receiptStatus,
      receiptLabel: (update.receiptStatus === "seen" ? "Seen" : "Delivered") as
        "Seen" | "Delivered",
    };
  });
}

function realtimeUrl() {
  const configured = new URL(
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  );
  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(configured.hostname) &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    configured.hostname = window.location.hostname;
  }
  return `${configured.origin}/order-chat`;
}

export function useAdminOrderChatRealtime({
  orderId,
  enabled,
  onMessage,
  onReceipt,
  onSync,
}: {
  orderId: string;
  enabled: boolean;
  onMessage: (message: ChatMessage) => void;
  onReceipt: (update: ReceiptUpdate) => void;
  onSync: () => void;
}) {
  const [connectionState, setConnectionState] =
    useState<AdminChatConnectionState>("connecting");
  const callbacks = useRef({ onMessage, onReceipt, onSync });

  useEffect(() => {
    callbacks.current = { onMessage, onReceipt, onSync };
  }, [onMessage, onReceipt, onSync]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let connectedOnce = false;
    let socket: Socket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delay: number) => {
      if (disposed || retry) return;
      retry = setTimeout(() => {
        retry = null;
        void connect();
      }, delay);
    };
    const reference = { orderId };
    const markSeen = () => {
      if (document.visibilityState === "visible" && socket?.connected) {
        socket.emit("chat:seen", reference);
      }
    };
    const connect = async () => {
      setConnectionState(connectedOnce ? "reconnecting" : "connecting");
      try {
        const response = await fetch("/api/admin/auth/realtime-ticket", {
          method: "POST",
        });
        if (!response.ok) {
          if (response.status >= 500) schedule(2000);
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("ticket" in payload) ||
          typeof payload.ticket !== "string" ||
          disposed
        )
          return;
        socket = io(realtimeUrl(), {
          transports: ["websocket"],
          auth: { ticket: payload.ticket },
          reconnection: false,
        });
        socket.on("connect", () => {
          const isReconnect = connectedOnce;
          connectedOnce = true;
          setConnectionState("connected");
          socket?.emit("chat:join", reference, (result: { ok?: boolean }) => {
            if (!result?.ok) return;
            if (isReconnect) callbacks.current.onSync();
          });
        });
        socket.on("chat:message", (event: { message?: ChatMessage }) => {
          if (!event.message) return;
          callbacks.current.onMessage(event.message);
          if (event.message.senderType === "customer") {
            socket?.emit("chat:delivered", {
              ...reference,
              messageId: event.message.id,
            });
            markSeen();
          }
        });
        socket.on("chat:receipt-update", (update: ReceiptUpdate) => {
          callbacks.current.onReceipt(update);
        });
        socket.on("disconnect", () => {
          setConnectionState("reconnecting");
          schedule(1000);
        });
        socket.on("connect_error", () => {
          setConnectionState("reconnecting");
          socket?.disconnect();
          schedule(1000);
        });
      } catch {
        schedule(2000);
      }
    };
    const visibility = () => markSeen();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    void connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
      if (socket?.connected) socket.emit("chat:leave", reference);
      socket?.disconnect();
    };
  }, [enabled, orderId]);

  return connectionState;
}
