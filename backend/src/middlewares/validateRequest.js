const { ZodError } = require('zod');

/**
 * Higher-order function that generates an Express middleware
 * to validate the incoming request body against a Zod schema.
 * 
 * @param {import('zod').AnyZodObject} schema - The Zod schema to validate against
 * @returns {Function} Express middleware function
 */
exports.validateBody = (schema) => {
    return (req, res, next) => {
        try {
            // Parses the body. If the schema uses `.strip()`, it will remove unknown fields.
            // If it fails, it throws a ZodError.
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                // Format the Zod errors into a readable structure for the client
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                return res.status(400).json({
                    status: 'fail',
                    message: 'Invalid input data',
                    errors: formattedErrors
                });
            }
            // Pass any other unexpected errors to the global error handler
            next(error);
        }
    };
};
