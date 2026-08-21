import React, { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../hooks/useLLM";
import { SafeMarkdown } from "./SafeMarkdown";

interface Subtopic {
  title: string;
  description: string;
  estimated_minutes: number;
}

interface TutorChatProps {
  currentTopic: string;
  activeSubtopic: Subtopic | null;
  chatHistory: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isQueryingTutor: boolean;
  onResetSession: () => Promise<void>;
  onGoToNextTopic: () => Promise<void>;
  hasNextTopic: boolean;
  onSaveTakeaway: (aiText: string, btnId: string) => Promise<void>;
  onSaveConcept: (title: string, body: string) => Promise<void>;
  isSavingConcept: boolean;
  onSpeechToggle: (text: string, id: string) => void;
  activeSpeechId: string | null;
  onMobileBack: () => void;
  onStartSession: () => void;
}

export const TutorChat: React.FC<TutorChatProps> = ({
  currentTopic,
  activeSubtopic,
  chatHistory,
  onSendMessage,
  isQueryingTutor,
  onResetSession,
  onGoToNextTopic,
  hasNextTopic,
  onSaveTakeaway,
  onSaveConcept,
  isSavingConcept,
  onSpeechToggle,
  activeSpeechId,
  onMobileBack,
  onStartSession,
}) => {
  const [inputText, setInputText] = useState("");
  const [conceptTitle, setConceptTitle] = useState("");
  const [conceptBody, setConceptBody] = useState("");
  const [takeawaySavingStates, setTakeawaySavingStates] = useState<Record<string, "idle" | "saving" | "saved">>(
    {}
  );

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Scroll only the chat container to bottom, preserving page scroll position
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // Auto-resize input area
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
      chatInputRef.current.style.height = `${chatInputRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  const prevHistoryLength = useRef(chatHistory.length);
  const prevQuerying = useRef(isQueryingTutor);

  // Scroll to bottom on new messages or when tutor starts querying
  useEffect(() => {
    if (
      chatHistory.length > prevHistoryLength.current ||
      (isQueryingTutor && !prevQuerying.current)
    ) {
      scrollToBottom("smooth");
    }
    prevHistoryLength.current = chatHistory.length;
    prevQuerying.current = isQueryingTutor;
  }, [chatHistory.length, isQueryingTutor]);

  // Instant scroll on active subtopic switch or component mount
  useEffect(() => {
    if (activeSubtopic && chatHistory.length > 0) {
      const timer = setTimeout(() => {
        scrollToBottom("auto");
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeSubtopic, chatHistory.length]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isQueryingTutor || !activeSubtopic) return;
    setInputText("");
    onSendMessage(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveTakeawayClick = async (content: string, index: number) => {
    const buttonId = `takeaway-${index}`;
    setTakeawaySavingStates((prev) => ({ ...prev, [buttonId]: "saving" }));
    try {
      await onSaveTakeaway(content, buttonId);
      setTakeawaySavingStates((prev) => ({ ...prev, [buttonId]: "saved" }));
    } catch (err) {
      console.error(err);
      setTakeawaySavingStates((prev) => ({ ...prev, [buttonId]: "idle" }));
    }
  };

  const handleSaveConceptClick = async () => {
    const title = conceptTitle.trim();
    const body = conceptBody.trim();

    if (!title || !body) {
      alert("Both Title and Memory Content are required to save a Drawer.");
      return;
    }

    try {
      await onSaveConcept(title, body);
      setConceptTitle("");
      setConceptBody("");
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    }
  };

  return (
    <div className="learn-right flex-col" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Chat Area Card */}
      <div className="tutor-chat-card card-glass flex-col flex-1" style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div className="chat-header">
          <div className="chat-header-left" style={{ display: "flex", alignItems: "center" }}>
            <button
              className="btn btn-sm btn-outline btn-mobile-back"
              id="btn-chat-mobile-back"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 10px",
                marginRight: "10px",
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(255,255,255,0.1)",
                borderRadius: "6px",
              }}
              onClick={onMobileBack}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: 0 }}
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Syllabus</span>
            </button>

            <div className="tutor-info">
              <div className="tutor-avatar">AI</div>
              <div>
                <h4 id="tutor-title">{activeSubtopic ? activeSubtopic.title : "Locked AI Tutor"}</h4>
                <p id="tutor-status">
                  {activeSubtopic
                    ? `Locked Session under ${currentTopic}`
                    : "Select a sub-topic to start teaching sessions"}
                </p>
              </div>
            </div>
          </div>

          <div className="chat-header-actions">
            {activeSubtopic && (
              <button className="btn btn-sm btn-outline" id="btn-reset-chat" onClick={onResetSession}>
                Reset Session
              </button>
            )}
            {activeSubtopic && hasNextTopic && (
              <button
                className="btn btn-sm btn-primary"
                id="btn-next-topic"
                style={{
                  background: "var(--primary-gradient)",
                  boxShadow: "0 0 10px var(--primary-glow)",
                  border: "none",
                }}
                onClick={onGoToNextTopic}
              >
                go to next topic
              </button>
            )}
          </div>
        </div>

        {/* Chat Message Box */}
        <div 
          ref={messagesContainerRef}
          className="chat-messages" 
          id="chat-messages-container" 
          style={{ flexGrow: 1, overflowY: "auto" }}
        >
          {activeSubtopic ? (
            chatHistory.length > 0 ? (
              <>
                {chatHistory.map((msg, index) => {
                  const isUser = msg.role === "user";
                  const isSystem = msg.role === "system";
                  const isSpeaking = activeSpeechId === `msg-${index}`;

                  return (
                    <div 
                      key={index} 
                      className={`chat-bubble ${isUser ? "user" : isSystem ? "system" : "ai"}`}
                      style={isSystem ? {
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        color: "#fca5a5",
                        alignSelf: "center",
                        maxWidth: "90%",
                        fontSize: "0.85rem",
                        borderRadius: "8px",
                        margin: "10px 0"
                      } : {}}
                    >
                      <SafeMarkdown content={msg.content} />

                      {!isUser && !isSystem && (
                        <div
                          className="bubble-actions-row"
                          style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}
                        >
                          <button
                            className={`btn-bubble-speak ${isSpeaking ? "speaking" : ""}`}
                            onClick={() => onSpeechToggle(msg.content, `msg-${index}`)}
                          >
                            {isSpeaking ? (
                              <>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                                </svg>
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                                </svg>
                                <span>Read Aloud</span>
                              </>
                            )}
                          </button>

                          <button
                            className="btn-bubble-save"
                            style={{ marginTop: 0 }}
                            disabled={takeawaySavingStates[`takeaway-${index}`] !== undefined}
                            onClick={() => handleSaveTakeawayClick(msg.content, index)}
                          >
                            {takeawaySavingStates[`takeaway-${index}`] === "saving" ? (
                              <span>Processing...</span>
                            ) : takeawaySavingStates[`takeaway-${index}`] === "saved" ? (
                              <>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="var(--secondary)"
                                  strokeWidth="2.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span style={{ color: "var(--secondary)" }}>Saved to Hub!</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                  <polyline points="17 21 17 13 7 13 7 21" />
                                  <polyline points="7 3 7 8 15 8" />
                                </svg>
                                <span>Save Takeaway</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isQueryingTutor && (
                  <div
                    className="chat-bubble ai skeleton"
                    style={{ width: "220px", display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--primary)" }}>
                      <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 8px #a855f7" }}></span>
                      <span>AI Tutor is thinking...</span>
                    </div>
                    <div className="skeleton-text" style={{ margin: 0, height: 6, width: "100%" }}></div>
                    <div className="skeleton-text short" style={{ margin: 0, height: 6, width: "60%" }}></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            ) : (
              !isQueryingTutor ? (
                <div className="welcome-chat-msg" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "40px 20px", textAlign: "center", gap: "16px" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px auto" }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Start Tutoring Session</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "320px", margin: "0 auto 8px auto", lineHeight: 1.4 }}>
                    Engage with your locked AI tutor on this subtopic to begin your learning dialogue.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={onStartSession}
                    style={{ background: "var(--primary-gradient)", border: "none", padding: "8px 20px" }}
                  >
                    Start Learning
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="chat-bubble ai skeleton"
                    style={{ width: "220px", display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--primary)" }}>
                      <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 8px #a855f7" }}></span>
                      <span>AI Tutor is thinking...</span>
                    </div>
                    <div className="skeleton-text" style={{ margin: 0, height: 6, width: "100%" }}></div>
                    <div className="skeleton-text short" style={{ margin: 0, height: 6, width: "60%" }}></div>
                  </div>
                  <div ref={messagesEndRef} />
                </>
              )
            )
          ) : (
            <div className="chat-system-msg" id="chat-empty-state">
              Select a sub-topic from the syllabus list on the left. The tutor will lock into that subtopic, explain the core concepts, and guide you through an interactive learning dialogue.
            </div>
          )}
        </div>

        {/* Chat Inputs */}
        {activeSubtopic && (
          <div className="chat-input-area" id="chat-input-wrapper">
            <textarea
              ref={chatInputRef}
              id="chat-input"
              placeholder="Ask a question or explain what you've learned..."
              rows={1}
              className="input-textarea"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isQueryingTutor}
            />
            <button
              className="btn btn-icon btn-primary"
              id="btn-send-message"
              disabled={isQueryingTutor || !inputText.trim()}
              onClick={handleSend}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Manual Concept Saver Panel */}
      {activeSubtopic && (
        <div className="concept-saver-card card-glass" id="concept-saver-wrapper" style={{ marginTop: "16px" }}>
          <div className="card-header">
            <h3>Save Memory to Hub</h3>
            <p>Generate a permanent memory note inside IndexedDB (compressed & semantic-ready)</p>
          </div>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Wing (Topic)</label>
              <input type="text" id="concept-wing" readOnly className="input-text input-readonly" value={currentTopic} />
            </div>
            <div className="form-group flex-1">
              <label>Room (Sub-topic)</label>
              <input type="text" id="concept-room" readOnly className="input-text input-readonly" value={activeSubtopic.title} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="concept-title">Drawer Title (Concept Name)</label>
            <input
              type="text"
              id="concept-title"
              placeholder="e.g. Qubit Superposition, State Update Hook"
              className="input-text"
              value={conceptTitle}
              onChange={(e) => setConceptTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="concept-body">Memory Content</label>
            <textarea
              id="concept-body"
              placeholder="Write key details, insights, or formulas here..."
              rows={3}
              className="input-textarea"
              value={conceptBody}
              onChange={(e) => setConceptBody(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-full" id="btn-save-concept" disabled={isSavingConcept} onClick={handleSaveConceptClick}>
            <span>{isSavingConcept ? "Encrypting & Vectorizing..." : "Save Memory Drawer"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
