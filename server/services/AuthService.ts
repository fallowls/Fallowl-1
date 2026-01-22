import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { UnauthorizedError, ConflictError, BadRequestError } from "../utils/errors";
import { InsertUser } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

export class AuthService {
  async login(email: string, password: string) {
    const user = await storage.authenticateUser(email, password);
    
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = jwt.sign(
      { 
        userId: user.id,
        role: user.role,
        username: user.username
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    };
  }

  async signup(userData: { email: string; password: string; fullName: string }) {
    const existingUser = await storage.getUserByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError("User already exists");
    }

    const [firstName, ...lastNameParts] = userData.fullName.split(' ');
    const lastName = lastNameParts.join(' ') || '';

    const user = await storage.createUserWithTenant({
      email: userData.email,
      password: userData.password,
      username: userData.email.split('@')[0],
      firstName,
      lastName,
      role: 'user',
      status: 'active'
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    };
  }

  async checkEmail(email: string) {
    const user = await storage.getUserByEmail(email);
    return { exists: !!user };
  }
}

export const authService = new AuthService();
