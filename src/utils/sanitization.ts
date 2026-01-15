/**
 * Sanitization utilities for user inputs
 */

/**
 * Sanitizes a user prompt to remove potentially harmful characters
 * and enforces length limits.
 * 
 * @param input The raw user input string
 * @param maxLength Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export const sanitizePrompt = (input: string, maxLength = 1000): string => {
    if (!input) return '';
    
    // Trim whitespace
    let sanitized = input.trim();
    
    // Remove potential control characters (keep basics like newline)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "");
    
    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
};
