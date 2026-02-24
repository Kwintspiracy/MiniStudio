/**
 * Sanitization utilities for user inputs
 */

/**
 * Sanitizes a user prompt to remove potentially harmful characters,
 * injection patterns, and enforces length limits.
 *
 * Aligned with the stricter sketch/sculpt sanitizer in promptSanitizer.ts.
 *
 * @param input The raw user input string
 * @param maxLength Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export const sanitizePrompt = (input: string, maxLength = 1000): string => {
    if (!input) return '';

    let sanitized = input.trim();

    // Strip bracket patterns and backticks (common injection wrappers)
    sanitized = sanitized.replace(/[\[\]{}<>`]/g, '');

    // Strip lines that look like injection markers
    sanitized = sanitized
        .split('\n')
        .filter(line => !/^\s*(#|SYSTEM\s*:|IGNORE|OVERRIDE)/i.test(line))
        .join('\n');

    // Keep only safe characters: letters, numbers, basic punctuation, spaces, newlines
    sanitized = sanitized.replace(/[^\w\s.,?!'"\-\n]/g, '');

    // Collapse multiple spaces (preserve single newlines)
    sanitized = sanitized.replace(/[ \t]+/g, ' ');

    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized.trim();
};
