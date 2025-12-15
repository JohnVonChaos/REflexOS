

import type { GeneratedFile } from '../types';

const langExtensions: Record<string, string> = {
    rust: 'rs',
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    html: 'html',
    css: 'css',
    json: 'json',
    text: 'txt',
    markdown: 'md',
    // shell extensions are omitted intentionally
};

// Languages to ignore when parsing for files.
const IGNORED_LANGUAGES = new Set(['bash', 'sh', 'shell', '']);

// This regex finds all fenced code blocks. It's designed to be simple and robust.
// It captures: 1. The info string (everything after ```) and 2. The code content.
const blockRegex = /```(.*)\n([\s\S]*?)```/g;

// This regex specifically looks for a filename in a comment, trimming whitespace.
// e.g., // path/to/file.rs or # path/to/file.py
const filenameRegex = /(?:\/\/|#)\s*([\w\/.-]+)/;

/**
 * Extracts all fenced code blocks from a markdown string, ignoring shell scripts.
 * It intelligently finds a filename, whether it's on the same line as the language
 * specifier or on the first line of the code block itself.
 * @param text The raw markdown text from a model's response.
 * @returns An array of GeneratedFile objects.
 */
export function extractCodeBlocksFromText(text: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const names = new Set<string>(); // Used to prevent duplicate file names from the same response
    let match;
    let fileIndex = 1;
    blockRegex.lastIndex = 0; // Reset for global regex

    while ((match = blockRegex.exec(text)) !== null) {
        const infoString = (match[1] || '').trim();
        let content = match[2];
        let filename: string | undefined;

        // Extract the language, cleaning it up.
        const language = infoString.split(/\s/)[0].toLowerCase();
        
        // --- Step 1: Ignore shell scripts ---
        if (IGNORED_LANGUAGES.has(language)) {
            continue;
        }

        // --- Step 2: Extract filename ---
        // Attempt to find it on the same line as the fence (e.g., ```rust // main.rs)
        const infoMatch = infoString.match(filenameRegex);
        if (infoMatch && infoMatch[1]) {
            filename = infoMatch[1].trim();
        }

        // If not found, check the first line of the code content.
        if (!filename) {
            const firstLineMatch = content.match(/^(\s*(?:\/\/|#)\s*([\w\/.-]+)\s*\n?)/);
            if (firstLineMatch && firstLineMatch[2]) {
                filename = firstLineMatch[2].trim();
                // If found, strip this line from the actual code content.
                content = content.substring(firstLineMatch[0].length);
            }
        }
        
        // --- Step 3: Finalize and add file ---
        const finalName = filename || `generated_file_${fileIndex++}.${langExtensions[language] || 'txt'}`;
        
        // Prevent adding files with the same name twice from one text block.
        if (names.has(finalName)) {
            continue;
        }

        names.add(finalName);
        files.push({ 
            name: finalName, 
            content: content.trim(), 
            language,
            // FIX: Add missing 'createdAt' property to satisfy the GeneratedFile type.
            createdAt: Date.now(),
        });
    }
    return files;
}
