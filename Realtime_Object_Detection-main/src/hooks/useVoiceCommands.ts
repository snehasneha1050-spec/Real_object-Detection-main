import { useState, useCallback, useRef, useEffect } from "react";

export interface VoiceCommandResult {
  command: string;
  action: "start_detection" | "stop_detection" | "find" | "search" | "unknown";
  param?: string;
}

interface UseVoiceCommandsOptions {
  onCommand?: (result: VoiceCommandResult) => void;
  onTranscript?: (text: string) => void;
  speak?: boolean;
}

function parseCommand(transcript: string): VoiceCommandResult {
  const text = transcript.toLowerCase().trim();

  if (/^(start|begin|run)\s*(detection|detecting|camera|webcam)?$/.test(text)) {
    return { command: transcript, action: "start_detection" };
  }
  if (/^(stop|end|halt|pause)\s*(detection|detecting|camera|webcam)?$/.test(text)) {
    return { command: transcript, action: "stop_detection" };
  }

  const findMatch = text.match(/^(?:find|look for|locate|highlight)\s+(.+)$/);
  if (findMatch) {
    return { command: transcript, action: "find", param: findMatch[1] };
  }

  const searchMatch = text.match(/^(?:search|filter|show)\s+(.+)$/);
  if (searchMatch) {
    return { command: transcript, action: "search", param: searchMatch[1] };
  }

  return { command: transcript, action: "unknown" };
}

export function speakText(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function useVoiceCommands(options: UseVoiceCommandsOptions = {}) {
  const { onCommand, onTranscript, speak = true } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommandResult | null>(null);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      const display = final || interim;
      setTranscript(display);
      onTranscript?.(display);

      if (final) {
        const result = parseCommand(final);
        setLastCommand(result);
        onCommand?.(result);
        if (speak && result.action !== "unknown") {
          const responses: Record<string, string> = {
            start_detection: "Starting detection",
            stop_detection: "Stopping detection",
            find: `Highlighting ${result.param}`,
            search: `Searching for ${result.param}`,
          };
          speakText(responses[result.action] || "");
        }
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [onCommand, onTranscript, speak]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setTranscript("");
    setLastCommand(null);
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // already started
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    transcript,
    lastCommand,
    supported,
    startListening,
    stopListening,
    toggle,
  };
}
