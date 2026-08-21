import React from "react";
import { getLocalModelSize } from "../hooks/useLLM";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isModelReady: boolean;
  isModelLoading: boolean;
  modelLoadProgress: number;
  onLoadModel: () => void;
  localLLMReady: boolean;
  localLLMLoading: boolean;
  localLLMProgress: number;
  onLoadLocalLLM: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isModelReady,
  isModelLoading,
  modelLoadProgress,
  onLoadModel,
  localLLMReady,
  localLLMLoading,
  localLLMProgress,
  onLoadLocalLLM,
}) => {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
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
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2>VibeLocus</h2>
      </div>

      <nav className="nav-menu">
        <button
          className={`nav-item ${activeTab === "learn" ? "active" : ""}`}
          onClick={() => onTabChange("learn")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>Learn & Chat</span>
        </button>

        <button
          className={`nav-item ${activeTab === "palace" ? "active" : ""}`}
          onClick={() => onTabChange("palace")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Memory Hub</span>
        </button>

        <button
          className={`nav-item ${activeTab === "search" ? "active" : ""}`}
          onClick={() => onTabChange("search")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Semantic Search</span>
        </button>

        <button
          className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onTabChange("settings")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </nav>

      {/* Embedding Model Status Widget inside Sidebar */}
      <div className="sidebar-widget model-status-widget">
        <div className="widget-header">
          <span
            className={`pulse-indicator ${
              isModelReady
                ? "status-online"
                : isModelLoading
                ? "status-loading"
                : "status-offline"
            }`}
          ></span>
          <span className="widget-title">Memory AI Core</span>
        </div>
        <div className="widget-body">
          <p>
            {isModelReady
              ? "Memory AI awake. Semantic associations active."
              : isModelLoading
              ? `Activating Memory Core: ${modelLoadProgress}%`
              : "Memory AI is dormant."}
          </p>

          {isModelLoading && (
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${modelLoadProgress}%` }}
              ></div>
            </div>
          )}

          {!isModelReady && (
            <button
              className="btn btn-sm btn-outline btn-full"
              disabled={isModelLoading}
              onClick={onLoadModel}
            >
              {isModelLoading ? "Activating..." : "Activate Memory AI"}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
