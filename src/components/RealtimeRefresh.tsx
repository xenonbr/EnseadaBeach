"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Canal Realtime com reconexão segura:
 * - O banco de dados permanece como única fonte da verdade.
 * - Eventos Realtime, retorno de conexão ('online') e foco da aba disparam router.refresh() com debounce.
 * - Também executa polling leve de segurança caso o WebSocket oscile em rede móvel.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        router.refresh();
      }, 350);
    };

    const channel = supabase.channel(`rt-${tablesKey}`);
    for (const table of tablesKey.split(",").filter(Boolean)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => triggerRefresh(),
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Ao conectar/reconectar, sincroniza com o banco
        triggerRefresh();
      }
    });

    const onOnline = () => {
      setOnline(true);
      triggerRefresh();
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") triggerRefresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") {
        router.refresh();
      }
    }, 15000);

    return () => {
      if (timeout) clearTimeout(timeout);
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [router, tablesKey]);

  return (
    <span className={`chip ${online ? "chip-on" : "chip-open"}`} role="status">
      {online ? "Conectado em tempo real" : "Sem conexão — reconectando..."}
    </span>
  );
}
