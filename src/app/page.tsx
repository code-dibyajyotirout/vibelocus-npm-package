"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SyllabusList } from "@/components/SyllabusList";
import { TutorChat } from "@/components/TutorChat";
import { MemoryHub } from "@/components/MemoryHub";
import { SemanticSearch } from "@/components/SemanticSearch";
import { Settings } from "@/components/Settings";
import { ShareModal } from "@/components/ShareModal";
import { useIndexedDB, DrawerRecord } from "@/hooks/useIndexedDB";
import { useLLM, ChatMessage } from "@/hooks/useLLM";
import { useSpeech } from "@/hooks/useSpeech";
import { sanitizeInput } from "@/utils/security";
import { getShareDataFromUrl } from "@/utils/shareLink";

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("learn");
  const [currentTopic, setCurrentTopic] = useState<string>("");
  const [syllabus, setSyllabus] = useState<Subtopic[]>([]);
  const [activeSubtopic, setActiveSubtopic] = useState<Subtopic | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [learningHistory, setLearningHistory] = useState<HistoryItem[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Mobile detail view toggle
  const [showMobileChat, setShowMobileChat] = useState(false);

  const handleShowMobileChatChange = (val: boolean) => {
    setShowMobileChat(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_show_mobile_chat", String(val));
    }
  };

  // Loading States
  const [isGeneratingSyllabus, setIsGeneratingSyllabus] = useState(false);
  const [isQueryingTutor, setIsQueryingTutor] = useState(false);
  const [isSavingConcept, setIsSavingConcept] = useState(false);
  const [isExportingEpub, setIsExportingEpub] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isFallbackSyllabus, setIsFallbackSyllabus] = useState(false);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);

  // Model States
  const [isModelReady, setIsModelReady] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  const embedderRef = useRef<any>(null);
  const syllabusAbortControllerRef = useRef<AbortController | null>(null);

  // Client-side adapters
  const db = useIndexedDB();
  const llm = useLLM();
  const tts = useSpeech();

  // Backfill missing embeddings for drawers
  const backfillEmbeddings = useCallback(async () => {
    if (!embedderRef.current) return;
    try {
      const drawers = await db.getAllDrawers();
      const missingDrawers = drawers.filter(
        (d) => !d.embedding || d.embedding.length === 0
      );
      if (missingDrawers.length === 0) return;

      console.log(`Backfilling embeddings for ${missingDrawers.length} drawers...`);
      for (const d of missingDrawers) {
        const decompressed = db.LZString.decompressFromUTF16(d.compressedContent);
        if (!decompressed) continue;
        const textToEmbed = `${d.room}: ${decompressed}`;
        const output = await embedderRef.current(textToEmbed, { pooling: "mean", normalize: true });
        const embedding = Array.from(output.data) as number[];
        await db.addDrawer({
          ...d,
          embedding,
        });
      }
      console.log("Backfill complete.");
    } catch (e) {
      console.error("Error backfilling embeddings:", e);
    }
  }, [db]);

  // Load embedding model core
  const loadEmbeddingModel = useCallback(async () => {
    if (isModelReady || isModelLoading) return;
    setIsModelLoading(true);
    setModelLoadProgress(0);

    try {
      const { pipeline, env } = await import(
        /* webpackIgnore: true */
        // @ts-ignore
        "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
      );
      env.allowLocalModels = false;

      embedderRef.current = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        progress_callback: (data: any) => {
          if (data.status === "progress") {
            setModelLoadProgress(Math.round(data.progress));
          }
        },
      });

      setIsModelReady(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_memory_ai_activated", "true");
      }
    } catch (err) {
      console.error("Error loading embedding model:", err);
      alert("Memory AI Core activation failed. Please check network connectivity and try again.");
    } finally {
      setIsModelLoading(false);
    }
  }, [isModelReady, isModelLoading]);

  // Compute text vector embedding
  const computeTextEmbedding = useCallback(
    async (text: string): Promise<number[] | null> => {
      if (!isModelReady || !embedderRef.current) return null;
      try {
        const output = await embedderRef.current(text, { pooling: "mean", normalize: true });
        return Array.from(output.data);
      } catch (err) {
        console.error("Embedding generation error:", err);
        return null;
      }
    },
    [isModelReady]
  );

  // Compute cosine similarity
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

  // Compile unique wings and stats for learning history
  const refreshLearningHistory = useCallback(async () => {
    try {
      const drawers = await db.getAllDrawers();
      const uniqueWings = [...new Set(drawers.map((d) => d.wing))].filter(Boolean);

      const items: HistoryItem[] = uniqueWings.map((wing) => {
        const wingDrawers = drawers.filter((d) => d.wing === wing);
        const rooms = [...new Set(wingDrawers.map((d) => d.room))];
        const notesCount = wingDrawers.filter(
          (d) => d.drawer !== "Overview" && d.drawer !== "Conversation Transcript"
        ).length;
        return {
          wing,
          roomsCount: rooms.length,
          notesCount,
        };
      });

      setLearningHistory(items);
    } catch (e) {
      console.error("Failed to refresh learning history:", e);
    }
  }, [db]);

  // Restore State on Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if URL contains share data fragment
      const sharedData = getShareDataFromUrl();
      if (sharedData) {
        if (sharedData.topic) {
          setCurrentTopic(sharedData.topic);
          localStorage.setItem("vibe_current_topic", sharedData.topic);
        }
        if (sharedData.syllabus && sharedData.syllabus.length > 0) {
          setSyllabus(sharedData.syllabus);
          localStorage.setItem("vibe_syllabus", JSON.stringify(sharedData.syllabus));
        }
        if (sharedData.activeSubtopicTitle && sharedData.syllabus) {
          const matchSub = sharedData.syllabus.find((s) => s.title === sharedData.activeSubtopicTitle);
          if (matchSub) {
            setActiveSubtopic(matchSub);
            localStorage.setItem("vibe_active_subtopic", JSON.stringify(matchSub));
            setShowMobileChat(true);
          }
        }
        if (sharedData.chatHistory) {
          setChatHistory(sharedData.chatHistory);
        }
        if (sharedData.drawers && sharedData.drawers.length > 0) {
          sharedData.drawers.forEach((d) => {
            db.addDrawer({
              wing: d.wing,
              room: d.room,
              drawer: d.drawer,
              compressedContent: d.compressedContent,
              embedding: null,
              rawSize: d.rawSize,
              compressedSize: d.compressedSize,
              createdAt: d.createdAt || Date.now(),
            });
          });
        }
        // Clean URL hash so user has a clean URL bar
        window.history.replaceState(null, "", window.location.pathname);
        setTimeout(() => {
          alert(`Successfully restored learning session for "${sharedData.topic}" from shared URL!`);
        }, 300);
        return;
      }

      const savedTab = localStorage.getItem("vibe_active_tab");
      if (savedTab) setActiveTab(savedTab);

      const savedTopic = localStorage.getItem("vibe_current_topic");
      const savedSyllabusStr = localStorage.getItem("vibe_syllabus");
      const savedSubtopicStr = localStorage.getItem("vibe_active_subtopic");

      if (savedTopic) setCurrentTopic(savedTopic);
      if (savedSyllabusStr) {
        try {
          setSyllabus(JSON.parse(savedSyllabusStr));
        } catch {}
      }
      if (savedSubtopicStr) {
        try {
          const sub = JSON.parse(savedSubtopicStr);
          setActiveSubtopic(sub);
          const savedShowMobile = localStorage.getItem("vibe_show_mobile_chat");
          if (savedShowMobile === "true" || savedShowMobile === null) {
            setShowMobileChat(true);
          }
          if (savedTopic) {
            db.getAllDrawers().then((drawers) => {
              const existingTranscript = drawers.find(
                (d) =>
                  d.wing === savedTopic &&
                  d.room === sub.title &&
                  d.drawer === "Conversation Transcript"
              );
              if (existingTranscript) {
                const decompressed = db.LZString.decompressFromUTF16(existingTranscript.compressedContent);
                if (decompressed) {
                  setChatHistory(JSON.parse(decompressed));
                }
              }
            });
          }
        } catch {}
      }

    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-activate Memory AI on page load if previously activated
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMemoryAIActivated = localStorage.getItem("vibe_memory_ai_activated") === "true";
      if (isMemoryAIActivated) {
        loadEmbeddingModel();
      }
    }
  }, [loadEmbeddingModel]);

  // Trigger backfill when embedding model becomes ready
  useEffect(() => {
    if (isModelReady) {
      backfillEmbeddings();
    }
  }, [isModelReady, backfillEmbeddings]);

  // Prevent accidental reload when actively chatting
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSubtopic) {
        e.preventDefault();
        e.returnValue = "You have an active learning session in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeSubtopic]);

  // Sync tab updates
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_active_tab", tab);
    }
    tts.stop();
  };

  // Syllabus Parsing Helper (Resilient to LLM Markdown & Syntax variations)
  const extractJSON = (text: string) => {
    try {
      // Strip markdown code fences (```json ... ```)
      let cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        cleaned = match[0];
      }
      // Strip trailing commas before closing braces/brackets
      cleaned = cleaned.replace(/,\s*([\}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parsing error:", text);
      throw new Error("Syllabus format was invalid. Please try generating again.");
    }
  };

  // Generate Syllabus via API
  const generateSyllabus = async (topic: string) => {
    setIsGeneratingSyllabus(true);
    setCurrentTopic(topic);
    setSyllabus([]);
    setIsFallbackSyllabus(false);
    setSyllabusError(null);
    setActiveSubtopic(null);
    setChatHistory([]);

    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_current_topic", topic);
      localStorage.removeItem("vibe_active_subtopic");
    }

    const systemInstruction = `You are a world-class educational designer. Create a learning syllabus structure containing 4 to 6 logical subtopics to teach a student about: "${topic}".
Return ONLY a valid JSON object matching the required format. Do not wrap in markdown or add notes.
Required JSON format:
{
  "subtopics": [
    {
      "title": "Subtopic Title",
      "description": "Engaging 1-sentence summary of what this subtopic teaches.",
      "estimated_minutes": 15
    }
  ]
}`;

    const userPrompt = `Generate the structured syllabus for topic: "${topic}".`;

    if (syllabusAbortControllerRef.current) {
      syllabusAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    syllabusAbortControllerRef.current = controller;

    try {
      const reply = await llm.queryLLM([{ role: "user", content: userPrompt }], systemInstruction, controller.signal);
      const parsed = extractJSON(reply);

      if (!parsed.subtopics || !Array.isArray(parsed.subtopics)) {
        throw new Error("Parsed syllabus did not match the subtopics layout.");
      }

      setSyllabus(parsed.subtopics);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(parsed.subtopics));
      }

      // Auto-save overview notes for each room
      const existingDrawers = await db.getAllDrawers();
      for (const sub of parsed.subtopics) {
        const compressed = db.LZString.compressToUTF16(sub.description);
        let embedding = null;
        if (isModelReady) {
          embedding = await computeTextEmbedding(`${sub.title}: ${sub.description}`);
        }
        const existing = existingDrawers.find(
          (d) =>
            d.wing === topic &&
            d.room === sub.title &&
            d.drawer === "Overview"
        );
        await db.addDrawer({
          ...(existing ? { id: existing.id } : {}),
          wing: topic,
          room: sub.title,
          drawer: "Overview",
          compressedContent: compressed,
          embedding,
          rawSize: new Blob([sub.description]).size,
          compressedSize: new Blob([compressed]).size,
          createdAt: Date.now(),
        });
      }

      await refreshLearningHistory();
    } catch (e: any) {
      if (e.name === "AbortError" || e.message === "Aborted" || controller.signal.aborted) {
        console.log("Syllabus generation aborted by user.");
        return;
      }
      console.warn("AI Syllabus generation failed, building fallback syllabus structure:", e);
      setIsFallbackSyllabus(true);
      setSyllabusError(e.message || "Could not reach AI model. Check Settings.");
      // Fallback syllabus generator
      const fallbackSubtopics = [
        {
          title: "Foundational Concepts",
          description: `Core principles, design rules, and introduction to the fundamentals of ${topic}.`,
          estimated_minutes: 15,
        },
        {
          title: "System Setup & Configuration",
          description: `Setting up the local workspace, environment configs, and basic integrations for ${topic}.`,
          estimated_minutes: 15,
        },
        {
          title: "Workflow & Operations",
          description: `Exploring key mechanics, control structures, and standard procedures inside ${topic}.`,
          estimated_minutes: 20,
        },
        {
          title: "Implementation & Use Cases",
          description: `Building sample scenarios, hands-on coding, and deploying practical designs with ${topic}.`,
          estimated_minutes: 25,
        },
        {
          title: "Advanced Optimization",
          description: `Auditing performance, safety policies, and mastering scaling behaviors for ${topic}.`,
          estimated_minutes: 20,
        },
      ];

      setSyllabus(fallbackSubtopics);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(fallbackSubtopics));
      }

      // Save fallback overview drawers
      const existingFallbackDrawers = await db.getAllDrawers();
      for (const sub of fallbackSubtopics) {
        const compressed = db.LZString.compressToUTF16(sub.description);
        let embedding = null;
        if (isModelReady) {
          embedding = await computeTextEmbedding(`${sub.title}: ${sub.description}`);
        }
        const existing = existingFallbackDrawers.find(
          (d) =>
            d.wing === topic &&
            d.room === sub.title &&
            d.drawer === "Overview"
        );
        await db.addDrawer({
          ...(existing ? { id: existing.id } : {}),
          wing: topic,
          room: sub.title,
          drawer: "Overview",
          compressedContent: compressed,
          embedding,
          rawSize: new Blob([sub.description]).size,
          compressedSize: new Blob([compressed]).size,
          createdAt: Date.now(),
        });
      }
      await refreshLearningHistory();
    } finally {
      if (syllabusAbortControllerRef.current === controller) {
        setIsGeneratingSyllabus(false);
        syllabusAbortControllerRef.current = null;
      }
    }
  };

  // Generate Syllabus from Document
  const generateSyllabusFromDocument = async (text: string, fileName: string) => {
    setIsGeneratingSyllabus(true);
    const docTopicName = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    setCurrentTopic(docTopicName);
    setSyllabus([]);
    setActiveSubtopic(null);
    setChatHistory([]);

    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_current_topic", docTopicName);
      localStorage.removeItem("vibe_active_subtopic");
    }

    const chunkForSyllabus = text.substring(0, 8000);
    const systemInstruction = `You are a world-class educational designer. Analyze the following document excerpt and create a learning syllabus containing 4 to 6 logical subtopics that cover the key concepts from this document.
The document is titled: "${fileName}".
Document excerpt:
---
${chunkForSyllabus}
---
Return ONLY a valid JSON object. Do not wrap in markdown.
Required JSON format:
{
  "subtopics": [
    {
      "title": "Subtopic Title",
      "description": "Engaging 1-sentence summary of what this subtopic teaches from the document.",
      "estimated_minutes": 15
    }
  ]
}`;

    if (syllabusAbortControllerRef.current) {
      syllabusAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    syllabusAbortControllerRef.current = controller;

    try {
      const reply = await llm.queryLLM(
        [{ role: "user", content: "Generate syllabus from document." }],
        systemInstruction,
        controller.signal
      );
      const parsed = extractJSON(reply);

      if (!parsed.subtopics || !Array.isArray(parsed.subtopics)) {
        throw new Error("Parsed syllabus did not match the subtopics layout.");
      }

      setSyllabus(parsed.subtopics);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(parsed.subtopics));
      }

      // Get all drawers to check for duplicates
      const drawers = await db.getAllDrawers();

      // Save complete raw document as Source Document drawer node
      const compressedDoc = db.LZString.compressToUTF16(text);
      let docEmbedding = null;
      if (isModelReady) {
        docEmbedding = await computeTextEmbedding(text.substring(0, 2000));
      }

      const existingDoc = drawers.find(
        (d) =>
          d.wing === docTopicName &&
          d.room === "_Source Document_" &&
          d.drawer === "Uploaded Document"
      );

      await db.addDrawer({
        ...(existingDoc ? { id: existingDoc.id } : {}),
        wing: docTopicName,
        room: "_Source Document_",
        drawer: "Uploaded Document",
        compressedContent: compressedDoc,
        embedding: docEmbedding,
        rawSize: new Blob([text]).size,
        compressedSize: new Blob([compressedDoc]).size,
        createdAt: Date.now(),
      });

      // Save subtopic overview entries
      for (const sub of parsed.subtopics) {
        const compressedSub = db.LZString.compressToUTF16(sub.description);
        let subEmbedding = null;
        if (isModelReady) {
          subEmbedding = await computeTextEmbedding(`${sub.title}: ${sub.description}`);
        }

        const existingSub = drawers.find(
          (d) =>
            d.wing === docTopicName &&
            d.room === sub.title &&
            d.drawer === "Overview"
        );

        await db.addDrawer({
          ...(existingSub ? { id: existingSub.id } : {}),
          wing: docTopicName,
          room: sub.title,
          drawer: "Overview",
          compressedContent: compressedSub,
          embedding: subEmbedding,
          rawSize: new Blob([sub.description]).size,
          compressedSize: new Blob([compressedSub]).size,
          createdAt: Date.now(),
        });
      }

      await refreshLearningHistory();
    } catch (e: any) {
      if (e.name === "AbortError" || e.message === "Aborted" || controller.signal.aborted) {
        console.log("Document syllabus generation aborted by user.");
        return;
      }
      console.warn("Document syllabus parsing failed, building fallback course outline:", e);
      
      const fallbackSubtopics = [
        {
          title: "Document Introduction",
          description: `Key definitions, primary highlights, and scope covered inside ${docTopicName}.`,
          estimated_minutes: 15,
        },
        {
          title: "Core System Setup",
          description: `Environment configurations, dependencies, and bootstrap guidelines related to ${docTopicName}.`,
          estimated_minutes: 15,
        },
        {
          title: "Document Core Mechanics",
          description: `Detailed analysis of primary algorithms, rules, and core designs explained in ${docTopicName}.`,
          estimated_minutes: 20,
        },
        {
          title: "Use Cases & Workflows",
          description: `Demonstrations, practical implementations, and task execution workflows outlined in ${docTopicName}.`,
          estimated_minutes: 25,
        },
        {
          title: "Advanced Optimization & Takeaways",
          description: `Scaling limits, security practices, and final summary recommendations from ${docTopicName}.`,
          estimated_minutes: 20,
        },
      ];

      setSyllabus(fallbackSubtopics);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(fallbackSubtopics));
      }

      // Get all drawers to check for duplicates
      const drawers = await db.getAllDrawers();

      // Save complete raw document as Source Document drawer node
      const compressedDoc = db.LZString.compressToUTF16(text);
      let docEmbedding = null;
      if (isModelReady) {
        docEmbedding = await computeTextEmbedding(text.substring(0, 2000));
      }

      const existingDoc = drawers.find(
        (d) =>
          d.wing === docTopicName &&
          d.room === "_Source Document_" &&
          d.drawer === "Uploaded Document"
      );

      await db.addDrawer({
        ...(existingDoc ? { id: existingDoc.id } : {}),
        wing: docTopicName,
        room: "_Source Document_",
        drawer: "Uploaded Document",
        compressedContent: compressedDoc,
        embedding: docEmbedding,
        rawSize: new Blob([text]).size,
        compressedSize: new Blob([compressedDoc]).size,
        createdAt: Date.now(),
      });

      // Save subtopic overview entries
      for (const sub of fallbackSubtopics) {
        const compressedSub = db.LZString.compressToUTF16(sub.description);
        let subEmbedding = null;
        if (isModelReady) {
          subEmbedding = await computeTextEmbedding(`${sub.title}: ${sub.description}`);
        }

        const existingSub = drawers.find(
          (d) =>
            d.wing === docTopicName &&
            d.room === sub.title &&
            d.drawer === "Overview"
        );

        await db.addDrawer({
          ...(existingSub ? { id: existingSub.id } : {}),
          wing: docTopicName,
          room: sub.title,
          drawer: "Overview",
          compressedContent: compressedSub,
          embedding: subEmbedding,
          rawSize: new Blob([sub.description]).size,
          compressedSize: new Blob([compressedSub]).size,
          createdAt: Date.now(),
        });
      }
      await refreshLearningHistory();
    } finally {
      if (syllabusAbortControllerRef.current === controller) {
        setIsGeneratingSyllabus(false);
        syllabusAbortControllerRef.current = null;
      }
    }
  };

  const cancelSyllabus = () => {
    if (syllabusAbortControllerRef.current) {
      syllabusAbortControllerRef.current.abort();
      setIsGeneratingSyllabus(false);
      syllabusAbortControllerRef.current = null;
    }
  };

  // Select a subtopic / room card
  const selectSubtopic = async (sub: Subtopic, overrideTopic?: string) => {
    const topicToUse = overrideTopic || currentTopic;
    setActiveSubtopic(sub);
    setChatHistory([]);
    handleShowMobileChatChange(true);

    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_active_subtopic", JSON.stringify(sub));
    }

    // Auto-awaken models in the background
    if (!isModelReady && !isModelLoading) {
      loadEmbeddingModel();
    }

    try {
      const drawers = await db.getAllDrawers();
      // Locate historical room transcripts if any
      const existingTranscript = drawers.find(
        (d) =>
          d.wing === topicToUse &&
          d.room === sub.title &&
          d.drawer === "Conversation Transcript"
      );

      if (existingTranscript) {
        const decompressed = db.LZString.decompressFromUTF16(existingTranscript.compressedContent);
        if (decompressed) {
          setChatHistory(JSON.parse(decompressed));
          return;
        }
      }
    } catch (err) {
      console.warn("Error restoring history transcript, loading fresh:", err);
    }

    setIsQueryingTutor(true);
    const systemPrompt = `=== LIVED-IN LEARNING INSTRUCTIONS ===
ROLE: You are an expert personal tutor specializing in: "${sub.title}" (Parent Course: "${topicToUse}").

MISSION:
Your goal is to guide the student to build COMPREHENSIVE knowledge and complete, exhaustive mastery of "${sub.title}" by the end of this dialogue session.

BOUNDARY DIRECTIVE:
You are strictly LOCKED to the subtopic: "${sub.title}". If the student asks about concepts outside of this subtopic, explain politely that you are locked into this specific focus and direct them back to the active topic.

PEDAGOGICAL DESIGN GUIDELINES:
1. COMPREHATIVE LEARNING: Deliver thorough, high-fidelity educational content. Do not summarize or simplify to the point of losing critical academic details.
2. DYNAMIC ANALOGIES: Always anchor abstract or complex ideas using relatable, vivid real-world analogies.
3. VISUAL ASCII SCHEMATICS: Frequently generate drawings, charts, structure models, or process flows using text symbols and characters (such as arrows, brackets, blocks, lines, or detailed ASCII sketches representing physical anatomy like hands, human body, or computing systems).
4. DIGESTIBLE MICRO-PACING: Deliver your knowledge in structured steps. Present a single concept or block of information at a time so it remains digestible and clean to read.
5. PROGRESSIVE PROBING: Always finish your response by testing/probing the student's understanding of the concept just explained. Ask them if they are ready to proceed to the next milestone, or if they have questions.

GREETING OBJECTIVE:
- Greet the student enthusiastically.
- Outline a clear, comprehensive learning path containing the milestones needed to master "${sub.title}".
- Probe their baseline understanding to initiate the learning dialogue.`;

    try {
      const welcomeText = await llm.queryLLM([{ role: "user", content: "Begin teaching." }], systemPrompt);
      const greetingMsg: ChatMessage = { role: "assistant", content: welcomeText };
      setChatHistory([greetingMsg]);

      // Save initial greeting
      const historyStr = JSON.stringify([greetingMsg]);
      const compressed = db.LZString.compressToUTF16(historyStr);
      let embedding = null;
      if (isModelReady) {
        embedding = await computeTextEmbedding(`Tutor: ${welcomeText}`);
      }
      await db.addDrawer({
        wing: topicToUse,
        room: sub.title,
        drawer: "Conversation Transcript",
        compressedContent: compressed,
        embedding,
        rawSize: new Blob([historyStr]).size,
        compressedSize: new Blob([compressed]).size,
        createdAt: Date.now(),
      });
      await refreshLearningHistory();
    } catch (e: any) {
      console.error(e);
      setChatHistory([
        {
          role: "system",
          content: `Failed to start tutoring session: ${e.message}\n\nPlease verify your API key and model selection under settings, or try again in a minute if you exceeded your rate limits.`,
        },
      ]);
    } finally {
      setIsQueryingTutor(false);
    }
  };

  // Send message inside locked chat room
  const sendChatMessage = async (text: string) => {
    if (!activeSubtopic) return;

    const sanitized = sanitizeInput(text);
    const userMsg: ChatMessage = { role: "user", content: sanitized };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setIsQueryingTutor(true);

    // Save user's message immediately to IndexedDB so they don't lose it on reload
    try {
      const historyStr = JSON.stringify(updatedHistory);
      const compressed = db.LZString.compressToUTF16(historyStr);
      let embedding = null;
      if (isModelReady) {
        const textToEmbed = updatedHistory
          .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
          .join("\n");
        embedding = await computeTextEmbedding(textToEmbed);
      }
      const drawers = await db.getAllDrawers();
      const existing = drawers.find(
        (d) =>
          d.wing === currentTopic &&
          d.room === activeSubtopic.title &&
          d.drawer === "Conversation Transcript"
      );
      const record: DrawerRecord = {
        wing: currentTopic,
        room: activeSubtopic.title,
        drawer: "Conversation Transcript",
        compressedContent: compressed,
        embedding: embedding,
        rawSize: new Blob([historyStr]).size,
        compressedSize: new Blob([compressed]).size,
        createdAt: Date.now(),
      };
      if (existing) {
        record.id = existing.id;
      }
      await db.addDrawer(record);
    } catch (err) {
      console.warn("Failed to auto-save user chat history pre-query:", err);
    }

    let contextualPayload = [...updatedHistory];

    // Local RAG Context Retrieval
    if (isModelReady) {
      try {
        const queryEmbedding = await computeTextEmbedding(sanitized);
        const drawers = await db.getAllDrawers();
        if (drawers.length > 0 && queryEmbedding) {
          const scored = drawers
            .map((d) => {
              const score = d.embedding ? cosineSimilarity(queryEmbedding, d.embedding) : 0;
              return { ...d, score };
            })
            .filter((d) => d.score > 0.65); // high relevance threshold

          scored.sort((a, b) => b.score - a.score);

          if (scored.length > 0) {
            const topMatch = scored[0];
            const decompressedMatch = db.LZString.decompressFromUTF16(topMatch.compressedContent);
            let contextText = "";

            if (topMatch.drawer === "Conversation Transcript") {
              try {
                const parsedHistory = JSON.parse(decompressedMatch);
                const dialogueStr = parsedHistory
                  .map((m: ChatMessage) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
                  .join("\n");
                contextText = `[Memory Hub Recall: The user previously had this relevant conversation in the Room "${topMatch.room}":\n${dialogueStr}\nUse this past conversation context to inform your response.]`;
              } catch {
                contextText = `[Memory Hub Recall: The user previously saved this relevant concept in their Memory Hub drawer "${topMatch.drawer}" under Room "${topMatch.room}":\n"${decompressedMatch}"\nIf relevant, build upon or reference this memory in your answer.]`;
              }
            } else {
              contextText = `[Memory Hub Recall: The user previously saved this relevant concept in their Memory Hub drawer "${topMatch.drawer}" under Room "${topMatch.room}":\n"${decompressedMatch}"\nIf relevant, build upon or reference this memory in your answer.]`;
            }

            // Prepend contextual instruction to last message payload safely
            contextualPayload[contextualPayload.length - 1] = {
              role: "user",
              content: `${contextText}\n\nUser Message: ${sanitized}`,
            };
            console.log(
              `Retrieved context from Memory Hub: "${topMatch.drawer}" (score: ${Math.round(
                topMatch.score * 100
              )}%)`
            );
          }
        }
      } catch (err) {
        console.warn("Failed to retrieve context from Memory Hub:", err);
      }
    }

    const systemPrompt = `=== LIVED-IN LEARNING INSTRUCTIONS ===
ROLE: You are an expert personal tutor specializing in: "${activeSubtopic.title}" (Parent Course: "${currentTopic}").

MISSION:
Your goal is to guide the student to build COMPREHENSIVE knowledge and complete, exhaustive mastery of "${activeSubtopic.title}" by the end of this dialogue session.

BOUNDARY DIRECTIVE:
You are strictly LOCKED to the subtopic: "${activeSubtopic.title}". If the student goes off track or asks about concepts outside of this subtopic, explain politely that you are locked into this specific focus and direct them back to the active topic.

PEDAGOGICAL DESIGN GUIDELINES:
1. COMPREHENSIVE LEARNING: Deliver thorough, high-fidelity educational content. Do not summarize or simplify to the point of losing critical academic details.
2. DYNAMIC ANALOGIES: Always anchor abstract or complex ideas using relatable, vivid real-world analogies.
3. VISUAL ASCII SCHEMATICS: Frequently generate drawings, charts, structure models, or process flows using text symbols and characters (such as arrows, brackets, blocks, lines, or detailed ASCII sketches representing physical anatomy like hands, human body, or computing systems).
4. DIGESTIBLE MICRO-PACING: Deliver your knowledge in structured steps. Present a single concept or block of information at a time so it remains digestible and clean to read. Do not dump a wall of text all at once, but do not compromise on depth.
5. PROGRESSIVE PROBING: Always finish your response by testing/probing the student's understanding of the concept just explained. Ask them if they understand, and check if they are ready to proceed to the next milestone, or if they have questions.`;

    try {
      const reply = await llm.queryLLM(contextualPayload, systemPrompt);
      const aiReply: ChatMessage = { role: "assistant", content: reply };
      const finalHistory = [...updatedHistory, aiReply];
      setChatHistory(finalHistory);

      // Save transcript updates to IndexedDB
      const historyStr = JSON.stringify(finalHistory);
      const compressed = db.LZString.compressToUTF16(historyStr);
      let embedding = null;
      if (isModelReady) {
        const textToEmbed = finalHistory
          .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
          .join("\n");
        embedding = await computeTextEmbedding(textToEmbed);
      }

      // Query database if record already exists to retain key
      const drawers = await db.getAllDrawers();
      const existing = drawers.find(
        (d) =>
          d.wing === currentTopic &&
          d.room === activeSubtopic.title &&
          d.drawer === "Conversation Transcript"
      );

      const record: DrawerRecord = {
        wing: currentTopic,
        room: activeSubtopic.title,
        drawer: "Conversation Transcript",
        compressedContent: compressed,
        embedding: embedding,
        rawSize: new Blob([historyStr]).size,
        compressedSize: new Blob([compressed]).size,
        createdAt: Date.now(),
      };

      if (existing) {
        record.id = existing.id;
      }

      await db.addDrawer(record);
      await refreshLearningHistory();
    } catch (e: any) {
      alert(`Error querying tutor: ${e.message}`);
    } finally {
      setIsQueryingTutor(false);
    }
  };

  // Reset Session dialogue fresh
  const resetSession = async () => {
    if (!activeSubtopic) return;
    try {
      const drawers = await db.getAllDrawers();
      const existing = drawers.find(
        (d) =>
          d.wing === currentTopic &&
          d.room === activeSubtopic.title &&
          d.drawer === "Conversation Transcript"
      );
      if (existing && existing.id !== undefined) {
        await db.deleteDrawer(existing.id);
      }
    } catch (e) {
      console.warn(e);
    }
    await selectSubtopic(activeSubtopic);
  };

  // Progressive subtopic traversal
  const goToNextTopic = async () => {
    if (!activeSubtopic || syllabus.length === 0) return;
    const currentIdx = syllabus.findIndex((s) => s.title === activeSubtopic.title);
    if (currentIdx !== -1 && currentIdx < syllabus.length - 1) {
      const nextSub = syllabus[currentIdx + 1];
      await selectSubtopic(nextSub);
    }
  };

  // Autoreduce bubble to study takeaway note card
  const saveDialogueTakeaway = async (aiText: string, btnId: string) => {
    if (!currentTopic || !activeSubtopic) return;

    const prompt = `You are a memory processor. Condense this explanation into a concise note for a study drawer.
Extract the core insight.
Text: "${aiText}"
Return ONLY a valid JSON object matching the required format. No markdown wrap.
Format:
{
  "title": "Short Concept Title",
  "summary": "1 or 2 sentence explanation of the concept."
}`;

    try {
      const reply = await llm.queryLLM([{ role: "user", content: "Process text." }], prompt);
      const parsed = extractJSON(reply);

      const conceptTitle = parsed.title || "Key Takeaway";
      const conceptSummary = parsed.summary || aiText;

      const compressed = db.LZString.compressToUTF16(conceptSummary);
      let embedding = null;
      if (isModelReady) {
        embedding = await computeTextEmbedding(`${conceptTitle}: ${conceptSummary}`);
      }

      await db.addDrawer({
        wing: currentTopic,
        room: activeSubtopic.title,
        drawer: conceptTitle,
        compressedContent: compressed,
        embedding: embedding,
        rawSize: new Blob([conceptSummary]).size,
        compressedSize: new Blob([compressed]).size,
        createdAt: Date.now(),
      });

      await refreshLearningHistory();
    } catch (e: any) {
      throw new Error(`Failed to save takeaway: ${e.message}`);
    }
  };

  // Manual save concept form submit
  const saveManualConcept = async (title: string, body: string) => {
    if (!currentTopic || !activeSubtopic) return;
    setIsSavingConcept(true);
    try {
      const compressed = db.LZString.compressToUTF16(body);
      let embedding = null;
      if (isModelReady) {
        embedding = await computeTextEmbedding(`${title}: ${body}`);
      }

      await db.addDrawer({
        wing: currentTopic,
        room: activeSubtopic.title,
        drawer: title,
        compressedContent: compressed,
        embedding,
        rawSize: new Blob([body]).size,
        compressedSize: new Blob([compressed]).size,
        createdAt: Date.now(),
      });

      await refreshLearningHistory();
      alert("Manual Memory Drawer saved successfully!");
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSavingConcept(false);
    }
  };

  // Resume Session Shortcut from Memory Palace drawer card click
  const resumeSessionFromDrawer = async (record: DrawerRecord) => {
    setCurrentTopic(record.wing);
    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_current_topic", record.wing);
    }

    try {
      const drawers = await db.getAllDrawers();
      const overviews = drawers.filter((d) => d.wing === record.wing && d.drawer === "Overview");

      let syllabusList: Subtopic[] = [];
      if (overviews.length > 0) {
        const seenRooms = new Set<string>();
        syllabusList = overviews
          .filter((o) => {
            if (!o.room || seenRooms.has(o.room) || o.room === "_Source Document_") return false;
            seenRooms.add(o.room);
            return true;
          })
          .map((o) => ({
            title: o.room,
            description: db.LZString.decompressFromUTF16(o.compressedContent) || "",
            estimated_minutes: 10,
          }));
      } else {
        const rooms = [...new Set(drawers.filter((d) => d.wing === record.wing).map((d) => d.room))];
        const cleanRooms = rooms.filter((r) => r && r !== "_Source Document_");
        syllabusList = cleanRooms.map((r) => ({
          title: r,
          description: "Restored room session.",
          estimated_minutes: 10,
        }));
      }

      setSyllabus(syllabusList);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(syllabusList));
      }

      const matchIdx = syllabusList.findIndex((s) => s.title === record.room);
      const activeTargetSub = matchIdx !== -1 ? syllabusList[matchIdx] : syllabusList[0];

      setActiveTab("learn");
      if (activeTargetSub) {
        await selectSubtopic(activeTargetSub, record.wing);
      }
    } catch (e) {
      console.error("Resume from drawer shortcut failed:", e);
    }
  };

  // Resume wing session directly
  const resumeTopicShortcut = async (wing: string) => {
    setCurrentTopic(wing);
    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_current_topic", wing);
    }

    try {
      const drawers = await db.getAllDrawers();
      const overviews = drawers.filter((d) => d.wing === wing && d.drawer === "Overview");

      let syllabusList: Subtopic[] = [];
      if (overviews.length > 0) {
        const seenRooms = new Set<string>();
        syllabusList = overviews
          .filter((o) => {
            if (!o.room || seenRooms.has(o.room) || o.room === "_Source Document_") return false;
            seenRooms.add(o.room);
            return true;
          })
          .map((o) => ({
            title: o.room,
            description: db.LZString.decompressFromUTF16(o.compressedContent) || "",
            estimated_minutes: 10,
          }));
      } else {
        const rooms = [...new Set(drawers.filter((d) => d.wing === wing).map((d) => d.room))];
        const cleanRooms = rooms.filter((r) => r && r !== "_Source Document_");
        syllabusList = cleanRooms.map((r) => ({
          title: r,
          description: "Restored room session.",
          estimated_minutes: 10,
        }));
      }

      setSyllabus(syllabusList);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(syllabusList));
      }

      setActiveTab("learn");
      if (syllabusList.length > 0) {
        await selectSubtopic(syllabusList[0], wing);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Resume specific room session
  const resumeRoomShortcut = async (wing: string, room: string) => {
    setCurrentTopic(wing);
    if (typeof window !== "undefined") {
      localStorage.setItem("vibe_current_topic", wing);
    }

    try {
      const drawers = await db.getAllDrawers();
      const overviews = drawers.filter((d) => d.wing === wing && d.drawer === "Overview");

      let syllabusList: Subtopic[] = [];
      if (overviews.length > 0) {
        const seenRooms = new Set<string>();
        syllabusList = overviews
          .filter((o) => {
            if (!o.room || seenRooms.has(o.room) || o.room === "_Source Document_") return false;
            seenRooms.add(o.room);
            return true;
          })
          .map((o) => ({
            title: o.room,
            description: db.LZString.decompressFromUTF16(o.compressedContent) || "",
            estimated_minutes: 10,
          }));
      } else {
        const rooms = [...new Set(drawers.filter((d) => d.wing === wing).map((d) => d.room))];
        const cleanRooms = rooms.filter((r) => r && r !== "_Source Document_");
        syllabusList = cleanRooms.map((r) => ({
          title: r,
          description: "Restored room session.",
          estimated_minutes: 10,
        }));
      }

      setSyllabus(syllabusList);
      if (typeof window !== "undefined") {
        localStorage.setItem("vibe_syllabus", JSON.stringify(syllabusList));
      }

      const matchIdx = syllabusList.findIndex((s) => s.title === room);
      const targetSub = matchIdx !== -1 ? syllabusList[matchIdx] : syllabusList[0];

      setActiveTab("learn");
      if (targetSub) {
        await selectSubtopic(targetSub, wing);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Gather Course Data structure for compilation exports
  const gatherCourseData = async () => {
    if (!currentTopic || syllabus.length === 0) {
      alert("No active course to export. Generate a syllabus first.");
      return null;
    }

    const drawers = await db.getAllDrawers();
    const chapters: any[] = [];

    for (const sub of syllabus) {
      const chapterData = {
        title: sub.title,
        description: sub.description,
        transcript: [],
        takeaways: [] as any[],
      };

      const transcriptDrawer = drawers.find(
        (d) =>
          d.wing === currentTopic &&
          d.room === sub.title &&
          d.drawer === "Conversation Transcript"
      );

      if (transcriptDrawer) {
        try {
          const decompressed = db.LZString.decompressFromUTF16(transcriptDrawer.compressedContent);
          chapterData.transcript = JSON.parse(decompressed);
        } catch {}
      }

      const takeawayDrawers = drawers.filter(
        (d) =>
          d.wing === currentTopic &&
          d.room === sub.title &&
          d.drawer !== "Overview" &&
          d.drawer !== "Conversation Transcript" &&
          d.drawer !== "Uploaded Document"
      );

      takeawayDrawers.forEach((td) => {
        const decompStr = db.LZString.decompressFromUTF16(td.compressedContent);
        chapterData.takeaways.push({ title: td.drawer, content: decompStr });
      });

      chapters.push(chapterData);
    }

    return { topic: currentTopic, chapters };
  };

  const escapeXML = (str: string) => {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  // EPUB Exporter
  const exportCourseAsEpub = async () => {
    const course = await gatherCourseData();
    if (!course) return;

    setIsExportingEpub(true);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const { topic, chapters } = course;
      const dateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const yearStr = new Date().getFullYear();
      const uid = `vibelocus-${Date.now()}`;

      const allTakeaways: any[] = [];
      chapters.forEach((ch) => {
        ch.takeaways.forEach((tw: any) => allTakeaways.push({ chapter: ch.title, ...tw }));
      });
      const totalDialogues = chapters.reduce((sum, ch) => sum + ch.transcript.length, 0);

      // mimetype
      zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

      // META-INF/container.xml
      zip.file(
        "META-INF/container.xml",
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
      );

      // Stylesheet
      const epubCSS = `@charset "UTF-8";
body { font-family: Georgia, serif; line-height: 1.8; margin: 1.5em 2em; color: #1a1a1a; background: #fefefe; }
h1 { font-size: 1.9em; margin: 0 0 0.4em 0; color: #1e1b4b; border-bottom: 2px solid #6366f1; padding-bottom: 0.3em; }
h2 { font-size: 1.4em; color: #4338ca; margin: 1.8em 0 0.5em 0; }
h3 { font-size: 1.15em; color: #6366f1; margin: 1.3em 0 0.4em 0; }
p { margin: 0 0 0.9em 0; text-align: justify; }
blockquote { margin: 1.2em 1.5em; padding: 0.5em 1em; border-left: 3px solid #c7d2fe; color: #475569; font-style: italic; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
.cover-page { text-align: center; }
.cover-title { font-size: 2.8em; margin-top: 4em; color: #1e1b4b; font-weight: 800; }
.cover-subtitle { font-size: 1.15em; color: #64748b; margin-top: 0.8em; font-style: italic; }
.cover-rule { width: 40%; height: 2px; background: #6366f1; margin: 2em auto; border: none; }
.cover-meta { font-size: 0.9em; color: #94a3b8; margin-top: 0.5em; }
.frontmatter { }
.frontmatter h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
.copyright { font-size: 0.82em; color: #94a3b8; line-height: 1.9; margin-top: 6em; text-align: center; }
.dialogue { margin: 0.8em 0; padding: 0.7em 1em; }
.dialogue-user { background: #eef2ff; border-left: 3px solid #6366f1; }
.dialogue-ai { background: #f0fdf4; border-left: 3px solid #10b981; }
.dialogue-role { font-weight: 700; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.2em; }
.dialogue-role-user { color: #4338ca; }
.dialogue-role-ai { color: #059669; }
.takeaway { background: #fffbeb; border: 1px solid #fcd34d; padding: 0.8em 1em; margin: 0.8em 0; }
.takeaway-title { font-weight: 700; color: #92400e; margin-bottom: 0.2em; }
.chapter-desc { font-style: italic; color: #64748b; margin-bottom: 1.5em; border-left: 3px solid #e2e8f0; padding-left: 1em; }
.toc-list { list-style: none; padding: 0; }
.toc-item { margin: 0.6em 0; padding: 0.3em 0; border-bottom: 1px dotted #e2e8f0; }
.toc-item a { color: #4338ca; text-decoration: none; }
.conclusion-section { margin: 1.5em 0; padding: 1em; background: #f8fafc; border: 1px solid #e2e8f0; }`;

      zip.file("OEBPS/styles.css", epubCSS);

      // Cover Page
      zip.file(
        "OEBPS/cover.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXML(topic)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <div class="cover-page">
    <div class="cover-title">${escapeXML(topic)}</div>
    <div class="cover-subtitle">An Interactive Learning Course</div>
    <hr class="cover-rule"/>
    <div class="cover-meta">Generated by VibeLocus</div>
    <div class="cover-meta">${dateStr}</div>
    <div class="cover-meta">${chapters.length} Chapters &bull; ${totalDialogues} Dialogue Exchanges &bull; ${allTakeaways.length} Key Insights</div>
  </div>
</body>
</html>`
      );

      // Colophon
      zip.file(
        "OEBPS/colophon.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>About This Book</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <div class="frontmatter">
    <div class="copyright">
      <p><strong>${escapeXML(topic)}</strong></p>
      <p>An AI-Generated Learning Course</p>
      <p>&copy; ${yearStr} &mdash; Generated by VibeLocus</p>
      <p>&nbsp;</p>
      <p>This book was created through an interactive AI tutoring session.</p>
      <p>Each chapter captures a real learning dialogue between student and AI tutor,</p>
      <p>preserving the natural flow of questions, explanations, and key insights.</p>
    </div>
  </div>
</body>
</html>`
      );

      // Foreword
      const chapterList = chapters
        .map(
          (ch, i) =>
            `<strong>Chapter ${i + 1}: ${escapeXML(ch.title)}</strong> &mdash; ${escapeXML(
              ch.description
            )}`
        )
        .join("</p>\n    <p>");

      zip.file(
        "OEBPS/foreword.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Foreword</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <div class="frontmatter">
    <h2>Foreword</h2>
    <p>This book is a structured exploration of <strong>${escapeXML(topic)}</strong>, organized into ${
          chapters.length
        } focused chapters. Each chapter captures an interactive dialogue between a student and an AI tutor.</p>
    <hr/>
    <h3>What You Will Learn</h3>
    <p>${chapterList}</p>
  </div>
</body>
</html>`
      );

      // Chapters
      const chapterFiles: Array<{ id: string; title: string }> = [];
      chapters.forEach((ch, i) => {
        const chId = `ch${String(i + 1).padStart(3, "0")}`;
        let body = `<h1>Chapter ${i + 1}<br/>${escapeXML(ch.title)}</h1>\n`;
        body += `<p class="chapter-desc">${escapeXML(ch.description)}</p>\n`;

        if (ch.transcript.length > 0) {
          body += `<h2>Learning Dialogue</h2>\n`;
          ch.transcript.forEach((msg: ChatMessage) => {
            const isUser = msg.role === "user";
            body += `<div class="dialogue ${isUser ? "dialogue-user" : "dialogue-ai"}">
  <span class="dialogue-role ${isUser ? "dialogue-role-user" : "dialogue-role-ai"}">${
              isUser ? "Student" : "AI Tutor"
            }</span>
  <p>${escapeXML(msg.content)}</p>
</div>\n`;
          });
        } else {
          body += `<blockquote>No conversation has been recorded for this topic yet. Return to VibeLocus to complete this chapter.</blockquote>\n`;
        }

        if (ch.takeaways.length > 0) {
          body += `<hr/>\n<h2>Key Takeaways</h2>\n`;
          ch.takeaways.forEach((tw: any) => {
            body += `<div class="takeaway">
  <div class="takeaway-title">${escapeXML(tw.title)}</div>
  <p>${escapeXML(tw.content)}</p>
</div>\n`;
          });
        }

        const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${i + 1}: ${escapeXML(ch.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${body}</body>
</html>`;
        zip.file(`OEBPS/${chId}.xhtml`, xhtml);
        chapterFiles.push({ id: chId, title: ch.title });
      });

      // Conclusion
      let conclusionBody = `<h1>Conclusion</h1>\n`;
      conclusionBody += `<p>This concludes our exploration of <strong>${escapeXML(
        topic
      )}</strong>. Below is a consolidated reference of every key insight captured.</p>\n<hr/>\n`;
      if (allTakeaways.length > 0) {
        allTakeaways.forEach((tw) => {
          conclusionBody += `<div class="conclusion-section">
  <div class="conclusion-chapter">From: ${escapeXML(tw.chapter)}</div>
  <div class="takeaway-title">${escapeXML(tw.title)}</div>
  <p>${escapeXML(tw.content)}</p>
</div>\n`;
        });
      } else {
        conclusionBody += `<p><em>No takeaways have been saved yet.</em></p>\n`;
      }
      zip.file(
        "OEBPS/conclusion.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Conclusion</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${conclusionBody}</body>
</html>`
      );

      // Table of Contents
      const tocChapters = chapterFiles
        .map(
          (cf, i) =>
            `<li class="toc-item"><a href="${cf.id}.xhtml"><span class="toc-chapter-num">Chapter ${
              i + 1
            }</span> ${escapeXML(cf.title)}</a></li>`
        )
        .join("\n        ");
      zip.file(
        "OEBPS/toc.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol class="toc-list">
      <li class="toc-item"><a href="foreword.xhtml">Foreword</a></li>
      ${tocChapters}
      <li class="toc-item"><a href="conclusion.xhtml">Conclusion &amp; Key Insights</a></li>
    </ol>
  </nav>
</body>
</html>`
      );

      // Package OPF XML Manifest
      let manifestItems = `<item id="css" href="styles.css" media-type="text/css"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>
    <item id="foreword" href="foreword.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`;
      let spineItems = `<itemref idref="cover"/>
    <itemref idref="colophon"/>
    <itemref idref="toc"/>
    <itemref idref="foreword"/>`;

      chapterFiles.forEach((cf) => {
        manifestItems += `\n    <item id="${cf.id}" href="${cf.id}.xhtml" media-type="application/xhtml+xml"/>`;
        spineItems += `\n    <itemref idref="${cf.id}"/>`;
      });
      manifestItems += `\n    <item id="conclusion" href="conclusion.xhtml" media-type="application/xhtml+xml"/>`;
      spineItems += `\n    <itemref idref="conclusion"/>`;

      zip.file(
        "OEBPS/content.opf",
        `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${escapeXML(topic)}</dc:title>
    <dc:creator>VibeLocus AI Learning</dc:creator>
    <dc:publisher>VibeLocus</dc:publisher>
    <dc:description>AI learning course</dc:description>
    <dc:language>en</dc:language>
    <dc:date>${new Date().toISOString().split("T")[0]}</dc:date>
    <dc:rights>Generated by VibeLocus.</dc:rights>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
      );

      // Generate blob
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `${topic.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}_VibeLocus.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    } catch (e: any) {
      alert(`EPUB Export failed: ${e.message}`);
    } finally {
      setIsExportingEpub(false);
    }
  };

  // PDF Exporter
  const exportCourseAsPdf = async () => {
    const course = await gatherCourseData();
    if (!course) return;

    setIsExportingPdf(true);

    try {
      const { jsPDF } = await import("jspdf");
      const { topic, chapters } = course;
      const dateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const yearStr = new Date().getFullYear();

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 22;
      const textWidth = pageWidth - margin * 2;
      let yPos = margin + 8;
      let currentPageNum = 0;

      const allTakeaways: any[] = [];
      chapters.forEach((ch) => {
        ch.takeaways.forEach((tw: any) => allTakeaways.push({ chapter: ch.title, ...tw }));
      });

      const addPageFooter = (pageNum: number) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 160, 175);
        if (pageNum > 0) {
          doc.text(`${pageNum}`, pageWidth / 2, pageHeight - 10, { align: "center" });
        }
        doc.text("VibeLocus", pageWidth - margin, pageHeight - 10, { align: "right" });
      };

      const addPageHeader = (headerText: string) => {
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(160, 160, 175);
        doc.text(headerText, margin, 12);
        doc.setDrawColor(230, 230, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, 14, pageWidth - margin, 14);
      };

      const startContentPage = (headerText: string) => {
        doc.addPage();
        currentPageNum++;
        addPageHeader(headerText);
        addPageFooter(currentPageNum);
        yPos = margin + 8;
      };

      const checkPageBreak = (needed = 12, headerText = "") => {
        if (yPos + needed > pageHeight - 18) {
          startContentPage(headerText || topic);
          return true;
        }
        return false;
      };

      // 1. Cover Page
      doc.setFillColor(15, 15, 25);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(1);
      doc.line(pageWidth * 0.3, pageHeight * 0.28, pageWidth * 0.7, pageHeight * 0.28);

      doc.setTextColor(99, 102, 241);
      doc.setFontSize(34);
      doc.setFont("helvetica", "bold");
      const titleLines = doc.splitTextToSize(topic, textWidth);
      const titleY = pageHeight * 0.33;
      doc.text(titleLines, pageWidth / 2, titleY, { align: "center" });

      doc.setTextColor(200, 200, 220);
      doc.setFontSize(13);
      doc.setFont("helvetica", "italic");
      doc.text(
        "An Interactive Learning Course",
        pageWidth / 2,
        titleY + titleLines.length * 13 + 8,
        { align: "center" }
      );

      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      const ruleY = titleY + titleLines.length * 13 + 18;
      doc.line(pageWidth * 0.35, ruleY, pageWidth * 0.65, ruleY);

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${chapters.length} Chapters  •  ${allTakeaways.length} Key Insights`,
        pageWidth / 2,
        ruleY + 12,
        { align: "center" }
      );
      doc.text(`Generated ${dateStr}`, pageWidth / 2, ruleY + 20, { align: "center" });

      doc.setTextColor(60, 60, 80);
      doc.setFontSize(9);
      doc.text("VibeLocus", pageWidth / 2, pageHeight - 20, { align: "center" });

      // 2. Colophon / About
      doc.addPage();
      doc.setFillColor(252, 252, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      addPageFooter(0);
      yPos = 40;

      doc.setTextColor(30, 27, 75);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("About This Book", margin, yPos);
      yPos += 12;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 80);
      const aboutText = `This book was created through an interactive AI tutoring session on the VibeLocus platform. Each chapter captures a real learning dialogue between a student and an AI tutor specialized in a specific subtopic of ${topic}.\n\nThe content preserves the natural flow of questions, explanations, and insights, making it ideal for both learning and quick reference. Key takeaways are highlighted at the end of each chapter and consolidated in the conclusion.`;
      const aboutLines = doc.splitTextToSize(aboutText, textWidth);
      doc.text(aboutLines, margin, yPos);
      yPos += aboutLines.length * 5 + 16;

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.text(`© ${yearStr} — Generated by VibeLocus`, margin, yPos);

      // 3. TOC
      startContentPage(topic);
      doc.setTextColor(30, 27, 75);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Table of Contents", margin, yPos);
      yPos += 12;

      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 12;

      doc.setFontSize(11);
      chapters.forEach((ch, i) => {
        checkPageBreak(10, topic);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(`Chapter ${i + 1}`, margin + 2, yPos);
        doc.setTextColor(67, 56, 202);
        doc.setFont("helvetica", "bold");
        doc.text(ch.title, margin + 28, yPos);

        doc.setDrawColor(200, 200, 210);
        doc.setLineWidth(0.15);
        doc.setLineDashPattern([0.5, 1.5], 0);
        const titleW = doc.getTextWidth(ch.title);
        doc.line(margin + 28 + titleW + 3, yPos, pageWidth - margin, yPos);
        doc.setLineDashPattern([], 0);
        yPos += 9;
      });

      // 4. Chapters Content
      chapters.forEach((ch, i) => {
        const chHeader = `Chapter ${i + 1}: ${ch.title}`;
        startContentPage(chHeader);

        doc.setTextColor(30, 27, 75);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(`Chapter ${i + 1}`, margin, yPos);
        yPos += 8;
        doc.setFontSize(15);
        const chTitleLines = doc.splitTextToSize(ch.title, textWidth);
        doc.text(chTitleLines, margin, yPos);
        yPos += chTitleLines.length * 7 + 4;

        doc.setDrawColor(99, 102, 241);
        doc.setLineWidth(0.4);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        // Description
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        const descLines = doc.splitTextToSize(ch.description, textWidth);
        doc.text(descLines, margin, yPos);
        yPos += descLines.length * 5 + 10;

        // Dialogue
        if (ch.transcript.length > 0) {
          checkPageBreak(14, chHeader);
          doc.setTextColor(67, 56, 202);
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.text("Learning Dialogue", margin, yPos);
          yPos += 9;

          ch.transcript.forEach((msg: ChatMessage) => {
            const isUser = msg.role === "user";
            doc.setFillColor(isUser ? 238 : 240, isUser ? 242 : 253, isUser ? 255 : 244);
            const msgLines = doc.splitTextToSize(msg.content, textWidth - 8);
            const blockH = 7 + msgLines.length * 5 + 2;

            if (yPos + blockH > pageHeight - 18) {
              startContentPage(chHeader);
            }

            doc.rect(margin, yPos - 4, textWidth, blockH, "F");
            doc.setFillColor(isUser ? 99 : 16, isUser ? 102 : 185, isUser ? 241 : 129);
            doc.rect(margin, yPos - 4, 1.2, blockH, "F");

            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(isUser ? 67 : 5, isUser ? 56 : 150, isUser ? 202 : 105);
            doc.text(isUser ? "STUDENT" : "AI TUTOR", margin + 4, yPos);
            yPos += 5;

            doc.setFontSize(9.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(26, 26, 26);
            msgLines.forEach((line: string) => {
              doc.text(line, margin + 4, yPos);
              yPos += 5;
            });
            yPos += 5;
          });
        }

        // Takeaways
        if (ch.takeaways.length > 0) {
          checkPageBreak(14, chHeader);
          doc.setDrawColor(252, 211, 77);
          doc.setLineWidth(0.3);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 8;

          doc.setTextColor(146, 64, 14);
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.text("Key Takeaways", margin, yPos);
          yPos += 9;

          ch.takeaways.forEach((tw: any) => {
            checkPageBreak(16, chHeader);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(146, 64, 14);
            doc.text(`- ${tw.title}`, margin + 2, yPos);
            yPos += 5;

            doc.setFont("helvetica", "normal");
            doc.setTextColor(26, 26, 26);
            const twLines = doc.splitTextToSize(tw.content, textWidth - 10);
            twLines.forEach((line: string) => {
              checkPageBreak(6, chHeader);
              doc.text(line, margin + 6, yPos);
              yPos += 5;
            });
            yPos += 4;
          });
        }
      });

      // 5. Conclusion
      startContentPage("Conclusion");
      doc.setTextColor(30, 27, 75);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Conclusion", margin, yPos);
      yPos += 10;

      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 80);
      const concIntro = doc.splitTextToSize(
        `This concludes the exploration of ${topic}. Below is a consolidated reference of every key insight captured during the learning journey.`,
        textWidth
      );
      doc.text(concIntro, margin, yPos);
      yPos += concIntro.length * 5 + 10;

      if (allTakeaways.length > 0) {
        allTakeaways.forEach((tw) => {
          checkPageBreak(20, "Conclusion");
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(99, 102, 241);
          doc.text(`From: ${tw.chapter}`, margin + 2, yPos);
          yPos += 5;

          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(146, 64, 14);
          doc.text(`- ${tw.title}`, margin + 2, yPos);
          yPos += 5;

          doc.setFont("helvetica", "normal");
          doc.setTextColor(26, 26, 26);
          const twLines = doc.splitTextToSize(tw.content, textWidth - 10);
          twLines.forEach((line: string) => {
            checkPageBreak(6, "Conclusion");
            doc.text(line, margin + 6, yPos);
            yPos += 5;
          });
          yPos += 6;
        });
      }

      const fileName = `${topic.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}_VibeLocus.pdf`;
      doc.save(fileName);
    } catch (e: any) {
      alert(`PDF Export failed: ${e.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Purge database
  const purgeAllData = async () => {
    if (
      confirm(
        "CRITICAL ACTION: Are you sure you want to clear your Memory Hub? All local notes and vectors will be permanently deleted."
      )
    ) {
      await db.clearDB();

      if (typeof window !== "undefined") {
        localStorage.removeItem("vibe_current_topic");
        localStorage.removeItem("vibe_syllabus");
        localStorage.removeItem("vibe_active_subtopic");
        localStorage.removeItem("vibe_active_tab");
        localStorage.removeItem("vibe_show_mobile_chat");
      }

      setCurrentTopic("");
      setSyllabus([]);
      setActiveSubtopic(null);
      setChatHistory([]);
      setLearningHistory([]);

      alert("IndexedDB Memory Hub cache successfully purged.");
    }
  };

  return (
    <>
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isModelReady={isModelReady}
        isModelLoading={isModelLoading}
        modelLoadProgress={modelLoadProgress}
        onLoadModel={loadEmbeddingModel}
        localLLMReady={llm.localLLMReady}
        localLLMLoading={llm.localLLMLoading}
        localLLMProgress={llm.localLLMProgress}
        onLoadLocalLLM={llm.loadLocalLLM}
      />

      <main className="main-content">
        {activeTab === "learn" && (
          <section className="tab-panel active" id="panel-learn">
            <header className="section-header">
              <h1>Active Learning Lab</h1>
              <p>Enter a topic to generate a dynamic syllabus, then engage with your locked tutor.</p>
            </header>

            <div className={`learn-grid ${showMobileChat ? "show-chat" : ""}`}>
              <SyllabusList
                currentTopic={currentTopic}
                syllabus={syllabus}
                activeSubtopic={activeSubtopic}
                onSelectSubtopic={selectSubtopic}
                onGenerateSyllabus={generateSyllabus}
                onGenerateSyllabusFromDocument={generateSyllabusFromDocument}
                learningHistory={learningHistory}
                onResumeTopic={resumeTopicShortcut}
                onExportEpub={exportCourseAsEpub}
                onExportPdf={exportCourseAsPdf}
                isGenerating={isGeneratingSyllabus}
                isExportingEpub={isExportingEpub}
                isExportingPdf={isExportingPdf}
                onCancelSyllabus={cancelSyllabus}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                isFallbackSyllabus={isFallbackSyllabus}
                syllabusError={syllabusError}
              />

              <TutorChat
                currentTopic={currentTopic}
                activeSubtopic={activeSubtopic}
                chatHistory={chatHistory}
                onSendMessage={sendChatMessage}
                isQueryingTutor={isQueryingTutor}
                onResetSession={resetSession}
                onGoToNextTopic={goToNextTopic}
                hasNextTopic={
                  activeSubtopic !== null &&
                  syllabus.findIndex((s) => s.title === activeSubtopic.title) < syllabus.length - 1
                }
                onSaveTakeaway={saveDialogueTakeaway}
                onSaveConcept={saveManualConcept}
                isSavingConcept={isSavingConcept}
                onSpeechToggle={tts.speak}
                activeSpeechId={tts.activeSpeechId}
                onMobileBack={() => handleShowMobileChatChange(false)}
                onStartSession={() => selectSubtopic(activeSubtopic!)}
              />
            </div>
          </section>
        )}

        {activeTab === "palace" && (
          <MemoryHub
            drawers={db.drawers}
            onDeleteDrawer={db.deleteDrawer}
            onResumeSessionFromDrawer={resumeSessionFromDrawer}
            onResumeTopic={resumeTopicShortcut}
            onResumeRoom={resumeRoomShortcut}
          />
        )}

        {activeTab === "search" && (
          <SemanticSearch
            isModelReady={isModelReady}
            drawers={db.drawers}
            onComputeEmbedding={computeTextEmbedding}
            onDeleteDrawer={db.deleteDrawer}
            onResumeSessionFromDrawer={resumeSessionFromDrawer}
            isModelLoading={isModelLoading}
            modelLoadProgress={modelLoadProgress}
            onLoadModel={loadEmbeddingModel}
          />
        )}

        {activeTab === "settings" && (
          <Settings
            apiProvider={llm.apiProvider}
            modelId={llm.modelId}
            baseUrl={llm.baseUrl}
            apiKey={llm.apiKey}
            saveSettings={llm.saveSettings}
            dbStats={db.stats}
            quota={db.quota}
            onPurgeDB={purgeAllData}
            localLLMReady={llm.localLLMReady}
            localLLMLoading={llm.localLLMLoading}
            localLLMProgress={llm.localLLMProgress}
            onLoadLocalLLM={llm.loadLocalLLM}
            isModelReady={isModelReady}
            isModelLoading={isModelLoading}
            modelLoadProgress={modelLoadProgress}
            onLoadModel={loadEmbeddingModel}
          />
        )}

        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          currentTopic={currentTopic}
          syllabus={syllabus}
          activeSubtopic={activeSubtopic}
          chatHistory={chatHistory}
          getAllDrawers={db.getAllDrawers}
        />
      </main>
    </>
  );
}
