
import { useState, useEffect, useRef, useCallback } from 'react';

// Define the interface for the SpeechRecognition API which might be prefixed.
interface ISpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
    onend: ((this: ISpeechRecognition, ev: Event) => any) | null;
    onstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
}

// Define the constructor for the SpeechRecognition API.
interface SpeechRecognitionStatic {
    new(): ISpeechRecognition;
}

// Define the custom event types.
interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

// Check for the prefixed version of the API.
declare global {
    interface Window {
        SpeechRecognition: SpeechRecognitionStatic;
        webkitSpeechRecognition: SpeechRecognitionStatic;
    }
}


interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
  isSupported: boolean;
}

const SpeechRecognitionAPI = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>('');
  const intendedToBeListeningRef = useRef(false); // Ref to manage continuous state

  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.warn('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const currentTranscriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += currentTranscriptPart + ' ';
        } else {
          interimTranscript += currentTranscriptPart;
        }
      }
      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech Recognition Error:', event.error, event.message);
      setError(event.error === 'no-speech' ? 'No speech was detected.' : event.error);
      intendedToBeListeningRef.current = false;
      setIsListening(false);
    };
    
    recognition.onstart = () => {
        setIsListening(true);
    };

    // This is the key for continuous listening. If it ends and we didn't manually stop it, restart it.
    recognition.onend = () => {
      if (intendedToBeListeningRef.current) {
        recognition.start(); // Restart listening
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
        if (recognitionRef.current) {
            intendedToBeListeningRef.current = false; // Ensure it doesn't restart on unmount
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            recognitionRef.current.onstart = null;
            recognitionRef.current.stop();
        }
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      finalTranscriptRef.current = ''; 
      setError(null);
      intendedToBeListeningRef.current = true;
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Could not start speech recognition:", e);
        setError("Could not start listening. Please check microphone permissions.");
        intendedToBeListeningRef.current = false;
        setIsListening(false);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      intendedToBeListeningRef.current = false;
      recognitionRef.current.stop();
    }
  }, [isListening]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    error,
    isSupported: !!SpeechRecognitionAPI,
  };
};
