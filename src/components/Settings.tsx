import React, { useState, useEffect, useRef } from "react";
import { APIProvider, DEFAULT_CONFIGS, LOCAL_MODELS, getLocalModelSize } from "../hooks/useLLM";
import type { DBStats, QuotaInfo } from "../hooks/useIndexedDB";
import { deobfuscate } from "../utils/security";

interface SettingsProps {
  apiProvider: APIProvider;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  saveSettings: (provider: APIProvider, key: string, model: string, url: string) => void;
  dbStats: DBStats;
  quota: QuotaInfo;
  onPurgeDB: () => void;
  localLLMReady?: boolean;
  localLLMLoading?: boolean;
  localLLMProgress?: number;
  onLoadLocalLLM?: (modelId?: string) => void;
  isModelReady?: boolean;
  isModelLoading?: boolean;
  modelLoadProgress?: number;
  onLoadModel?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  apiProvider,
  modelId,
  baseUrl,
  apiKey,
  saveSettings,
  dbStats,
  quota,
  onPurgeDB,
  localLLMReady = false,
  localLLMLoading = false,
  localLLMProgress = 0,
  onLoadLocalLLM,
  isModelReady = false,
  isModelLoading = false,
  modelLoadProgress = 0,
  onLoadModel,
}) => {
  const [provider, setProvider] = useState<APIProvider>(apiProvider);
  const [key, setKey] = useState<string>(apiKey);
  const [model, setModel] = useState<string>(modelId);
  const [url, setUrl] = useState<string>(baseUrl);
  const [isSaved, setIsSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync inputs with parent state when it loads
  useEffect(() => {
    setProvider(apiProvider);
    setKey(apiKey);
    setModel(modelId);
    setUrl(baseUrl);
  }, [apiProvider, apiKey, modelId, baseUrl]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as APIProvider;
    setProvider(val);
    
    if (typeof window !== "undefined") {
      const savedKeyObfuscated = localStorage.getItem(`vibe_api_key_${val}`);
      const savedKey = savedKeyObfuscated ? deobfuscate(savedKeyObfuscated) : "";
      const savedModel = localStorage.getItem(`vibe_model_id_${val}`) || DEFAULT_CONFIGS[val].modelId;
      const savedUrl = localStorage.getItem(`vibe_base_url_${val}`) || DEFAULT_CONFIGS[val].baseUrl;
      
      setKey(savedKey);
      setModel(savedModel);
      setUrl(savedUrl);
    } else {
      setModel(DEFAULT_CONFIGS[val].modelId);
      setUrl(DEFAULT_CONFIGS[val].baseUrl);
    }
  };

  const handleSave = () => {
    if (!key && provider !== "ollama" && provider !== "colab" && provider !== "local" && provider !== "chrome") {
      alert("API Key is required to save credentials.");
      return;
    }
    saveSettings(provider, key.trim(), model.trim(), url.trim());

    // Show inline success toast instead of alert()
    setIsSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setIsSaved(false), 3000);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const isUrlWrapperHidden = provider === "gemini" || provider === "openai" || provider === "local" || provider === "chrome";

  return (
    <section className="tab-panel active" id="panel-settings">
      <header className="section-header">
        <h1>System Configuration</h1>
        <p>Configure LLM endpoints, credentials, and manage database stores.</p>
      </header>

      <div className="settings-grid">
        {/* API Settings */}
        <div className="settings-card card-glass">
          <h2>API Orchestration</h2>
          <p className="card-subtitle">
            Define the LLM endpoint parameters to enable live syllabus & locked tutoring.
          </p>

          <div className="form-group">
            <label htmlFor="settings-api-provider">API Provider</label>
            <select
              id="settings-api-provider"
              className="input-select"
              value={provider}
              onChange={handleProviderChange}
            >
              <option value="ollama">Ollama - Local OS LLM (Recommended for Privacy & Speed)</option>
              <option value="colab">Google Colab - Free Cloud GPU (Run LLM Free via Colab)</option>
              <option value="local">In-Browser Local LLM (Zero Setup - Runs in Client)</option>
              <option value="chrome">Chrome Built-in AI (Gemini Nano - Zero Config On-Device)</option>
              <option value="gemini">Google Gemini API (Cloud)</option>
              <option value="openai">OpenAI API (Cloud)</option>
              <option value="custom">Custom / Any Other AI Service (OpenAI-Compatible)</option>
            </select>
          </div>

          <div
            className={`form-group ${isUrlWrapperHidden ? "hidden" : ""}`}
            id="settings-url-wrapper"
          >
            <label htmlFor="settings-base-url">
              {provider === "colab" ? "Paste Your Colab Tunnel URL Here" : "Base API Endpoint URL"}
            </label>
            <input
              type="text"
              id="settings-base-url"
              placeholder={
                provider === "colab"
                  ? "Paste URL from Colab notebook (e.g. https://xxxx.a.pinggy.link/v1/chat/completions)"
                  : "e.g. https://generativelanguage.googleapis.com"
              }
              className="input-text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {provider === "colab" && url === DEFAULT_CONFIGS.colab.baseUrl && (
              <p
                style={{
                  fontSize: "0.76rem",
                  color: "#f59e0b",
                  marginTop: "6px",
                  lineHeight: 1.3,
                }}
              >
                Note: This is a placeholder — you must replace it with the actual Tunnel URL from your Colab notebook.
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="settings-api-key">API Key</label>
            <input
              type="password"
              id="settings-api-key"
              placeholder={
                provider === "ollama"
                  ? "No key needed for local Ollama"
                  : provider === "colab"
                  ? "No key needed — uses zero-token Cloudflare Tunnel"
                  : provider === "local"
                  ? "No key needed for local In-Browser execution"
                  : provider === "chrome"
                  ? "No key needed for Chrome Built-in AI"
                  : "Enter your provider API Key..."
              }
              className="input-text"
              value={key}
              disabled={provider === "ollama" || provider === "colab" || provider === "local" || provider === "chrome"}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="settings-model-id">Model ID</label>
            {provider === "local" ? (
              <select
                id="settings-model-id"
                className="input-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {LOCAL_MODELS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} ({opt.size})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id="settings-model-id"
                placeholder={
                  provider === "gemini"
                    ? "e.g. gemini-2.5-flash"
                    : provider === "openai"
                    ? "e.g. gpt-4o-mini"
                    : provider === "chrome"
                    ? "gemini-nano"
                    : "e.g. qwen2.5:0.5b"
                }
                className="input-text"
                value={model}
                disabled={provider === "chrome"}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
            {provider === "local" && (
              <p
                style={{
                  fontSize: "0.76rem",
                  color: "var(--text-muted)",
                  marginTop: "6px",
                  lineHeight: 1.3,
                }}
              >
                {LOCAL_MODELS.find((m) => m.id === model)?.description}
              </p>
            )}
          </div>

          <div id="settings-help-box" className="settings-help-box">
            {provider === "gemini" && (
              <div>
                <strong>Google Gemini API Setup:</strong>
                <br />
                1. Visit the{" "}
                <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
                  Google AI Studio Portal
                </a>
                .
                <br />
                2. Click <strong>&quot;Get API key&quot;</strong> to generate a free-tier token.
                <br />
                3. Paste your key above. Use <code>gemini-2.5-flash</code> for free & fast
                reasoning.
                <br />
                <span
                  style={{
                    fontSize: "0.76rem",
                    display: "block",
                    marginTop: "6px",
                    color: "var(--text-muted)",
                  }}
                >
                  Can&apos;t get it? Run a quick{" "}
                  <a
                    href="https://www.google.com/search?q=how+to+get+gemini+api+key"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Search Guide
                  </a>
                  .
                </span>
              </div>
            )}

            {provider === "openai" && (
              <div>
                <strong>OpenAI API Setup:</strong>
                <br />
                1. Visit{" "}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                  OpenAI Platform Keys
                </a>
                .
                <br />
                2. Generate a new secret key (make sure your account has credits loaded).
                <br />
                3. Paste your key above. Suggested model: <code>gpt-4o-mini</code>.
                <br />
                <span
                  style={{
                    fontSize: "0.76rem",
                    display: "block",
                    marginTop: "6px",
                    color: "var(--text-muted)",
                  }}
                >
                  Stuck? Run a quick{" "}
                  <a
                    href="https://www.google.com/search?q=how+to+get+openai+api+key"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Search Guide
                  </a>
                  .
                </span>
              </div>
            )}

            {provider === "ollama" && (
              <div>
                <strong>Ollama Local Setup:</strong>
                <br />
                1. Install and run{" "}
                <a href="https://ollama.com/" target="_blank" rel="noreferrer">
                  Ollama
                </a>{" "}
                locally.
                <br />
                2. Open your terminal and pull a model, e.g.:
                <br />
                <code
                  style={{
                    display: "block",
                    background: "rgba(0,0,0,0.4)",
                    padding: "6px 10px",
                    margin: "6px 0",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                  }}
                >
                  ollama run qwen2.5:0.5b
                </code>
                3. No API key is required. Make sure the model matches Ollama&apos;s loaded tag.
              </div>
            )}

            {provider === "colab" && (
              <div>
                <strong>Google Colab Free GPU Setup:</strong>
                <br />
                Run open-source LLMs for free on Google Colab&apos;s T4 GPU and connect to VibeLocus via a free Cloudflare Tunnel.
                <br />
                <br />
                <strong>Quick Start (3 Steps):</strong>
                <br />
                1. Open a{" "}
                <a href="https://colab.research.google.com/" target="_blank" rel="noreferrer">
                  Google Colab Notebook
                </a>{" "}
                and set Runtime → <strong>T4 GPU</strong>.
                <br />
                2. Run this cell in your notebook:
                <code
                  style={{
                    display: "block",
                    background: "rgba(0,0,0,0.4)",
                    padding: "8px 10px",
                    margin: "6px 0",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontSize: "0.76rem",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
{`# 1. Install dependencies & Ollama
!apt-get update -qq && apt-get install -y -qq zstd
!curl -fsSL https://ollama.com/install.sh | sh
!pip install gradio requests -q

# 2. Enable CORS & Start Ollama
import os, subprocess, time, requests
os.environ["OLLAMA_ORIGINS"] = "*"
subprocess.Popen(["ollama", "serve"])
time.sleep(4)
!ollama pull qwen2.5:3b

# 3. Launch Gradio Public Tunnel (Zero signup, zero tokens, zero 403 errors!)
import gradio as gr
def query_ollama(prompt, system=""):
  try:
    msgs = []
    if system: msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    r = requests.post("http://localhost:11434/v1/chat/completions", json={"model": "qwen2.5:3b", "messages": msgs}, timeout=120)
    return r.json()["choices"][0]["message"]["content"]
  except Exception as e:
    return f"Error: {e}"

gr.Interface(fn=query_ollama, inputs=[gr.Textbox(), gr.Textbox()], outputs=gr.Textbox()).launch(share=True)`}
                </code>
                3. Copy the printed URL and paste it in the <strong>Base API Endpoint URL</strong> field above.
                <br />
                <br />
                <span
                  style={{
                    fontSize: "0.76rem",
                    display: "block",
                    color: "var(--secondary)",
                  }}
                >
                  Gradio share links provide zero-config, instant public HTTPS tunneling for Google Colab.
                </span>
              </div>
            )}

            {provider === "local" && (
              <div>
                <strong>In-Browser Local LLM (WebGPU / WASM CPU fallback):</strong>
                <br />
                This options runs text generation directly inside your browser client-side. No external servers or API keys are used.
                <div style={{ marginTop: "12px", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Activation Status</span>
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: localLLMReady ? "#10b981" : localLLMLoading ? "#f59e0b" : "#6b7280"
                      }}
                    ></span>
                  </div>
                  <p style={{ fontSize: "0.8rem", margin: "0 0 10px 0", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    {localLLMReady
                      ? "Browser LLM is active. Local text generation ready."
                      : localLLMLoading
                      ? `Downloading Local LLM: ${localLLMProgress}% of ${getLocalModelSize(model)}. Please wait...`
                      : `In-browser text generation is dormant. Activate to download model weights (${getLocalModelSize(model)}).`}
                  </p>
                  {localLLMLoading && (
                    <div className="progress-bar-container" style={{ marginBottom: "12px" }}>
                      <div className="progress-bar-fill" style={{ width: `${localLLMProgress}%` }}></div>
                    </div>
                  )}
                  {!localLLMReady && onLoadLocalLLM && (
                    <button
                      className="btn btn-sm btn-outline btn-full"
                      disabled={localLLMLoading}
                      onClick={() => {
                        saveSettings(provider, apiKey, model, baseUrl);
                        onLoadLocalLLM(model);
                      }}
                    >
                      {localLLMLoading ? "Downloading weights..." : "Activate / Download Local LLM"}
                    </button>
                  )}
                  {localLLMReady && (
                    <div style={{ color: "#10b981", fontSize: "0.8rem", textAlign: "center", fontWeight: 500 }}>
                      Model loaded and cached successfully.
                    </div>
                  )}
                </div>
              </div>
            )}

            {provider === "chrome" && (
              <div>
                <strong>Chrome Built-in AI (Gemini Nano Prompt API):</strong>
                <br />
                Executes text generation directly using Google Chrome&apos;s native on-device LLM engine without external servers or API keys.
                <br />
                <br />
                <strong>Setup Instructions:</strong>
                <br />
                1. Open <code>chrome://flags</code> in Google Chrome.
                <br />
                2. Set <strong>Enables Optimization Guide on Device Model</strong> to <em>Enabled BypassPerfRequirement</em>.
                <br />
                3. Set <strong>Prompt API for Gemini Nano</strong> to <em>Enabled</em>.
                <br />
                4. Relaunch Chrome.
                <br />
                5. <strong>First-Time Download Tip</strong>: When you generate a topic for the first time, Chrome will automatically download model weights (~1.5GB) in the background. You can track download status anytime at <code>chrome://components</code> under <em>Optimization Guide On Device Model</em>!
              </div>
            )}

            {provider === "custom" && (
              <div>
                <strong>Custom Endpoint Setup:</strong>
                <br />
                1. Set custom Base Endpoint URL (e.g. OpenRouter:{" "}
                <code>https://openrouter.ai/api/v1/chat/completions</code>).
                <br />
                2. Input your provider&apos;s specific API Key and Model ID.
                <br />
                3. Ensure custom endpoints use standard OpenAI request formats.
              </div>
            )}
          </div>

          <div className="save-credentials-bar">
            <button
              className={`btn btn-primary btn-full ${isSaved ? "btn-saved" : ""}`}
              onClick={handleSave}
              style={{
                transition: "all 0.3s ease",
                background: isSaved ? "var(--secondary)" : undefined,
                boxShadow: isSaved ? "0 0 18px var(--secondary-glow)" : undefined,
              }}
            >
              {isSaved ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Credentials Saved!
                </span>
              ) : (
                <span>Save Credentials</span>
              )}
            </button>
            {isSaved && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: "0.78rem",
                  color: "var(--secondary)",
                  marginTop: "8px",
                  animation: "fadeIn 0.3s ease",
                }}
              >
                API settings encrypted and stored locally.
              </p>
            )}
          </div>
        </div>

        {/* Local Database & Memory Stats */}
        <div className="settings-card card-glass">
          <h2>Local Storage & Memory Hub Stats</h2>
          <p className="card-subtitle">
            Details about IndexedDB contents, lz-string compression and weights.
          </p>

          <div className="stats-panel">
            <div className="stat-box">
              <span className="stat-val" id="stat-wings-count">
                {dbStats.wingsCount}
              </span>
              <span className="stat-lbl">Wings (Main Topics)</span>
            </div>
            <div className="stat-box">
              <span className="stat-val" id="stat-rooms-count">
                {dbStats.roomsCount}
              </span>
              <span className="stat-lbl">Rooms (Subtopics)</span>
            </div>
            <div className="stat-box">
              <span className="stat-val" id="stat-drawers-count">
                {dbStats.drawersCount}
              </span>
              <span className="stat-lbl">Drawers (Memories)</span>
            </div>
          </div>

          <div className="compression-meta-card">
            <h4>Space Optimization Metrics</h4>
            <div className="meta-row">
              <span>Total Uncompressed Size:</span>
              <strong id="stat-raw-bytes">{formatBytes(dbStats.rawTotalBytes)}</strong>
            </div>
            <div className="meta-row">
              <span>Compressed Size (in DB):</span>
              <strong id="stat-compressed-bytes">
                {formatBytes(dbStats.compressedTotalBytes)}
              </strong>
            </div>
            <div className="meta-row">
              <span>Compression Space Saved:</span>
              <strong id="stat-saved-pct" className="text-glow">
                {dbStats.savedPercentage}%
              </strong>
            </div>
            <div
              className="meta-row"
              style={{
                marginTop: "12px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "12px",
              }}
            >
              <span>Total Local Storage Quota:</span>
              <strong id="stat-quota-bytes">{quota.quota}</strong>
            </div>
            <div className="meta-row">
              <span>Total Local Storage Usage:</span>
              <strong id="stat-quota-usage">{quota.usage}</strong>
            </div>
            <div className="meta-row">
              <span>Origin Disk Space Status:</span>
              <strong id="stat-quota-pct" style={{ color: quota.color }}>
                {quota.status}
              </strong>
            </div>
          </div>

          <div className="compression-meta-card" style={{ marginTop: "16px" }}>
            <h4>Memory AI Core (Semantic Embeddings)</h4>
            <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border-color)", marginTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Embedding Engine Status</span>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: isModelReady ? "#10b981" : isModelLoading ? "#f59e0b" : "#6b7280"
                  }}
                ></span>
              </div>
              <p style={{ fontSize: "0.8rem", margin: "0 0 10px 0", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {isModelReady
                  ? "Memory AI awake. Semantic associations active."
                  : isModelLoading
                  ? `Activating Memory Core: ${modelLoadProgress}% (~30MB)`
                  : "Memory AI is dormant. Activate to generate query vector embeddings for Semantic Search."}
              </p>
              {isModelLoading && (
                <div className="progress-bar-container" style={{ marginBottom: "12px" }}>
                  <div className="progress-bar-fill" style={{ width: `${modelLoadProgress}%` }}></div>
                </div>
              )}
              {!isModelReady && onLoadModel && (
                <button
                  className="btn btn-sm btn-outline btn-full"
                  disabled={isModelLoading}
                  onClick={onLoadModel}
                >
                  {isModelLoading ? "Activating..." : "Activate Memory AI Core"}
                </button>
              )}
              {isModelReady && (
                <div style={{ color: "#10b981", fontSize: "0.8rem", textAlign: "center", fontWeight: 500 }}>
                  Embedding model active.
                </div>
              )}
            </div>
          </div>

          <div className="danger-zone">
            <h3>Danger Zone</h3>
            <p>Clearing data is permanent. Make sure you have exported copies if needed.</p>
            <button className="btn btn-danger" id="btn-clear-db" onClick={onPurgeDB}>
              Purge Memory Hub
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
