// ── WebSocket hook for matching notifications ──
// Auto-connects with exponential backoff reconnection + heartbeat

import { useEffect, useRef } from 'react';
import type { MatchingNotification } from '../api/types';

/** Derive WebSocket URL from current page location.
 *  Uses window.location.host in all modes — Vite proxy handles /ws in dev. */
function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/notifications`;
}

const MAX_RECONNECT_DELAY = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 10_000;

/**
 * Hook that establishes a WebSocket connection for matching notifications.
 * Auto-reconnects on disconnect with exponential backoff (up to MAX_RECONNECT_ATTEMPTS).
 *
 * @param onNotification - Callback invoked when a matching notification arrives.
 */
export function useMatchingNotifications(
  onNotification: (n: MatchingNotification) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotificationRef = useRef(onNotification);
  const mountedRef = useRef(true);

  // Keep callback ref up to date without re-triggering effect
  useEffect(() => {
    onNotificationRef.current = onNotification;
  });

  useEffect(() => {
    mountedRef.current = true;

    function clearTimers() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    }

    function scheduleHeartbeat(ws: WebSocket) {
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }
      heartbeatTimerRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
          heartbeatTimeoutRef.current = setTimeout(() => {
            ws.close();
          }, HEARTBEAT_TIMEOUT);
        }
      }, HEARTBEAT_INTERVAL);
    }

    function connect() {
      if (!mountedRef.current) return;

      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelayRef.current = 1000;
        reconnectAttemptsRef.current = 0;
        scheduleHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          // Handle pong responses — clear heartbeat timeout and restart cycle
          if (parsed.type === 'pong') {
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            scheduleHeartbeat(ws);
            return;
          }

          // Process matching notifications
          if (parsed.type === 'matching_complete' || parsed.type === 'matching_failed') {
            onNotificationRef.current(parsed as MatchingNotification);
          }
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onclose = () => {
        clearTimers();
        // Guard: only reconnect if this is still our active WebSocket
        if (!mountedRef.current || wsRef.current !== ws) return;

        // Stop reconnecting after limit
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

        reconnectAttemptsRef.current += 1;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = () => {
        // onerror is always followed by onclose — no action needed here
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);
}
