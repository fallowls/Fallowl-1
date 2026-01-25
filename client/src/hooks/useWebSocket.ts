import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useAuth } from "./use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { getWebSocketConfig, getReconnectDelay } from "@/lib/websocketConfig";

interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
}

export function useWebSocket() {
  const { user, logout } = useAuth();
  const isAuthenticated = !!user;
  const getAccessTokenSilently = async () => ""; // Placeholder for missing method
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);
  
  // Memoize config to prevent recreation on every render
  const wsConfig = useMemo(() => getWebSocketConfig(), []);
  const maxReconnectAttempts = wsConfig.reconnectOptions.maxAttempts;
  const isIntentionalDisconnect = useRef(false);

  const connect = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      console.log("⏸️ WebSocket connection skipped: user not authenticated");
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log("⏸️ WebSocket connection skipped: already connected or connecting");
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const wsUrl = wsConfig.url;

      console.log(`🔌 Connecting to WebSocket: ${wsUrl} (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
      console.log("🔑 WebSocket Token:", token ? "Token present" : "Token missing");

      const ws = new WebSocket(wsUrl, [`auth-${token}`]);
      isIntentionalDisconnect.current = false;

      ws.onopen = () => {
        console.log("✅ WebSocket connected successfully");
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Start heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, wsConfig.heartbeatInterval);
      };

      ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log("📨 WebSocket message received:", message);

        switch (message.type) {
          case "connected":
            console.log("✅ WebSocket connection confirmed");
            break;

          case "new_call":
            console.log("📞 New call received:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && (
                    key === "/api/calls" || 
                    key.startsWith("/api/calls/recent") ||
                    key.startsWith("/api/calls?") ||
                    key === "/api/calls/stats"
                  )
                );
              }
            });
            break;

          case "call_update":
            console.log("📞 Call updated:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && (
                    key === "/api/calls" || 
                    key.startsWith("/api/calls/recent") ||
                    key.startsWith("/api/calls?") ||
                    key === "/api/calls/stats"
                  )
                );
              }
            });
            break;

          case "new_recording":
            console.log("🎙️ New recording received:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && key.startsWith("/api/recordings")
                );
              }
            });
            break;

          case "recording_update":
            console.log("🎙️ Recording updated:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && key.startsWith("/api/recordings")
                );
              }
            });
            break;

          case "pong":
            break;

          case "parallel_call_started":
            console.log("📞 Parallel call started:", message.data);
            window.dispatchEvent(new CustomEvent("parallel_call_started", { detail: message.data }));
            break;

          case "parallel_call_status":
            console.log("📞 Parallel call status update:", message.data);
            window.dispatchEvent(new CustomEvent("parallel_call_status", { detail: message.data }));
            break;

          case "parallel_call_connected":
            console.log("📞 Parallel call connected:", message.data);
            window.dispatchEvent(new CustomEvent("parallel_call_connected", { detail: message.data }));
            break;

          case "parallel_call_ended":
            console.log("📞 Parallel call ended:", message.data);
            window.dispatchEvent(new CustomEvent("parallel_call_ended", { detail: message.data }));
            break;

          case "conference-ready":
            console.log("✅ Conference ready:", message.data);
            window.dispatchEvent(new CustomEvent("conference_ready", { detail: message.data }));
            break;

          case "import_progress":
            console.log("📊 Import progress:", message.data);
            window.dispatchEvent(new CustomEvent("import_progress", { detail: message.data }));
            break;

          case "import_complete":
            console.log("✅ Import complete:", message.data);
            window.dispatchEvent(new CustomEvent("import_complete", { detail: message.data }));
            queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
            break;

          case "import_error":
            console.log("❌ Import error:", message.data);
            window.dispatchEvent(new CustomEvent("import_error", { detail: message.data }));
            break;

          case "new_sms":
            console.log("📱 New SMS sent:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && (
                    key === "/api/messages" || 
                    key.startsWith("/api/messages/") ||
                    key === "/api/sms/analytics"
                  )
                );
              }
            });
            window.dispatchEvent(new CustomEvent("new_sms", { detail: message.data }));
            break;

          case "incoming_sms":
            console.log("📱 Incoming SMS received:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && (
                    key === "/api/messages" || 
                    key.startsWith("/api/messages/") ||
                    key === "/api/sms/analytics" ||
                    key === "/api/messages/unread/count"
                  )
                );
              }
            });
            window.dispatchEvent(new CustomEvent("incoming_sms", { detail: message.data }));
            break;

          case "sms_status_update":
            console.log("📱 SMS status updated:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && (
                    key === "/api/messages" || 
                    key.startsWith("/api/messages/")
                  )
                );
              }
            });
            window.dispatchEvent(new CustomEvent("sms_status_update", { detail: message.data }));
            break;

          case "sms_delivered":
            console.log("✅ SMS delivered:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && key.startsWith("/api/messages")
                );
              }
            });
            window.dispatchEvent(new CustomEvent("sms_delivered", { detail: message.data }));
            break;

          case "sms_failed":
            console.log("❌ SMS failed:", message.data);
            queryClient.invalidateQueries({ 
              predicate: (query) => {
                return query.queryKey.some(key => 
                  typeof key === 'string' && key.startsWith("/api/messages")
                );
              }
            });
            window.dispatchEvent(new CustomEvent("sms_failed", { detail: message.data }));
            break;

          case "new_voicemail":
            console.log("🎙️ New voicemail received:", message.data);
            queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
            queryClient.invalidateQueries({ queryKey: ["/api/voicemails/unread/count"] });
            window.dispatchEvent(new CustomEvent("new_voicemail", { detail: message.data }));
            break;

          case "voicemail_update":
            console.log("🎙️ Voicemail updated:", message.data);
            queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
            queryClient.invalidateQueries({ queryKey: ["/api/voicemails/unread/count"] });
            window.dispatchEvent(new CustomEvent("voicemail_update", { detail: message.data }));
            break;

          default:
            console.log("📨 Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("❌ Failed to parse WebSocket message:", error);
      }
    };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionError("WebSocket connection error occurred");
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
        setIsConnected(false);
        wsRef.current = null;
        
        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = undefined;
        }

        // Only attempt to reconnect if this wasn't an intentional disconnect
        if (!isIntentionalDisconnect.current && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = getReconnectDelay(
            reconnectAttempts.current, 
            wsConfig.reconnectOptions.baseDelay, 
            wsConfig.reconnectOptions.maxDelay
          );
          
          console.log(`🔄 Reconnecting in ${Math.round(delay)}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          setConnectionError(`Reconnecting in ${Math.round(delay / 1000)}s...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          const errorMsg = "Max reconnection attempts reached. Please refresh the page.";
          console.error(`❌ ${errorMsg}`);
          setConnectionError(errorMsg);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("❌ Failed to establish WebSocket connection:", error);
      setConnectionError("Failed to authenticate WebSocket connection");
      setIsConnected(false);
      
      // Retry connection with backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = getReconnectDelay(
          reconnectAttempts.current, 
          wsConfig.reconnectOptions.baseDelay, 
          wsConfig.reconnectOptions.maxDelay
        );
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    }
  }, [isAuthenticated, user?.id, getAccessTokenSilently, queryClient, wsConfig, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    console.log("🔌 Intentionally disconnecting WebSocket");
    isIntentionalDisconnect.current = true;
    
    // Clear all timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = undefined;
    }
    
    // Close WebSocket connection
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("⚠️ WebSocket not connected, cannot send message");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  return {
    isConnected,
    connectionError,
    sendMessage,
    connect,
    disconnect,
  };
}
