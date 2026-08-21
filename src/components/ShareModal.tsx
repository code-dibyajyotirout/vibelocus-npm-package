import React, { useState, useEffect } from "react";
import { generateShareUrl } from "../utils/shareLink";
import type { ShareState, CompactDrawerRecord } from "../utils/shareLink";
import type { ChatMessage } from "../hooks/useLLM";
import type { DrawerRecord } from "../hooks/useIndexedDB";

interface Subtopic {
  title: string;
  description: string;
  estimated_minutes: number;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTopic: string;
  syllabus: Subtopic[];
  activeSubtopic: Subtopic | null;
  chatHistory: ChatMessage[];
  getAllDrawers: () => Promise<DrawerRecord[]>;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  currentTopic,
  syllabus,
  activeSubtopic,
  chatHistory,
  getAllDrawers,
}) => {
  const [includeChat, setIncludeChat] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [urlSizeBytes, setUrlSizeBytes] = useState(0);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentTopic || syllabus.length === 0) return;

    let isSubscribed = true;

    const buildUrl = async () => {
      setIsLoadingNotes(true);
      let compactDrawers: CompactDrawerRecord[] | undefined = undefined;

      if (includeNotes) {
        try {
          const allDrawers = await getAllDrawers();
          const topicDrawers = allDrawers.filter((d) => d.wing === currentTopic);
          compactDrawers = topicDrawers.map((d) => ({
            wing: d.wing,
            room: d.room,
            drawer: d.drawer,
            compressedContent: d.compressedContent,
            rawSize: d.rawSize,
            compressedSize: d.compressedSize,
            createdAt: d.createdAt,
          }));
        } catch (e) {
          console.error("Error gathering drawers for share link:", e);
        }
      }

      if (!isSubscribed) return;

      const stateToShare: ShareState = {
        v: 1,
        topic: currentTopic,
        syllabus,
        ...(activeSubtopic ? { activeSubtopicTitle: activeSubtopic.title } : {}),
        ...(includeChat && chatHistory.length > 0 ? { chatHistory } : {}),
        ...(includeNotes && compactDrawers && compactDrawers.length > 0
          ? { drawers: compactDrawers }
          : {}),
      };

      const url = generateShareUrl(stateToShare);
      setShareUrl(url);
      setUrlSizeBytes(new Blob([url]).size);
      setIsLoadingNotes(false);
    };

    buildUrl();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, currentTopic, syllabus, activeSubtopic, chatHistory, includeChat, includeNotes, getAllDrawers]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const isLarge = urlSizeBytes > 32 * 1024;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="card-glass"
        style={{
          maxWidth: "560px",
          width: "100%",
          padding: "28px",
          borderRadius: "16px",
          background: "var(--card-bg, #121826)",
          border: "1px solid var(--border-color, rgba(255,255,255,0.1))",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share &amp; Save Progress Link
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "1.4rem",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            &times;
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "20px" }}>
          Generate a self-contained compressed Base64 URL string. Anyone with this link can open your exact syllabus, chat progress, and memory notes instantly without requiring a server or database.
        </p>

        {/* Customization Options */}
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "20px" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "10px" }}>Include in Share Link:</div>
          
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.83rem", cursor: "pointer", marginBottom: "8px" }}>
            <input
              type="checkbox"
              checked={true}
              disabled
              style={{ accentColor: "var(--primary)" }}
            />
            <span>Syllabus &amp; Course Structure (Topic: <strong>{currentTopic}</strong>)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.83rem", cursor: "pointer", marginBottom: "8px" }}>
            <input
              type="checkbox"
              checked={includeChat}
              onChange={(e) => setIncludeChat(e.target.checked)}
              style={{ accentColor: "var(--primary)" }}
            />
            <span>Active Tutor Chat Dialogue ({chatHistory.length} messages)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.83rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              style={{ accentColor: "var(--primary)" }}
            />
            <span>Memory Hub Notes &amp; Saved Takeaways</span>
          </label>
        </div>

        {/* URL Output Box */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Shareable URL Link:</span>
            <span style={{ fontSize: "0.78rem", color: isLarge ? "#f59e0b" : "var(--secondary)", fontWeight: 600 }}>
              {isLoadingNotes ? "Generating..." : `Link Size: ${formatSize(urlSizeBytes)}`}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="input-text"
              style={{
                fontFamily: "monospace",
                fontSize: "0.8rem",
                flex: 1,
                background: "rgba(0,0,0,0.3)",
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="btn btn-primary"
              onClick={handleCopy}
              disabled={isLoadingNotes || !shareUrl}
              style={{
                minWidth: "120px",
                transition: "all 0.2s ease",
                background: isCopied ? "var(--secondary)" : undefined,
              }}
            >
              {isCopied ? "Copied!" : "Copy Link"}
            </button>
          </div>
          {isLarge && (
            <p style={{ fontSize: "0.76rem", color: "#f59e0b", marginTop: "8px", lineHeight: 1.3 }}>
              Note: This share link is over 32 KB. It works in all modern browsers, but unchecking extra items will shorten the URL for easier messaging.
            </p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
