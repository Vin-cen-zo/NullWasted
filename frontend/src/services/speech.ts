/**
 * Native Browser Web Speech Recognition API Wrapper
 * Configured specifically for Indonesian language (id-ID)
 */

// Typing declarations for webkitSpeechRecognition / SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export interface SpeechRecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (errorMessage: string) => void;
  onEnd: () => void;
}

export function startIndonesianSpeechRecognition(callbacks: SpeechRecognitionCallbacks): { stop: () => void } {
  if (!isSpeechRecognitionSupported()) {
    callbacks.onError("Browser Anda tidak mendukung Web Speech Recognition. Silakan gunakan Google Chrome, Edge, atau ketik langsung.");
    callbacks.onEnd();
    return { stop: () => {} };
  }

  try {
    const SpeechRecognitionConstructor = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }).SpeechRecognition || (window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      callbacks.onError("Web Speech API tidak tersedia.");
      callbacks.onEnd();
      return { stop: () => {} };
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const combined = finalTranscript || interimTranscript;
      callbacks.onResult(combined, Boolean(finalTranscript));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let msg = "Terjadi kendala pada pengenalan suara.";
      if (event.error === "not-allowed") {
        msg = "Izin mikrofon ditolak oleh browser. Izinkan akses mikrofon atau ketik manual.";
      } else if (event.error === "no-speech") {
        msg = "Tidak ada suara yang terdeteksi. Silakan coba bicara lagi.";
      } else if (event.error === "network") {
        msg = "Kendala koneksi internet saat mengenali suara.";
      }
      callbacks.onError(msg);
    };

    recognition.onend = () => {
      callbacks.onEnd();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // ignore already stopped
        }
      },
    };
  } catch (err) {
    callbacks.onError(`Gagal menginisialisasi mikrofon: ${err instanceof Error ? err.message : String(err)}`);
    callbacks.onEnd();
    return { stop: () => {} };
  }
}
