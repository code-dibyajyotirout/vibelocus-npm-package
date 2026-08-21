import LZString from "lz-string";
import type { ChatMessage } from "../hooks/useLLM";

export interface Subtopic {
  title: string;
  description: string;
  estimated_minutes: number;
}

export interface CompactDrawerRecord {
  wing: string;
  room: string;
  drawer: string;
  compressedContent: string;
  rawSize: number;
  compressedSize: number;
  createdAt: number;
}

export interface ShareState {
  v: number; // Schema version
  topic: string;
  syllabus: Subtopic[];
  activeSubtopicTitle?: string;
  chatHistory?: ChatMessage[];
  drawers?: CompactDrawerRecord[];
}

/**
 * Encodes learning state into a compressed, URL-safe Base64 string fragment.
 */
export function encodeShareData(data: ShareState): string {
  const jsonString = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(jsonString);
  return compressed;
}

/**
 * Decodes a compressed URL-safe string fragment back into learning state.
 */
export function decodeShareData(encodedString: string): ShareState | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encodedString);
    if (!decompressed) return null;
    const parsed = JSON.parse(decompressed) as ShareState;
    if (!parsed || typeof parsed !== "object" || !parsed.topic || !Array.isArray(parsed.syllabus)) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Failed to decode share data from URL fragment:", err);
    return null;
  }
}

/**
 * Generates full shareable URL with fragment.
 */
export function generateShareUrl(data: ShareState): string {
  const fragment = encodeShareData(data);
  const baseUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${baseUrl}#share=${fragment}`;
}

/**
 * Parses share fragment from current URL hash if present.
 */
export function getShareDataFromUrl(): ShareState | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("#share=")) return null;
  const rawParam = hash.replace(/^#share=/, "");
  return decodeShareData(rawParam);
}
