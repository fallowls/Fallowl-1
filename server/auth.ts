import bcrypt from "bcryptjs";

/**
 * Hashes a plain text password using bcrypt.
 * @param password The plain text password to hash
 * @returns A promise that resolves to the hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies a plain text password against a hashed password.
 * @param password The plain text password to verify
 * @param hashed The hashed password to compare against
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}
