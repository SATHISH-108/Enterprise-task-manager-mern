import { useCallback, useEffect, useState } from "react";
import { notifsApi } from "../../shared/api/endpoints.js";

const supported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const getRegistration = async () => {
  let reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
};

export default function usePushNotifications() {
  const [permission, setPermission] = useState(
    supported ? Notification.permission : "denied",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshSubscribedState = useCallback(async () => {
    if (!supported) return;
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    refreshSubscribedState();
  }, [refreshSubscribedState]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError("Browser does not support push notifications");
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Notification permission denied");
        return false;
      }

      const keyResp = await notifsApi.pushKey();
      const publicKey = keyResp?.data?.publicKey;
      const enabled = keyResp?.data?.enabled;
      if (!enabled || !publicKey) {
        setError("Server push not configured");
        return false;
      }

      const reg = await getRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      await notifsApi.pushSubscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e?.message || "Failed to subscribe");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await notifsApi
          .pushUnsubscribe(sub.endpoint)
          .catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e?.message || "Failed to unsubscribe");
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, permission, subscribed, busy, error, subscribe, unsubscribe };
}
