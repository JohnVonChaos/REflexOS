
class SpeechService {
    private synth: SpeechSynthesis;
    private utterance: SpeechSynthesisUtterance | null = null;
    private speakingMessageId: string | null = null;
    private listeners: Set<() => void> = new Set();
    private voices: SpeechSynthesisVoice[] = [];

    constructor() {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            this.loadVoices();
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = this.loadVoices;
            }
        } else {
            console.warn("Web Speech API is not supported in this browser.");
            this.synth = {} as SpeechSynthesis; // Provide a dummy object
        }
    }

    private loadVoices = () => {
        this.voices = this.synth.getVoices();
    }

    private getPreferredVoice(): SpeechSynthesisVoice | null {
        if (this.voices.length === 0) return null;
        // Prefer a high-quality Google US English voice if available
        const preferred = this.voices.find(voice => voice.name === 'Google US English');
        return preferred || this.voices.find(voice => voice.lang.startsWith('en')) || this.voices[0];
    }

    public speak(text: string, messageId: string) {
        if (!this.synth || !this.synth.speak) return;
        
        if (this.synth.speaking) {
            this.cancel();
        }

        this.speakingMessageId = messageId;
        this.utterance = new SpeechSynthesisUtterance(text);
        
        const voice = this.getPreferredVoice();
        if (voice) {
            this.utterance.voice = voice;
        }

        this.utterance.onend = () => {
            this.speakingMessageId = null;
            this.utterance = null;
            this.notifyListeners();
        };

        this.utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            this.speakingMessageId = null;
            this.utterance = null;
            this.notifyListeners();
        };

        this.synth.speak(this.utterance);
        this.notifyListeners();
    }

    public cancel() {
        if (!this.synth || !this.synth.cancel) return;
        this.synth.cancel();
        // The onend event will fire upon cancellation, which will clean up the state.
    }

    public isSpeaking(messageId: string): boolean {
        return this.speakingMessageId === messageId;
    }
    
    public addListener(callback: () => void) {
        this.listeners.add(callback);
    }

    public removeListener(callback: () => void) {
        this.listeners.delete(callback);
    }

    private notifyListeners() {
        this.listeners.forEach(callback => callback());
    }
}

export const speechService = new SpeechService();
