const { z } = require('zod');

// Schema for User Signup
exports.signupSchema = z.object({
    email: z.string({ required_error: 'Email is required' })
        .email('Invalid email address format')
        .toLowerCase()
        .trim(),

    password: z.string({ required_error: 'Password is required' })
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[@$!%*?&_]/, 'Password must contain at least one special character (@, $, !, %, *, ?, &, _)'),

    full_name: z.string({ required_error: 'Full name is required' })
        .min(2, 'Name must be at least 2 characters long')
        .max(50, 'Name cannot exceed 50 characters')
        .trim()
}).strict(); // Reject any unknown fields not defined above

// Schema for User Login
exports.loginSchema = z.object({
    email: z.string({ required_error: 'Email is required' })
        .email('Invalid email address format')
        .toLowerCase()
        .trim(),

    password: z.string({ required_error: 'Password is required' })
        .min(1, 'Password is required')
}).strict();
