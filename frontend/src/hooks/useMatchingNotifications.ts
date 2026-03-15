// ── WebSocket hook for matching notifications ──
// Auto-connects with exponential backoff reconnection + heartbeat

import { useEffect, useRef, useCallback } from 'react';
import type { MatchingNotification } from '../api/types';

/** Derive WebSocket URL from current page location. */
function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev, backend runs on port 8000; in prod, same host
  const host = import.meta.env.DEV ? 'localhost:8000' : window.location.host;
  return `${proto}//${host}/ws/notifications`;
}

const MAX_RECONNECT_DELAY = 30_000;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 10_000;

/**
 * Hook that establishes a WebSocket connection for matching notifications.
 * Auto-reconnects on disconnect with exponential backoff.
 *
 * @param onNotification - Callback invoked when a matching notification arrives.
 */
export function useMatchingNotifications(
  onNotification: (n: MatchingNotification) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotificationRef = useRef(onNotification);
  const mountedRef = useRef(true);

  // Keep callback ref up to date without re-triggering effect
  onNotificationRef.current = onNotification;

  const clearTimers = useCallback(() => {
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
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Reset reconnect delay on successful connection
      reconnectDelayRef.current = 1000;

      // Start heartbeat
      const startHeartbeat = () => {
        heartbeatTimerRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');

            // Set timeout for pong response
            heartbeatTimeoutRef.current = setTimeout(() => {
              // No response — force reconnect
              ws.close();
            }, HEARTBEAT_TIMEOUT);
          }
        }, HEARTBEAT_INTERVAL);
      };

      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        // Handle pong responses — clear heartbeat timeout
        if (parsed.type === 'pong') {
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          // Restart heartbeat cycle
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
      if (!mountedRef.current) return;

      // Reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — no action needed here
    };
  }, [clearTimers]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearTimers]);
}
