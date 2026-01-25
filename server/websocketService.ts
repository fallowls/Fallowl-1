import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { parse } from "url";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

interface WebSocketClient extends WebSocket {
  userId?: number;
  isAlive?: boolean;
}

interface DecodedToken {
  sub: string;
  [key: string]: any;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<WebSocketClient>> = new Map();
  private jwksClient: jwksClient.JwksClient | null = null;

  initialize(server: Server) {
    this.jwksClient = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
    });

    this.wss = new WebSocketServer({ 
      server,
      path: "/ws",
      handleProtocols: (protocols) => {
        // Find the auth protocol and return it
        const authProtocol = Array.from(protocols).find(p => p.startsWith('auth-'));
        return authProtocol || false;
      },
      verifyClient: async (info, callback) => {
        try {
          const authHeader = info.req.headers['authorization'];
          const protocol = info.req.headers['sec-websocket-protocol'];
          
          let token: string | null = null;
          
          if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          } else if (protocol) {
            const protocols = protocol.split(',').map(p => p.trim());
            for (const proto of protocols) {
              if (proto.startsWith('auth-')) {
                token = proto.substring(5);
                break;
              }
            }
          }

          if (!token) {
            console.log("❌ No token provided in WebSocket connection");
            console.log("Headers:", JSON.stringify(info.req.headers));
            callback(false, 401, "Authentication required");
            return;
          }

          const decoded = await this.verifyToken(token);
          if (!decoded) {
            console.log("❌ Invalid token");
            console.log("Token:", token);
            callback(false, 401, "Invalid token");
            return;
          }

          const auth0UserId = decoded.sub;
          let user = await storage.getUserByAuth0Id(auth0UserId);

          if (!user) {
            console.log("❌ User not found for Auth0 ID:", auth0UserId);
            callback(false, 401, "User not found");
            return;
          }

          (info.req as any).userId = user.id;
          callback(true);
        } catch (error) {
          console.error("❌ WebSocket authentication error:", error);
          callback(false, 500, "Authentication failed");
        }
      }
    });

    this.wss.on("connection", async (ws: WebSocketClient, request: any) => {
      console.log("🔌 New WebSocket connection");

      try {
        const userId = request.userId;
        
        if (!userId) {
          console.log("❌ No userId found on request");
          ws.close(1008, "Authentication failed");
          return;
        }

        ws.userId = userId;
        if (!this.clients.has(userId)) {
          this.clients.set(userId, new Set());
        }
        this.clients.get(userId)?.add(ws);
        console.log(`✅ WebSocket client registered for user ${userId}`);

        ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Received WebSocket message:", message);
          
          if (message.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        if (ws.userId) {
          const userClients = this.clients.get(ws.userId);
          if (userClients) {
            userClients.delete(ws);
            if (userClients.size === 0) {
              this.clients.delete(ws.userId);
            }
          }
          console.log(`🔌 WebSocket client disconnected for user ${ws.userId}`);
        }
      });

      ws.on("error", (error) => {
        console.error("❌ WebSocket error:", error);
      });

        ws.send(JSON.stringify({ type: "connected", message: "WebSocket connection established" }));
      } catch (error) {
        console.error("❌ WebSocket authentication error:", error);
        ws.close(1011, "Authentication failed");
      }
    });

    const interval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on("close", () => {
      clearInterval(interval);
    });

    console.log("✅ WebSocket server initialized on path /ws");
  }

  private async verifyToken(token: string): Promise<DecodedToken | null> {
    try {
      if (!this.jwksClient) {
        console.error("❌ JWKS client not initialized");
        return null;
      }

      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string' || !decodedHeader.header) {
        console.error("❌ Failed to decode JWT header");
        return null;
      }

      const kid = decodedHeader.header.kid;
      if (!kid) {
        console.error("❌ No kid in JWT header");
        return null;
      }

      const key = await this.jwksClient.getSigningKey(kid);
      const signingKey = key.getPublicKey();

      const decoded = jwt.verify(token, signingKey, {
        audience: process.env.AUTH0_AUDIENCE,
        issuer: `https://${process.env.AUTH0_DOMAIN}/`,
        algorithms: ['RS256']
      }) as DecodedToken;

      return decoded;
    } catch (error) {
      console.error("❌ Token verification failed:", error);
      return null;
    }
  }

  broadcastToUser(userId: number, event: string, data: any) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const message = JSON.stringify({ type: event, data });
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
      console.log(`📤 Broadcast "${event}" to ${userClients.size} client(s) for user ${userId}`);
    }
  }

  broadcastNewCall(userId: number, callData: any) {
    this.broadcastToUser(userId, "new_call", callData);
  }

  broadcastCallUpdate(userId: number, callData: any) {
    this.broadcastToUser(userId, "call_update", callData);
  }

  broadcastNewRecording(userId: number, recordingData: any) {
    this.broadcastToUser(userId, "new_recording", recordingData);
  }

  broadcastRecordingUpdate(userId: number, recordingData: any) {
    this.broadcastToUser(userId, "recording_update", recordingData);
  }

  broadcastParallelCallStarted(userId: number, eventData: any) {
    this.broadcastToUser(userId, "parallel_call_started", eventData);
  }

  broadcastParallelCallStatus(userId: number, eventData: any) {
    this.broadcastToUser(userId, "parallel_call_status", eventData);
  }

  broadcastParallelCallConnected(userId: number, eventData: any) {
    this.broadcastToUser(userId, "parallel_call_connected", eventData);
  }

  broadcastParallelCallEnded(userId: number, eventData: any) {
    this.broadcastToUser(userId, "parallel_call_ended", eventData);
  }

  broadcastImportProgress(userId: number, progressData: any) {
    this.broadcastToUser(userId, "import_progress", progressData);
  }

  broadcastImportComplete(userId: number, resultData: any) {
    this.broadcastToUser(userId, "import_complete", resultData);
  }

  broadcastImportError(userId: number, errorData: any) {
    this.broadcastToUser(userId, "import_error", errorData);
  }

  broadcastNewSms(userId: number, smsData: any) {
    this.broadcastToUser(userId, "new_sms", smsData);
  }

  broadcastSmsStatusUpdate(userId: number, smsData: any) {
    this.broadcastToUser(userId, "sms_status_update", smsData);
  }

  broadcastIncomingSms(userId: number, smsData: any) {
    this.broadcastToUser(userId, "incoming_sms", smsData);
  }

  broadcastSmsDelivered(userId: number, smsData: any) {
    this.broadcastToUser(userId, "sms_delivered", smsData);
  }

  broadcastSmsFailed(userId: number, smsData: any) {
    this.broadcastToUser(userId, "sms_failed", smsData);
  }

  broadcastNewVoicemail(userId: number, voicemailData: any) {
    this.broadcastToUser(userId, "new_voicemail", voicemailData);
  }

  broadcastVoicemailUpdate(userId: number, voicemailData: any) {
    this.broadcastToUser(userId, "voicemail_update", voicemailData);
  }
}

export const wsService = new WebSocketService();
