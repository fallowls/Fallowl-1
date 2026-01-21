import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { users } from '../schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

export async function registerUser(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as any;

  if (!email || !password) {
    return reply.status(400).send({ error: 'Email and password are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const newUser = await db.insert(users).values({
      email,
      passwordHash: hashedPassword,
    }).returning();
    
    reply.status(201).send({ message: 'User created successfully', user: { id: newUser[0].id, email: newUser[0].email } });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
        return reply.status(409).send({ error: 'User with this email already exists' });
    }
    request.log.error(error, 'Error registering user');
    reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function loginUser(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as any;

  if (!email || !password) {
    return reply.status(400).send({ error: 'Email and password are required' });
  }

  const result = await db.select().from(users).where(eq(users.email, email));
  const user = result[0];

  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

  reply.send({ token });
}
