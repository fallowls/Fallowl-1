import type { User } from "@shared/schema";

export interface SanitizedUser {
  id: number;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatar?: string | null;
  role: string;
  status: string;
  emailVerified: boolean | null;
  twoFactorEnabled?: boolean | null;
  accountType?: string | null;
  subscriptionPlan?: string | null;
  twilioConfigured?: boolean | null;
  createdAt?: Date | string | null;
  lastLogin?: Date | string | null;
}

export function sanitizeUser(user: User): SanitizedUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ? maskPhoneNumber(user.phone) : null,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    accountType: user.accountType,
    subscriptionPlan: user.subscriptionPlan,
    twilioConfigured: user.twilioConfigured,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin
  };
}

export function sanitizeUsers(users: User[]): SanitizedUser[] {
  return users.map(sanitizeUser);
}

export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) {
    return phone;
  }
  
  const lastFour = phone.slice(-4);
  const masked = phone.slice(0, -4).replace(/\d/g, '*');
  return `${masked}${lastFour}`;
}

export function maskEmail(email: string): string {
  if (!email) return email;
  
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  
  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  }
  
  const visiblePart = localPart.slice(0, 2);
  const maskedPart = '*'.repeat(Math.min(localPart.length - 2, 5));
  return `${visiblePart}${maskedPart}@${domain}`;
}

export function redactSensitiveData(data: any): any {
  if (!data) return data;
  
  const sensitiveKeys = [
    'password',
    'authToken',
    'apiKeySecret',
    'apiKey',
    'secret',
    'token',
    'accessToken',
    'refreshToken',
    'auth0Id'
  ];
  
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }
  
  if (typeof data === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(sensitiveKey => 
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      )) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        redacted[key] = redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }
  
  return data;
}
