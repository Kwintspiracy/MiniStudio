const DANGEROUS_PATTERNS = [
    /ignore previous instructions/gi,
    /disregard.*instructions/gi,
    /system prompt/gi,
    /\[INST\]/gi,
    /<\|.*\|>/g,
];

export function sanitizePrompt(input: string): string {
    if (!input) return '';

    let sanitized = input;
    for (const pattern of DANGEROUS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
    }

    // Also limit length to prevent massive context injection attempts
    return sanitized.slice(0, 2000);
}
