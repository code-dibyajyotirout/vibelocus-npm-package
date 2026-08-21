import { useState, useEffect, useCallback } from "react";
import { obfuscate, deobfuscate } from "../utils/security";

export type APIProvider = "gemini" | "openai" | "ollama" | "colab" | "local" | "chrome" | "custom";

export interface ProviderConfig {
  modelId: string;
  baseUrl: string;
}

// Module-level Web Worker reference and loading states
let workerInstance: Worker | null = null;
let queryCallbacks: { resolve: (text: string) => void; reject: (err: any) => void } | null = null;
let localLLMReadyGlobal = false;
let localLLMLoadingGlobal = false;
let localLLMProgressGlobal = 0;
let currentLoadedLocalModel = "";

export const DEFAULT_CONFIGS: Record<APIProvider, ProviderConfig> = {
  gemini: {
    modelId: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  openai: {
    modelId: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1/chat/completions",
  },
  ollama: {
    modelId: "qwen2.5:3b",
    baseUrl: "http://localhost:11434/v1/chat/completions",
  },
  colab: {
    modelId: "qwen2.5:3b",
    baseUrl: "https://your-tunnel.trycloudflare.com/v1/chat/completions",
  },
  local: {
    modelId: "Xenova/Qwen1.5-0.5B-Chat",
    baseUrl: "local-browser",
  },
  chrome: {
    modelId: "gemini-nano",
    baseUrl: "chrome-built-in",
  },
  custom: {
    modelId: "your-model-name",
    baseUrl: "https://api.your-provider.com/v1",
  },
};

export interface LocalModelOption {
  id: string;
  name: string;
  size: string;
  description: string;
}

export const LOCAL_MODELS: LocalModelOption[] = [
  {
    id: "Xenova/LaMini-Flan-T5-77M",
    name: "LaMini-Flan-T5-77M (Ultra Light)",
    size: "~77MB",
    description: "Ultra-fast, tiny model. Downloads instantly and runs on any device.",
  },
  {
    id: "Xenova/Qwen1.5-0.5B-Chat",
    name: "Qwen1.5-0.5B (Standard)",
    size: "~350MB",
    description: "Standard model. Better reasoning capability but higher download size and RAM requirement.",
  },
  {
    id: "Xenova/LaMini-GPT-124M",
    name: "LaMini-GPT-124M (Legacy)",
    size: "~500MB",
    description: "Legacy unquantized fallback model with heavy weights.",
  },
  {
    id: "Xenova/Qwen1.5-1.8B-Chat",
    name: "Qwen1.5-1.8B (Advanced - High-End Only)",
    size: "~1.2GB",
    description: "Advanced larger model with superior reasoning. Requires WebGPU and 8GB+ RAM. Will crash on mobile devices.",
  },
];

export function getLocalModelSize(modelId: string): string {
  const model = LOCAL_MODELS.find((m) => m.id === modelId);
  return model ? model.size : "~350MB";
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export function useLLM() {
  const [apiProvider, setApiProvider] = useState<APIProvider>("ollama");
  const [apiKey, setApiKey] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  // In-browser Local LLM loading state
  const [localLLMReady, setLocalLLMReady] = useState(localLLMReadyGlobal);
  const [localLLMLoading, setLocalLLMLoading] = useState(localLLMLoadingGlobal);
  const [localLLMProgress, setLocalLLMProgress] = useState(localLLMProgressGlobal);

  // Sync state with worker messages on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!workerInstance) {
      workerInstance = new Worker(new URL("../utils/llm.worker.ts", import.meta.url));
    }

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;
      if (type === "load-status") {
        const { status, progress, error } = data;
        if (status === "loading") {
          localLLMLoadingGlobal = true;
          localLLMProgressGlobal = progress ?? 0;
          setLocalLLMLoading(true);
          setLocalLLMProgress(progress ?? 0);
        } else if (status === "ready") {
          localLLMLoadingGlobal = false;
          localLLMReadyGlobal = true;
          localLLMProgressGlobal = 100;
          setLocalLLMLoading(false);
          setLocalLLMReady(true);
          setLocalLLMProgress(100);
        } else if (status === "error") {
          localLLMLoadingGlobal = false;
          localLLMReadyGlobal = false;
          setLocalLLMLoading(false);
          setLocalLLMReady(false);
          console.error("Local LLM worker loading error:", error);
        }
      } else if (type === "query-result") {
        if (queryCallbacks) {
          queryCallbacks.resolve(data.text);
          queryCallbacks = null;
        }
      } else if (type === "query-error") {
        if (queryCallbacks) {
          queryCallbacks.reject(new Error(data.error));
          queryCallbacks = null;
        }
      }
    };

    workerInstance.addEventListener("message", handleMessage);

    // Initial sync
    setLocalLLMReady(localLLMReadyGlobal);
    setLocalLLMLoading(localLLMLoadingGlobal);
    setLocalLLMProgress(localLLMProgressGlobal);

    return () => {
      workerInstance?.removeEventListener("message", handleMessage);
    };
  }, []);

  // Load configuration from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedProvider = (localStorage.getItem("vibe_api_provider") as APIProvider) || "ollama";
      
      const cachedKeyObfuscated = localStorage.getItem(`vibe_api_key_${cachedProvider}`) || localStorage.getItem("vibe_api_key") || "";
      const cachedKey = deobfuscate(cachedKeyObfuscated);
      
      const cachedModel = localStorage.getItem(`vibe_model_id_${cachedProvider}`) || localStorage.getItem("vibe_model_id") || DEFAULT_CONFIGS[cachedProvider].modelId;
      const cachedUrl = localStorage.getItem(`vibe_base_url_${cachedProvider}`) || localStorage.getItem("vibe_base_url") || DEFAULT_CONFIGS[cachedProvider].baseUrl;

      setApiProvider(cachedProvider);
      setApiKey(cachedKey);
      setModelId(cachedModel);
      setBaseUrl(cachedUrl);
      setIsLoaded(true);
    }
  }, []);

  const saveSettings = useCallback(
    (provider: APIProvider, key: string, model: string, url: string) => {
      setApiProvider(provider);
      setApiKey(key);
      setModelId(model);
      setBaseUrl(url);

      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_api_provider", provider);
        localStorage.setItem(`vibe_api_key_${provider}`, obfuscate(key));
        localStorage.setItem(`vibe_model_id_${provider}`, model);
        localStorage.setItem(`vibe_base_url_${provider}`, url);
        
        // Backward compatibility fallbacks
        localStorage.setItem("vibe_api_key", obfuscate(key));
        localStorage.setItem("vibe_model_id", model);
        localStorage.setItem("vibe_base_url", url);
      }
    },
    []
  );

  const loadLocalLLM = useCallback(async (targetModelId?: string) => {
    const activeModel = targetModelId || modelId || DEFAULT_CONFIGS.local.modelId;
    if (targetModelId) {
      setModelId(targetModelId);
    }

    if (localLLMReadyGlobal && currentLoadedLocalModel === activeModel) {
      setLocalLLMReady(true);
      return;
    }
    if (localLLMLoadingGlobal) return;

    localLLMLoadingGlobal = true;
    localLLMProgressGlobal = 0;
    setLocalLLMLoading(true);
    setLocalLLMProgress(0);

    if (typeof window !== "undefined") {
      if (!workerInstance) {
        workerInstance = new Worker(new URL("../utils/llm.worker.ts", import.meta.url));
      }
      workerInstance.postMessage({
        type: "load",
        data: { modelId: activeModel },
      });
    }
  }, [modelId]);

  const queryLLM = useCallback(
    async (messages: ChatMessage[], systemInstruction: string | null = null, signal?: AbortSignal): Promise<string> => {
      if (!apiKey && apiProvider !== "ollama" && apiProvider !== "colab" && apiProvider !== "local" && apiProvider !== "chrome") {
        throw new Error("Missing API Key. Please enter your credentials in Settings.");
      }

      if (apiProvider === "chrome") {
        return queryChromeAI(messages, systemInstruction, signal);
      }

      // Browser-Local Model execution flow via background Web Worker
      if (apiProvider === "local") {
        if (typeof window === "undefined") {
          throw new Error("Local LLM cannot run on server-side.");
        }

        if (!workerInstance) {
          workerInstance = new Worker(new URL("../utils/llm.worker.ts", import.meta.url));
        }

        // If not ready, load first
        if (!localLLMReadyGlobal) {
          await new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }

            loadLocalLLM();
            
            const checkInterval = setInterval(() => {
              if (localLLMReadyGlobal) {
                clearInterval(checkInterval);
                resolve();
              } else if (!localLLMLoadingGlobal && !localLLMReadyGlobal) {
                clearInterval(checkInterval);
                reject(new Error("Local LLM failed to load."));
              }
            }, 200);

            // Timeout of 90 seconds
            const timeout = setTimeout(() => {
              clearInterval(checkInterval);
              reject(new Error("Local LLM download/load timed out."));
            }, 90000);

            if (signal) {
              signal.addEventListener("abort", () => {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                reject(new DOMException("Aborted", "AbortError"));
              });
            }
          });
        }

        // Query the worker
        return new Promise<string>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }

          queryCallbacks = { resolve, reject };
          workerInstance!.postMessage({
            type: "query",
            data: {
              messages,
              systemInstruction,
              modelId: modelId || DEFAULT_CONFIGS.local.modelId,
            },
          });

          // Handle abort signal if provided
          if (signal) {
            const handleAbort = () => {
              if (queryCallbacks) {
                queryCallbacks.reject(new DOMException("Aborted", "AbortError"));
                queryCallbacks = null;
              }
              signal.removeEventListener("abort", handleAbort);
            };
            signal.addEventListener("abort", handleAbort);
          }
        });
      }

      let fetchUrl = "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
        "ngrok-skip-browser-warning": "true",
      };
      let body: any = {};

      if (apiProvider === "gemini") {
        let model = modelId.trim().toLowerCase();
        // Replace spaces with dashes and collapse duplicate dashes
        model = model.replace(/\s+/g, "-").replace(/-+/g, "-");
        if (model.startsWith("models/")) {
          model = model.replace("models/", "");
        }

        // Live API WebSocket connection check
        const isLive = model.endsWith("-live") || model.includes("live");
        if (isLive) {
          // Map Gemini 3 Flash Live or other experimental live models to gemini-2.0-flash
          let liveModel = model;
          if (model.includes("gemini-3") || model.includes("gemini-3-flash") || !model.startsWith("gemini-2")) {
            liveModel = "gemini-2.0-flash";
          }
          return queryGeminiLiveWebSocket(liveModel, apiKey, messages, systemInstruction);
        }

        fetchUrl = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

        // Map messages to Gemini schema
        const contents = messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }));

        body = {
          contents: contents,
        };

        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        // Set JSON schema config if this query requires JSON format (syllabus generation or takeaway)
        const isJSONRequest =
          systemInstruction &&
          (systemInstruction.includes("syllabus") || systemInstruction.includes("JSON"));
        if (isJSONRequest) {
          body.generationConfig = {
            responseMimeType: "application/json",
          };
        }
      } else {
        // OpenAI-compatible endpoint
        fetchUrl = baseUrl.trim();
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        if (fetchUrl.includes("gradio.live")) {
          // Route through local Next.js API proxy to bypass browser CORS
          const lastUserMsg = messages[messages.length - 1]?.content || "";
          const proxyRes = await fetch("/api/gradio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gradioUrl: fetchUrl,
              prompt: lastUserMsg,
              system: systemInstruction || "",
            }),
            signal,
          });

          if (!proxyRes.ok) {
            const errData = await proxyRes.json().catch(() => ({}));
            throw new Error(errData.error || `Gradio proxy error: HTTP ${proxyRes.status}`);
          }

          const proxyData = await proxyRes.json();
          const content = proxyData.choices?.[0]?.message?.content;
          if (!content) throw new Error("Empty response from Gradio proxy");
          return content;
        } else {
          const openAIMessages: { role: string; content: string }[] = [];
          if (systemInstruction) {
            openAIMessages.push({ role: "system", content: systemInstruction });
          }
          messages.forEach((m) => {
            openAIMessages.push({ role: m.role, content: m.content });
          });

          body = {
            model: modelId.trim(),
            messages: openAIMessages,
          };
        }
      }

      try {
        const response = await fetch(fetchUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(body),
          signal: signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || response.statusText || `HTTP ${response.status}`;
          throw new Error(`API returned error (${response.status}): ${errMsg}`);
        }

        const data = await response.json();

        if (apiProvider === "gemini") {
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) throw new Error("Empty response from Gemini API");
          return candidateText;
        } else {
          const choiceText = data.choices?.[0]?.message?.content || (Array.isArray(data.data) ? data.data[0] : null);
          if (!choiceText) throw new Error("Empty response from LLM API");
          return choiceText;
        }
      } catch (e: any) {
        console.error("LLM Query Error:", e);
        throw e;
      }
    },
    [apiProvider, apiKey, modelId, baseUrl]
  );

  return {
    apiProvider,
    apiKey,
    modelId,
    baseUrl,
    isLoaded,
    saveSettings,
    queryLLM,
    localLLMReady,
    localLLMLoading,
    localLLMProgress,
    loadLocalLLM,
  };
}

/**
 * Connects to Gemini's Multimodal Live API over a browser-native WebSocket connection,
 * handles bidirectionally streamed content, aggregates text replies, and resolves.
 */
async function queryGeminiLiveWebSocket(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  systemInstruction: string | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.WebSocket) {
      reject(new Error("WebSockets are not supported or available in this environment."));
      return;
    }

    // Google Gemini Live WebSocket connection URL
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);

    let compiledText = "";
    let isSettled = false;

    // Set fallback timeout for slow networks
    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        ws.close();
        reject(new Error("Gemini Live WebSocket session timed out after 15 seconds."));
      }
    }, 15000);

    ws.onopen = () => {
      // 1. Send connection configuration setup frame
      const setupMsg = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["TEXT"],
          },
          ...(systemInstruction
            ? {
                systemInstruction: {
                  parts: [{ text: systemInstruction }],
                },
              }
            : {}),
        },
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 2. Wait for setupComplete confirmation before sending the content query payload
        if (data.setupComplete) {
          const lastUserMsg = messages[messages.length - 1];
          const clientContentMsg = {
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [{ text: lastUserMsg.content }],
                },
              ],
              turnComplete: true,
            },
          };
          ws.send(JSON.stringify(clientContentMsg));
          return;
        }

        // Capture text chunks streamed from the assistant
        if (data.serverContent?.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.text) {
              compiledText += part.text;
            }
          }
        }

        // Resolve upon turn complete signal
        if (data.serverContent?.turnComplete) {
          isSettled = true;
          clearTimeout(timeout);
          ws.close();
          resolve(compiledText);
        }
      } catch (err) {
        console.error("Error reading WebSocket stream frame:", err);
      }
    };

    ws.onerror = () => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            "WebSocket connection failed. Verify your API key has Google Gemini Live API permissions."
          )
        );
      }
    };

    ws.onclose = (event) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        if (compiledText) {
          resolve(compiledText);
        } else {
          reject(
            new Error(
              `Live session closed unexpectedly by server (code ${event.code}). Please check model availability.`
            )
          );
        }
      }
    };
  });
}

/**
 * Executes text generation using Chrome's native built-in AI (Gemini Nano Prompt API).
 */
async function queryChromeAI(
  messages: ChatMessage[],
  systemInstruction: string | null = null,
  signal?: AbortSignal
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Chrome Built-in AI can only run client-side in the browser.");
  }

  const win = window as any;
  const aiObj = win.ai || win.LanguageModel;

  if (!aiObj) {
    throw new Error(
      "Chrome Built-in AI not detected. Please make sure you are using Google Chrome with flags enabled: chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano"
    );
  }

  // Support varying specification stages (window.ai.languageModel, window.ai.assistant, or window.LanguageModel)
  const lm = aiObj.languageModel || aiObj.assistant || win.LanguageModel || aiObj;

  if (!lm || (typeof lm.create !== "function" && typeof lm !== "function")) {
    throw new Error(
      "Chrome Built-in AI Prompt API is not fully initialized. Check chrome://components to verify Optimization Guide On Device Model is downloaded."
    );
  }

  if (typeof lm.capabilities === "function") {
    try {
      const caps = await lm.capabilities();
      if (caps.available === "no") {
        throw new Error(
          "Chrome Built-in AI (Gemini Nano) is currently unavailable or downloading model weights in the background."
        );
      }
    } catch (e) {
      console.warn("Could not check Chrome AI capabilities:", e);
    }
  }

  // Format messages into conversational context string
  let promptText = "";
  if (systemInstruction) {
    promptText += `System Instruction: ${systemInstruction}\n\n`;
  }
  messages.forEach((m) => {
    promptText += `${m.role === "user" ? "User" : "Assistant"}: ${m.content}\n\n`;
  });
  promptText += "Assistant:";

  try {
    let session: any;
    try {
      session = typeof lm.create === "function" ? await lm.create({ outputLanguage: "en" }) : await lm({ outputLanguage: "en" });
    } catch (e) {
      session = typeof lm.create === "function" ? await lm.create() : await lm();
    }

    try {
      const result = await session.prompt(promptText, { signal });
      const resText = typeof result === "string" ? result : result?.text || JSON.stringify(result);
      return resText;
    } finally {
      if (session && typeof session.destroy === "function") {
        session.destroy();
      }
    }
  } catch (err: any) {
    console.error("Chrome Built-in AI Execution Error:", err);
    const msg = err.message || String(err);
    if (msg.includes("download") || msg.includes("loading")) {
      throw new Error(
        "Chrome AI model weights are currently downloading in the background. Please wait a moment for the download to finish at chrome://components, or switch to 'In-Browser Local LLM' in Settings!"
      );
    }
    throw new Error(`Chrome AI Execution Error: ${msg}. Try restarting Chrome or resetting your session.`);
  }
}



