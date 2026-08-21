/**
 * VibeLocus Security & Safeguards Utility
 * Implements client-side API key obfuscation and input sanitization to guard against XSS and memory sweeps.
 */

// Simple proprietary XOR key rotation obfuscation
const OBFUSCATION_KEY = 42;

/**
 * Encrypts/obfuscates a string before local storage entry
 */
export function obfuscate(text: string): string {
  if (!text) return "";
  try {
    const chars = Array.from(text).map((char) =>
      String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY)
    );
    const obfuscated = chars.join("");
    if (typeof window !== "undefined") {
      return window.btoa(unescape(encodeURIComponent(obfuscated)));
    }
    return Buffer.from(obfuscated, "utf-8").toString("base64");
  } catch (e) {
    console.error("Obfuscation error:", e);
    return text;
  }
}

/**
 * Decrypts/de-obfuscates an obfuscated string read from local storage
 */
export function deobfuscate(base64Text: string): string {
  if (!base64Text) return "";
  try {
    let decoded = "";
    if (typeof window !== "undefined") {
      decoded = decodeURIComponent(escape(window.atob(base64Text)));
    } else {
      decoded = Buffer.from(base64Text, "base64").toString("utf-8");
    }
    const chars = Array.from(decoded).map((char) =>
      String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY)
    );
    return chars.join("");
  } catch (e) {
    console.error("De-obfuscation error:", e);
    return base64Text;
  }
}

/**
 * Sanitizes input text to prevent XSS script injection
 */
export function sanitizeInput(text: string): string {
  if (!text) return "";
  // Strip script tags and dangerous HTML structures
  let cleaned = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // remove handlers like onclick, onload
    .replace(/javascript:[^"']*/gi, ""); // remove javascript: links
  return cleaned;
}

/**
 * Sanitizes uploaded file names to prevent directory traversal or script uploads
 */
export function sanitizeFileName(name: string): string {
  if (!name) return "unnamed_document";
  // Remove spaces, keep letters, numbers, dots, and hyphens
  let cleanName = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  // Limit length
  if (cleanName.length > 100) {
    const parts = cleanName.split(".");
    const ext = parts.pop() || "";
    cleanName = parts.join(".").substring(0, 90) + "." + ext;
  }
  return cleanName;
}
