import { useState, useEffect, useCallback } from "react";

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);

  // Stop any active speech
  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setActiveSpeechId(null);
    }
  }, []);

  // Strips code blocks, inline code, bold/italics, and ASCII line dividers
  const cleanTextForSpeech = useCallback((text: string): string => {
    if (!text) return "";
    let cleaned = text;

    // Remove code blocks
    cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
    // Remove inline code backticks
    cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
    // Remove bold/italics markers
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
    cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
    // Remove common ASCII line drawing symbols
    cleaned = cleaned.replace(/[-|+=#]{3,}/g, "");
    cleaned = cleaned.replace(/[\u25B6\u25B8\u25B9]/g, "");
    // Replace multiple spaces/newlines with single space
    cleaned = cleaned.replace(/\s+/g, " ");

    return cleaned.trim();
  }, []);

  // Selects best natural English voice, prioritizing deep voices
  const selectBestVoice = useCallback((utterance: SpeechSynthesisUtterance) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();

    let selected = voices.find((v) => {
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();
      return (
        lang.startsWith("en") &&
        (name.includes("david") ||
          name.includes("male") ||
          name.includes("google uk english male") ||
          name.includes("natural") ||
          name.includes("guy") ||
          name.includes("andrew"))
      );
    });

    if (!selected) {
      selected = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    }

    if (selected) {
      utterance.voice = selected;
    }
  }, []);

  const speak = useCallback(
    (text: string, id: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        alert("Text-to-speech is not supported in this browser.");
        return;
      }

      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        if (activeSpeechId === id) {
          setIsSpeaking(false);
          setActiveSpeechId(null);
          return;
        }
      }

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      selectBestVoice(utterance);

      utterance.pitch = 0.88; // Deepen voice
      utterance.rate = 0.95;  // Slower, audiobook-style pace

      utterance.onstart = () => {
        setIsSpeaking(true);
        setActiveSpeechId(id);
      };

      const handleSpeechEnd = () => {
        setIsSpeaking(false);
        setActiveSpeechId(null);
      };

      utterance.onend = handleSpeechEnd;
      utterance.onerror = handleSpeechEnd;

      window.speechSynthesis.speak(utterance);
    },
    [activeSpeechId, cleanTextForSpeech, selectBestVoice]
  );

  // Clean up speech on page unload/component unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isSpeaking,
    activeSpeechId,
    speak,
    stop,
  };
}
