import { storage } from "../storage";
import { InsertUser } from "@shared/schema";
import { NotFoundError } from "../utils/errors";

export class UserService {
  async getAllUsers() {
    return await storage.getAllUsers();
  }

  async createUser(userData: InsertUser) {
    return await storage.createUser(userData);
  }

  async updateUser(userId: number, userData: Partial<InsertUser>) {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }
    return await storage.updateUser(userId, userData);
  }

  async deleteUser(userId: number) {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }
    await storage.deleteUser(userId);
  }

  async searchUsers(query: string) {
    return await storage.searchUsers(query);
  }

  async bulkUpdateUsers(userIds: number[], updates: Partial<InsertUser>) {
    return await storage.bulkUpdateUsers(userIds, updates);
  }

  async getUserActivity(userId: number, limit?: number) {
    return await storage.getUserActivity(userId, limit);
  }

  async getLoginHistory(userId: number, limit?: number) {
    return await storage.getLoginHistory(userId, limit);
  }

  async getInvoicesByUser(userId: number) {
    return await storage.getInvoicesByUser(userId);
  }
}

export const userService = new UserService();
