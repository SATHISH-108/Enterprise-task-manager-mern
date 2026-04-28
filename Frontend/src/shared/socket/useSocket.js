import { useEffect } from "react";
import { getSocket } from "./socketClient.js";

/**
 * useSocketEvent("taskUpdated", (payload) => { ... })
 * Subscribes once, unsubscribes on unmount.
 */
export const useSocketEvent = (event, handler) => {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [event, handler]);
};
