import { db } from "../db";
import { auditLogs } from "@shared/schema";

export enum SecurityEventSeverity {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  CRITICAL = "critical"
}

export enum SecurityEventType {
  SECURITY_ALERT = "security_alert",
  ACCESS_DENIED = "access_denied",
  CONFIG_CHANGE = "config_change"
}

export interface SecurityEventOptions {
  tenantId?: number;
  userId?: number;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  action: string;
  resource?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logSecurityEvent(options: SecurityEventOptions) {
  try {
    await db.insert(auditLogs).values({
      tenantId: options.tenantId,
      userId: options.userId,
      eventType: options.eventType,
      severity: options.severity,
      action: options.action,
      resource: options.resource,
      details: options.details || {},
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
    
    // Also log to console for immediate visibility in development
    const logMethod = options.severity === SecurityEventSeverity.CRITICAL || options.severity === SecurityEventSeverity.ERROR 
      ? "error" 
      : options.severity === SecurityEventSeverity.WARN 
        ? "warn" 
        : "log";
    
    console[logMethod](`[AUDIT][${options.severity.toUpperCase()}] ${options.action}${options.tenantId ? ` | Tenant: ${options.tenantId}` : ''}`);
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}
