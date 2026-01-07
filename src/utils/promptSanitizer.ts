/**
 * Sanitize prompt text to remove unwanted characters and formatting
 */
export const sanitizePrompt = (input: string): string => {
    if (!input) return '';

    // Remove special characters that might interfere with API calls
    // Keep alphanumeric, spaces, basic punctuation
    return input
        .replace(/[^\w\s.,?!'"-]/gi, '')
        .trim()
        .replace(/\s+/g, ' '); // Collapse multiple spaces
};
