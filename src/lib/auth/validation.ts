import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  mode: z.enum(['login', 'signup']),
  fullName: z.string().trim().max(120, 'Use 120 characters or fewer.'),
  password: z.string().max(128, 'Use 128 characters or fewer.').default(''),
}).refine((values) => values.mode !== 'signup' || values.fullName.length > 0, {
  message: 'Enter your name.',
  path: ['fullName'],
}).refine((values) => values.mode !== 'signup' || values.password.length >= 12, {
  message: 'Choose a password with at least 12 characters.',
  path: ['password'],
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(120, 'Use 120 characters or fewer.'),
  phone: z.string().trim().max(30, 'Use 30 characters or fewer.')
    .refine((value) => !value || /^[+\d\s()\-]{3,30}$/.test(value), 'Enter a valid phone number.'),
});

export type AuthFormState = { status: 'idle' | 'success' | 'error'; message: string };
export const initialAuthState: AuthFormState = { status: 'idle', message: '' };