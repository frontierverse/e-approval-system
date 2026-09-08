import "server-only";

import { createHmac } from "node:crypto";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseRealtimeServerClient } from "@/lib/supabase-realtime-server";

type StaffChatEventListener = {
  onChange: () => void;
  onStatus: (status: "ready" | "reconnect") => void;
};

type StaffChatSubscription = {
  channel: RealtimeChannel;
  listeners: Set<StaffChatEventListener>;
  ready: boolean;
};

// One upstream subscription per employee per server process supports multiple tabs.
const subscriptions = new Map<string, StaffChatSubscription>();
const closingSubscriptions = new Map<string, Promise<unknown>>();

function getRealtimeConfiguration() {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !key) {
    throw new Error("Staff chat realtime is not configured.");
  }

  return { url, key };
}

export function getStaffChatRealtimeTopic(userId: string) {
  const { key } = getRealtimeConfiguration();
  return `staff-chat:${createHmac("sha256", key)
    .update(`staff-chat:${userId}`)
    .digest("hex")}`;
}

/** Call after the database transaction commits. Delivery failure never undoes a send. */
export async function publishStaffChatChange(userIds: string[]) {
  if (!userIds.length) return;

  try {
    const { url, key } = getRealtimeConfiguration();
    const response = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [...new Set(userIds)].map((userId) => ({
          topic: getStaffChatRealtimeTopic(userId),
          event: "change",
          private: true,
          payload: {},
        })),
      }),
      signal: AbortSignal.timeout(2_000),
      cache: "no-store",
    });

    await response.body?.cancel();
    if (!response.ok) {
      console.warn("[staff-chat-realtime] Broadcast unavailable; polling will recover.");
    }
  } catch {
    // Never log keys, topics, recipient IDs, or message contents.
    console.warn("[staff-chat-realtime] Broadcast unavailable; polling will recover.");
  }
}

export async function subscribeStaffChatChanges(
  userId: string,
  listener: StaffChatEventListener,
): Promise<() => Promise<void>> {
  const topic = getStaffChatRealtimeTopic(userId);
  const supabase = getSupabaseRealtimeServerClient();
  // Resolve the server client's service-role token before the first private join.
  await supabase.realtime.setAuth();

  // A new tab may arrive while the last tab's unsubscribe is still completing.
  await closingSubscriptions.get(topic);
  let subscription = subscriptions.get(topic);

  if (subscription) {
    subscription.listeners.add(listener);
    if (subscription.ready) listener.onStatus("ready");
  } else {
    const channel = supabase.channel(topic, { config: { private: true } });
    subscription = { channel, listeners: new Set([listener]), ready: false };
    const current = subscription;
    subscriptions.set(topic, current);

    try {
      channel
        .on("broadcast", { event: "change" }, () => {
          for (const subscriber of current.listeners) subscriber.onChange();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            current.ready = true;
            for (const subscriber of current.listeners) subscriber.onStatus("ready");
          } else if (
            status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"
          ) {
            current.ready = false;
            for (const subscriber of current.listeners) subscriber.onStatus("reconnect");
          }
        });
    } catch (error) {
      subscriptions.delete(topic);
      current.listeners.clear();
      const closing = supabase.removeChannel(channel).catch(() => undefined);
      closingSubscriptions.set(topic, closing);
      await closing;
      if (closingSubscriptions.get(topic) === closing) closingSubscriptions.delete(topic);
      throw error;
    }
  }

  const current = subscription;
  return async () => {
    current.listeners.delete(listener);
    if (current.listeners.size || subscriptions.get(topic) !== current) return;

    subscriptions.delete(topic);
    const closing = supabase.removeChannel(current.channel).catch(() => undefined);
    closingSubscriptions.set(topic, closing);
    await closing;
    if (closingSubscriptions.get(topic) === closing) closingSubscriptions.delete(topic);
  };
}
