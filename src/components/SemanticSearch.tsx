import React, { useState } from "react";
import LZString from "lz-string";
import type { DrawerRecord } from "../hooks/useIndexedDB";

interface SemanticSearchProps {
  isModelReady: boolean;
  drawers: DrawerRecord[];
  onComputeEmbedding: (text: string) => Promise<number[] | null>;
  onDeleteDrawer: (id: number) => Promise<boolean>;
  onResumeSessionFromDrawer: (drawer: DrawerRecord) => Promise<void>;
  isModelLoading?: boolean;
  modelLoadProgress?: number;
  onLoadModel?: () => void;
}

export const SemanticSearch: React.FC<SemanticSearchProps> = ({
  isModelReady,
  drawers,
  onComputeEmbedding,
  onDeleteDrawer,
  onResumeSessionFromDrawer,
  isModelLoading = false,
  modelLoadProgress = 0,
  onLoadModel,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Array<DrawerRecord & { matchScore: number }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDrawer, setSelectedDrawer] = useState<DrawerRecord | null>(null);

  // Decompress helper
  const decompress = (comp: string) => {
    return LZString.decompressFromUTF16(comp) || "";
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Vector Cosine Similarity
  const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const handleSearch = async () => {
    const searchVal = query.trim();
    if (!searchVal) {
      alert("Please type a search query.");
      return;
    }

    if (!isModelReady) {
      alert("Please activate the Memory AI Core in the sidebar before searching.");
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const queryEmbedding = await onComputeEmbedding(searchVal);

      if (!queryEmbedding) {
        throw new Error("Could not generate vector embedding for query.");
      }

      if (drawers.length === 0) {
        setResults([]);
        return;
      }

      // Compute similarity score for all drawers
      const scored = drawers
        .map((d) => {
          const score = d.embedding ? cosineSimilarity(queryEmbedding, d.embedding) : 0;
          return { ...d, matchScore: score };
        })
        .filter((d) => d.matchScore > 0.35); // Keep moderate matches, sort descending

      scored.sort((a, b) => b.matchScore - a.matchScore);
      setResults(scored);
    } catch (e: any) {
      console.error(e);
      alert(`Search error: ${e.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleDeleteClick = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete drawer: "${name}"?`)) {
      await onDeleteDrawer(id);
      setSelectedDrawer(null);
      // Remove from search results as well
      setResults((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // Render modal content helpers
  let modalDecompressedContent = "";
  let modalConversationLog: Array<{ role: string; content: string }> = [];
  let isTranscript = false;

  if (selectedDrawer) {
    try {
      modalDecompressedContent = decompress(selectedDrawer.compressedContent);
      if (selectedDrawer.drawer === "Conversation Transcript") {
        modalConversationLog = JSON.parse(modalDecompressedContent);
        isTranscript = true;
      }
    } catch (e) {
      console.error("Failed to parse drawer contents", e);
    }
  }

  return (
    <section className="tab-panel active" id="panel-search">
      <header className="section-header">
        <h1>Semantic Intelligence Search</h1>
        <p>Compare local query embeddings against your Memory Palace notes using cosine similarity.</p>
      </header>

      <div className="search-layout">
        <div className="search-box-card card-glass">
          <div className="input-group">
            <label htmlFor="input-search-query">Search memory via meaning (concepts, associations)</label>
            <div className="flex-row">
              <input
                type="text"
                id="input-search-query"
                placeholder="e.g., state updates, qubit superposition, javascript libraries"
                className="input-text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isSearching}
              />
              <button
                className="btn btn-primary"
                id="btn-search-palace"
                disabled={isSearching || !query.trim()}
                onClick={handleSearch}
              >
                <span>{isSearching ? "Searching..." : "Semantic Search"}</span>
              </button>
            </div>
          </div>

          {!isModelReady && (
            <div
              id="search-model-warning"
              className="search-warning-msg"
              style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}
            >
              <span>Activate the Memory AI Core to run semantic similarity searches.</span>
              {onLoadModel && (
                <div style={{ width: "100%", marginTop: "6px" }}>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={isModelLoading}
                    onClick={onLoadModel}
                    style={{ alignSelf: "flex-start", marginBottom: "8px" }}
                  >
                    {isModelLoading ? `Activating... (${modelLoadProgress}%)` : "Activate Memory AI Core"}
                  </button>
                  {isModelLoading && (
                    <div className="progress-bar-container" style={{ maxWidth: "250px" }}>
                      <div className="progress-bar-fill" style={{ width: `${modelLoadProgress}%` }}></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="search-results-wrapper card-glass">
          <h3>Match Results</h3>
          <div className="search-results-list" id="search-results-container">
            {isSearching ? (
              <div className="search-empty-state skeleton">
                Searching through local database nodes...
              </div>
            ) : results.length > 0 ? (
              results.map((d, idx) => {
                const rawBody = decompress(d.compressedContent);
                let previewText = "";

                if (d.drawer === "Conversation Transcript") {
                  try {
                    const parsed = JSON.parse(rawBody);
                    const lines = parsed.map(
                      (m: any) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`
                    );
                    const fullDiag = lines.join("\n");
                    previewText =
                      fullDiag.length > 120 ? fullDiag.substring(0, 120) + "..." : fullDiag;
                  } catch {
                    previewText = rawBody.length > 120 ? rawBody.substring(0, 120) + "..." : rawBody;
                  }
                } else {
                  previewText = rawBody.length > 120 ? rawBody.substring(0, 120) + "..." : rawBody;
                }

                const matchPercent = Math.round(d.matchScore * 100);

                return (
                  <div
                    key={idx}
                    className="search-match-card"
                    onClick={() => setSelectedDrawer(d)}
                  >
                    <div className="search-match-main">
                      <span className="search-match-title">{d.drawer}</span>
                      <span className="search-match-path">
                        {d.wing} &gt; {d.room}
                      </span>
                      <p className="search-match-preview" style={{ marginTop: "6px" }}>
                        {previewText}
                      </p>
                    </div>
                    <div className="search-score-badge">{matchPercent}% Match</div>
                  </div>
                );
              })
            ) : hasSearched ? (
              <div className="search-empty-state">
                No matching memory cards found. Try a different concept or broaden your keywords.
              </div>
            ) : (
              <div className="search-empty-state">
                Enter a query to match concepts by conceptual similarity, not just exact keywords.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spatial Drawer Modal inside Search Tab for detailed view */}
      {selectedDrawer && (
        <div
          className="modal-overlay"
          id="drawer-modal"
          onClick={() => setSelectedDrawer(null)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-path" id="modal-drawer-path">
                  {selectedDrawer.wing} &gt; {selectedDrawer.room}
                </span>
                <h2 id="modal-drawer-title">{selectedDrawer.drawer}</h2>
              </div>
              <button
                className="btn-close"
                id="btn-close-modal"
                onClick={() => setSelectedDrawer(null)}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <div className="drawer-stats">
                <div className="drawer-stat">
                  <span>Original Size:</span>
                  <strong id="modal-raw-size">{formatBytes(selectedDrawer.rawSize)}</strong>
                </div>
                <div className="drawer-stat">
                  <span>Compressed Size:</span>
                  <strong id="modal-comp-size">
                    {formatBytes(selectedDrawer.compressedSize)}
                  </strong>
                </div>
                <div className="drawer-stat">
                  <span>Optimization:</span>
                  <strong id="modal-saving-ratio" className="text-glow">
                    {selectedDrawer.rawSize > 0
                      ? Math.round((1 - selectedDrawer.compressedSize / selectedDrawer.rawSize) * 100)
                      : 0}
                    % Saved
                  </strong>
                </div>
              </div>

              <div className="drawer-body-text" id="modal-drawer-content" style={{ marginTop: "16px" }}>
                {isTranscript ? (
                  modalConversationLog.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: "12px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background:
                          m.role === "user" ? "rgba(99, 102, 241, 0.1)" : "rgba(255,255,255,0.03)",
                        borderLeft: `3px solid ${
                          m.role === "user" ? "var(--primary)" : "var(--secondary)"
                        }`,
                      }}
                    >
                      <strong
                        style={{
                          color: m.role === "user" ? "var(--primary)" : "var(--secondary)",
                          display: "block",
                          fontSize: "0.85rem",
                          marginBottom: "4px",
                        }}
                      >
                        {m.role === "user" ? "Student (User)" : "Memory AI Tutor"}
                      </strong>
                      <div style={{ fontSize: "0.95rem", whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                        {m.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                    {modalDecompressedContent}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                id="btn-modal-resume-session"
                onClick={() => {
                  onResumeSessionFromDrawer(selectedDrawer);
                  setSelectedDrawer(null);
                }}
              >
                Resume Session
              </button>
              {selectedDrawer.id !== undefined && (
                <button
                  className="btn btn-danger"
                  id="btn-modal-delete-drawer"
                  onClick={() => handleDeleteClick(selectedDrawer.id!, selectedDrawer.drawer)}
                >
                  Delete Drawer
                </button>
              )}
              <button
                className="btn btn-outline"
                id="btn-modal-close"
                onClick={() => setSelectedDrawer(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
