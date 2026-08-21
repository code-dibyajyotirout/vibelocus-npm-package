import React, { useState } from "react";
import LZString from "lz-string";
import type { DrawerRecord } from "../hooks/useIndexedDB";

interface MemoryHubProps {
  drawers: DrawerRecord[];
  onDeleteDrawer: (id: number) => Promise<boolean>;
  onResumeSessionFromDrawer: (drawer: DrawerRecord) => Promise<void>;
  onResumeTopic: (wing: string) => Promise<void>;
  onResumeRoom: (wing: string, room: string) => Promise<void>;
}

export const MemoryHub: React.FC<MemoryHubProps> = ({
  drawers,
  onDeleteDrawer,
  onResumeSessionFromDrawer,
  onResumeTopic,
  onResumeRoom,
}) => {
  const [view, setView] = useState<"wings" | "rooms" | "drawers">("wings");
  const [activeWing, setActiveWing] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [selectedDrawer, setSelectedDrawer] = useState<DrawerRecord | null>(null);

  // Decompress helpers (inline copy of LZString usage)
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

  const handleBack = () => {
    if (view === "drawers") {
      setView("rooms");
      setActiveRoom(null);
    } else if (view === "rooms") {
      setView("wings");
      setActiveWing(null);
    }
  };

  const handleHome = () => {
    setView("wings");
    setActiveWing(null);
    setActiveRoom(null);
  };

  const handleDeleteClick = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete drawer: "${name}"?`)) {
      await onDeleteDrawer(id);
      setSelectedDrawer(null);
    }
  };

  // Grouping structures
  // 1. Wings
  const wingsMap: Record<string, { rooms: Set<string>; drawersCount: number }> = {};
  drawers.forEach((d) => {
    if (!wingsMap[d.wing]) {
      wingsMap[d.wing] = { rooms: new Set(), drawersCount: 0 };
    }
    wingsMap[d.wing].rooms.add(d.room);
    wingsMap[d.wing].drawersCount++;
  });

  // 2. Rooms (filtered by active wing)
  const roomsMap: Record<string, number> = {};
  if (activeWing) {
    drawers
      .filter((d) => d.wing === activeWing)
      .forEach((d) => {
        if (!roomsMap[d.room]) roomsMap[d.room] = 0;
        roomsMap[d.room]++;
      });
  }

  // 3. Drawers (filtered by active wing & room)
  const activeDrawers =
    activeWing && activeRoom
      ? drawers.filter((d) => d.wing === activeWing && d.room === activeRoom)
      : [];

  // Parse details for conversation transcript vs notes
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
    <section className="tab-panel active" id="panel-palace">
      <header className="section-header">
        <h1>The Local Memory Hub</h1>
        <p>IndexedDB spatial database. Explore your saved knowledge Wings, Rooms, and Drawers.</p>
      </header>

      <div className="palace-wrapper card-glass">
        {/* Palace Navigation */}
        <div className="palace-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="palace-nav-left" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {view !== "wings" && (
              <button className="btn btn-sm btn-outline" id="btn-palace-back" onClick={handleBack}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: "4px" }}
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back
              </button>
            )}

            <button className="btn btn-sm btn-outline" id="btn-palace-home" onClick={handleHome}>
              Palace Entrance
            </button>

            {view !== "wings" && (
              <>
                <span className="palace-breadcrumb-divider">/</span>
                <span className="palace-breadcrumb-active">
                  <span className="breadcrumb-link" onClick={() => setView("wings")}>
                    {activeWing}
                  </span>
                  {view === "drawers" && (
                    <>
                      {" / "}
                      <span className="breadcrumb-link" onClick={() => setView("rooms")}>
                        {activeRoom}
                      </span>
                    </>
                  )}
                  {" / "}
                  {view === "rooms" ? "Rooms" : "Drawers"}
                </span>
              </>
            )}
            {view === "wings" && (
              <>
                <span className="palace-breadcrumb-divider" style={{ display: "none" }}>
                  /
                </span>
                <span className="palace-breadcrumb-active" id="palace-breadcrumb-text">
                  Wings (Topics)
                </span>
              </>
            )}
          </div>

          {/* Quick Resumes on Navigation bar */}
          {view === "rooms" && activeWing && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onResumeTopic(activeWing)}
            >
              Resume Topic Chat
            </button>
          )}

          {view === "drawers" && activeWing && activeRoom && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onResumeRoom(activeWing, activeRoom)}
            >
              Resume Room Chat
            </button>
          )}
        </div>

        {/* Visual Folder Grid */}
        <div className="palace-grid" id="palace-grid-container">
          {view === "wings" &&
            Object.entries(wingsMap).map(([wingName, info], idx) => (
              <div
                key={idx}
                className="palace-card palace-card-wing"
                onClick={() => {
                  setActiveWing(wingName);
                  setView("rooms");
                }}
              >
                <div className="palace-card-icon">
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
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="palace-card-info">
                  <h3>{wingName}</h3>
                  <p>
                    {info.rooms.size} rooms, {info.drawersCount} memories
                  </p>
                  <button
                    className="btn btn-sm btn-outline btn-resume-wing-shortcut"
                    style={{ marginTop: "10px", width: "100%", fontSize: "0.75rem", padding: "4px 8px", position: "relative", zIndex: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onResumeTopic(wingName);
                    }}
                  >
                    Resume Topic Chat
                  </button>
                </div>
              </div>
            ))}

          {view === "rooms" &&
            Object.entries(roomsMap).map(([roomName, count], idx) => (
              <div
                key={idx}
                className="palace-card palace-card-room"
                onClick={() => {
                  setActiveRoom(roomName);
                  setView("drawers");
                }}
              >
                <div className="palace-card-icon">
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
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                  </svg>
                </div>
                <div className="palace-card-info">
                  <h3>{roomName}</h3>
                  <p>{count} memory drawers</p>
                  {activeWing && (
                    <button
                      className="btn btn-sm btn-outline btn-resume-room-shortcut"
                      style={{ marginTop: "10px", width: "100%", fontSize: "0.75rem", padding: "4px 8px", position: "relative", zIndex: 2 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeRoom(activeWing, roomName);
                      }}
                    >
                      Resume Room Chat
                    </button>
                  )}
                </div>
              </div>
            ))}

          {view === "drawers" &&
            activeDrawers.map((d, idx) => {
              const text = decompress(d.compressedContent);
              let previewText = "";

              if (d.drawer === "Conversation Transcript") {
                try {
                  const parsed = JSON.parse(text);
                  const lines = parsed.map(
                    (m: any) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`
                  );
                  const fullDiag = lines.join("\n");
                  previewText = fullDiag.length > 80 ? fullDiag.substring(0, 80) + "..." : fullDiag;
                } catch {
                  previewText = text.length > 80 ? text.substring(0, 80) + "..." : text;
                }
              } else {
                previewText = text.length > 80 ? text.substring(0, 80) + "..." : text;
              }

              const savingsPct =
                d.rawSize > 0 ? Math.round((1 - d.compressedSize / d.rawSize) * 100) : 0;

              return (
                <div
                  key={idx}
                  className="palace-card palace-card-drawer"
                  onClick={() => setSelectedDrawer(d)}
                >
                  <div className="palace-card-icon">
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
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <path d="M12 2v9" />
                      <path d="M8 5h8" />
                    </svg>
                  </div>
                  <div className="palace-card-info" style={{ display: "flex", flexDirection: "column", flexGrow: 1, width: "100%" }}>
                    <h3>{d.drawer}</h3>
                    <p style={{ fontSize: "0.75rem", lineHeight: "1.4", marginTop: "4px" }}>
                      {previewText}
                    </p>
                  </div>
                  <div className="palace-card-meta">
                    <span>Size: {formatBytes(d.compressedSize)}</span>
                    <span className="compression-badge">{savingsPct}% Saved</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Empty States */}
        {drawers.length === 0 && (
          <div className="palace-empty-state" id="palace-empty-state">
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <p>No memories saved in this area yet.</p>
          </div>
        )}
      </div>

      {/* Spatial Drawer Modal */}
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
