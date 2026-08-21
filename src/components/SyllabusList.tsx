import React, { useState, useRef, useEffect } from "react";
import { sanitizeFileName } from "../utils/security";

interface Subtopic {
  title: string;
  description: string;
  estimated_minutes: number;
}

interface HistoryItem {
  wing: string;
  roomsCount: number;
  notesCount: number;
}

interface SyllabusListProps {
  currentTopic: string;
  syllabus: Subtopic[];
  activeSubtopic: Subtopic | null;
  onSelectSubtopic: (subtopic: Subtopic) => void;
  onGenerateSyllabus: (topic: string) => Promise<void>;
  onGenerateSyllabusFromDocument: (text: string, fileName: string) => Promise<void>;
  learningHistory: HistoryItem[];
  onResumeTopic: (wing: string) => Promise<void>;
  onExportEpub: () => Promise<void>;
  onExportPdf: () => Promise<void>;
  isGenerating: boolean;
  isExportingEpub: boolean;
  isExportingPdf: boolean;
  onCancelSyllabus?: () => void;
  onOpenShareModal?: () => void;
  isFallbackSyllabus?: boolean;
  syllabusError?: string | null;
}

export const SyllabusList: React.FC<SyllabusListProps> = ({
  currentTopic,
  syllabus,
  activeSubtopic,
  onSelectSubtopic,
  onGenerateSyllabus,
  onGenerateSyllabusFromDocument,
  learningHistory,
  onResumeTopic,
  onExportEpub,
  onExportPdf,
  isGenerating,
  isExportingEpub,
  isExportingPdf,
  onCancelSyllabus,
  onOpenShareModal,
  isFallbackSyllabus,
  syllabusError,
}) => {
  const [topicInput, setTopicInput] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Document Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadFileSize, setUploadFileSize] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleGenerate = () => {
    const topic = topicInput.trim();
    if (!topic) {
      alert("Please enter a topic to create a syllabus.");
      return;
    }
    onGenerateSyllabus(topic);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleGenerate();
    }
  };

  // Helper formatting utility
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // PDF.js Text Extractor
  const extractTextFromPDF = async (file: File): Promise<string> => {
    setProgressText("Loading PDF engine...");
    const pdfjsLib = await import(
      /* webpackIgnore: true */
      // @ts-ignore
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    let fullText = "";
    for (let i = 1; i <= totalPages; i++) {
      if (i % 5 === 0 || i === 1 || i === totalPages) {
        setProgressText(`Extracting text... page ${i} of ${totalPages}`);
      }
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // @ts-ignore
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(" ") + "\n\n";
    }
    return fullText.trim();
  };

  // Mammoth DOCX Text Extractor
  const extractTextFromDOCX = async (file: File): Promise<string> => {
    setProgressText("Parsing DOCX...");
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const mammothLib = mammoth.default || mammoth;
    const result = await mammothLib.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 200 MB limit
    if (file.size > 200 * 1024 * 1024) {
      alert(`File is too large (${formatBytes(file.size)}). Maximum allowed is 200 MB.`);
      return;
    }

    const sanitizedName = sanitizeFileName(file.name);
    setUploadFileName(sanitizedName);
    setUploadFileSize(formatBytes(file.size));
    setIsUploading(true);
    setProgressText("Reading file...");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let extractedText = "";

      if (ext === "pdf") {
        extractedText = await extractTextFromPDF(file);
      } else if (ext === "docx") {
        extractedText = await extractTextFromDOCX(file);
      } else {
        // Plain text (TXT, MD)
        extractedText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read text file"));
          reader.readAsText(file);
        });
      }

      if (!extractedText || extractedText.trim().length < 50) {
        throw new Error("Could not extract enough text from the document. Try a different file.");
      }

      setProgressText("Generating syllabus from document...");
      await onGenerateSyllabusFromDocument(extractedText, sanitizedName);
    } catch (err: any) {
      console.error("Document upload failed:", err);
      alert(`Upload failed: ${err.message}`);
      clearUpload();
    } finally {
      setIsUploading(false);
    }
  };

  const clearUpload = () => {
    setUploadFileName(null);
    setUploadFileSize(null);
    setProgressText("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="learn-left card-glass">
      <div className="input-group">
        <label htmlFor="input-main-topic">What do you want to learn today?</label>
        <div className="flex-row">
          <input
            type="text"
            id="input-main-topic"
            placeholder="e.g., Quantum Computing, React Hooks, Jazz Theory"
            className="input-text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={handleKeyPress}
          />
          <button
            className="btn btn-primary"
            id="btn-generate-syllabus"
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <span>Generating...</span>
            ) : (
              <span>Generate Syllabus</span>
            )}
          </button>
          {isGenerating && onCancelSyllabus && (
            <button
              className="btn btn-danger"
              id="btn-cancel-syllabus"
              onClick={onCancelSyllabus}
              style={{ marginLeft: "8px", background: "#ef4444", color: "#fff" }}
            >
              Cancel
            </button>
          )}
        </div>

        <div className="upload-section">
          <div className="upload-divider">
            <span>or learn from a document</span>
          </div>

          {!uploadFileName && !isUploading && (
            <button
              className="btn btn-outline btn-upload-doc"
              id="btn-upload-document"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload PDF, TXT, DOCX, or Markdown</span>
            </button>
          )}

          <input
            type="file"
            id="file-upload-input"
            ref={fileInputRef}
            className="hidden"
            accept=".txt,.md,.pdf,.docx"
            onChange={handleFileChange}
          />

          {uploadFileName && (
            <div className="upload-file-info" id="upload-file-info">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--secondary)"
                strokeWidth="2.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span id="upload-file-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>
                {uploadFileName}
              </span>
              <span className="upload-file-size" id="upload-file-size">
                {uploadFileSize}
              </span>
              {!isUploading && (
                <button className="btn-upload-clear" id="btn-clear-upload" onClick={clearUpload} title="Remove file">
                  &times;
                </button>
              )}
            </div>
          )}

          {isUploading && (
            <div className="upload-progress" id="upload-progress">
              <div className="skeleton-text" style={{ width: "60%", height: "8px", margin: "0" }}></div>
              <div className="flex-row" style={{ justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: "8px" }}>
                <span id="upload-progress-text">{progressText}</span>
                {isGenerating && onCancelSyllabus && (
                  <button
                    className="btn btn-sm"
                    id="btn-cancel-doc-syllabus"
                    onClick={() => {
                      onCancelSyllabus();
                      clearUpload();
                    }}
                    style={{ background: "#ef4444", color: "#fff", padding: "4px 8px", fontSize: "0.72rem", border: "none", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Learning History Panel */}
      {learningHistory.length > 0 && (
        <div
          className="history-container card-glass"
          id="learning-history-wrapper"
          style={{ marginTop: "16px", padding: "16px", borderRadius: "8px" }}
        >
          <h4
            style={{
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Learning History
          </h4>
          <div
            id="learning-history-list"
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            {learningHistory.map((item, idx) => (
              <div
                key={idx}
                className="history-item card-glass"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                  marginBottom: "4px",
                }}
                onClick={() => onResumeTopic(item.wing)}
              >
                <div style={{ flex: 1 }} className="history-item-info">
                  <strong
                    style={{
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                      display: "block",
                      textShadow: "0 0 10px rgba(255,255,255,0.05)",
                    }}
                  >
                    {item.wing}
                  </strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {item.roomsCount} subtopics • {item.notesCount} memories saved
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-outline btn-resume-history"
                  style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResumeTopic(item.wing);
                  }}
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Syllabus Card Grid */}
      {syllabus.length > 0 ? (
        <div className="syllabus-container" id="syllabus-wrapper">
          <div className="syllabus-header">
            <h3 id="syllabus-topic-title">Topic: {currentTopic}</h3>
            <div className="syllabus-header-actions">
              <span className="syllabus-count" id="syllabus-count-tag">
                {syllabus.length} sub-topics
              </span>
              <button
                className="btn btn-sm btn-export"
                id="btn-share-link"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  borderColor: "rgba(16, 185, 129, 0.4)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={onOpenShareModal}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share Progress Link
              </button>

              <div className="export-dropdown" id="export-dropdown-wrapper" ref={dropdownRef}>
                <button
                  className="btn btn-sm btn-export"
                  id="btn-export-course"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  Export eBook
                </button>

                <div className={`export-menu ${isMenuOpen ? "" : "hidden"}`} id="export-menu">
                  <button
                    className="export-option"
                    id="btn-export-epub"
                    disabled={isExportingEpub}
                    onClick={() => {
                      setIsMenuOpen(false);
                      onExportEpub();
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    {isExportingEpub ? "Exporting EPUB..." : "Download EPUB"}
                  </button>
                  <button
                    className="export-option"
                    id="btn-export-pdf"
                    disabled={isExportingPdf}
                    onClick={() => {
                      setIsMenuOpen(false);
                      onExportPdf();
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {isExportingPdf ? "Exporting PDF..." : "Download PDF"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="syllabus-list" id="syllabus-list-container">
            {isFallbackSyllabus && (
              <div
                className="fallback-warning"
                id="fallback-syllabus-warning"
                style={{
                  background: "linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(234, 179, 8, 0.04))",
                  border: "1px solid rgba(234, 179, 8, 0.35)",
                  borderRadius: "10px",
                  padding: "14px 18px",
                  marginBottom: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <strong style={{ color: "#eab308", fontSize: "0.85rem" }}>Placeholder Syllabus</strong>
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: 0, lineHeight: 1.5 }}>
                  AI generation failed{syllabusError ? `: ${syllabusError}` : "."} These are generic placeholder subtopics. Check your AI provider settings and retry for a tailored syllabus.
                </p>
                <button
                  className="btn btn-sm"
                  id="btn-retry-syllabus"
                  onClick={() => onGenerateSyllabus(currentTopic)}
                  disabled={isGenerating}
                  style={{
                    alignSelf: "flex-start",
                    background: "rgba(234, 179, 8, 0.2)",
                    border: "1px solid rgba(234, 179, 8, 0.5)",
                    color: "#eab308",
                    padding: "6px 14px",
                    fontSize: "0.78rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {isGenerating ? "Retrying..." : "Retry with AI"}
                </button>
              </div>
            )}
            {syllabus.map((sub, idx) => {
              const isActive = activeSubtopic?.title === sub.title;
              return (
                <div
                  key={idx}
                  className={`subtopic-card ${isActive ? "active" : ""}`}
                  onClick={() => onSelectSubtopic(sub)}
                >
                  <div className="subtopic-meta">
                    <span className="subtopic-title">{sub.title}</span>
                    <span className="subtopic-duration">{sub.estimated_minutes} min</span>
                  </div>
                  <p className="subtopic-desc">{sub.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        isGenerating ? (
          <div className="syllabus-container">
            <div className="syllabus-list">
              <div className="subtopic-card skeleton">
                <div className="skeleton-text" style={{ width: "50%" }}></div>
                <div className="skeleton-text short"></div>
              </div>
              <div className="subtopic-card skeleton">
                <div className="skeleton-text" style={{ width: "40%" }}></div>
                <div className="skeleton-text short"></div>
              </div>
              <div className="subtopic-card skeleton">
                <div className="skeleton-text" style={{ width: "60%" }}></div>
                <div className="skeleton-text short"></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome-syllabus-msg" id="syllabus-empty-state">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <p>Generate a syllabus to begin your spatial learning journey.</p>
          </div>
        )
      )}
    </div>
  );
};
