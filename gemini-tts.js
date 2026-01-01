class GeminiTTS {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.audioContext = null;
        this.currentSource = null;
        this.currentAudioBuffer = null;
        this.isPlaying = false;

        // Cache audio buffers by text to avoid re-generating for same message
        this.audioCache = new Map();

        // Seek State
        this.currentOffset = 0;
        this.startTime = 0;
    }

    async initAudioContext() {
        if (!this.audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass({ sampleRate: 24000 });
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    // Call this on user interaction (e.g. click) to wake up the audio engine
    async prepare() {
        await this.initAudioContext();
    }

    async generateSpeech(text) {
        if (!text || !text.trim()) {
        throw new Error('TTS received empty text');
    }

    if (!this.apiKey) {
        throw new Error('Missing Gemini TTS API key. Set GEMINI_TTS_API_KEY in config.js.');
    }
        // Check cache first
        if (this.audioCache.has(text)) {
            return this.audioCache.get(text);
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" }
                    }
                }
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || 'TTS generation failed');
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const inlineData = candidate?.content?.parts?.[0]?.inlineData;

            if (!inlineData || !inlineData.data) {
                throw new Error('No audio data received from Gemini');
            }

            // Init context before decoding
            await this.initAudioContext();

            // Reduce base64 string to Uint8Array
            const binaryString = atob(inlineData.data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Use native decoding which handles WAV/MP3/Headers automatically
            // decodeAudioData detaches the buffer, preventing re-use or causing issues if passed directly from view

            // Gemini 2.5 Flash returns Raw 16-bit PCM @ 24kHz. Native decodeAudioData fails on raw PCM.
            // We proceed directly to manual decoding.

            const rawBuffer = bytes.buffer;
            const dataInt16 = new Int16Array(rawBuffer);
            const numChannels = 1;
            const sampleRate = 24000;
            const frameCount = dataInt16.length;

            const audioBuffer = this.audioContext.createBuffer(numChannels, frameCount, sampleRate);
            const channelData = audioBuffer.getChannelData(0);

            for (let i = 0; i < frameCount; i++) {
                // Normalize Int16 to Float32 [-1.0, 1.0]
                channelData[i] = dataInt16[i] / 32768.0;
            }

            this.audioCache.set(text, audioBuffer);
            return audioBuffer;
        } catch (error) {
            console.error('Gemini TTS Error:', error);
            throw error;
        }
    }

    // decodeAudioData method is no longer needed but we can keep it empty or remove it. 
    // For cleaner code, we removed the call to it above.
    async decodeAudioData(bytes) {
        return this.audioContext.decodeAudioData(bytes.buffer);
    }

    play(audioBuffer, offset = 0, onEnded) {
        this.stop(false); // Stop current source, don't reset fully if just seeking

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        source.onended = () => {
            // Only if we reached the end naturally, not if we stopped it manually for seeking
            if (this.currentSource === source) {
                this.isPlaying = false;
                this.currentSource = null;
                this.currentOffset = 0;
                if (onEnded) onEnded();
            }
        };

        this.currentAudioBuffer = audioBuffer;
        this.startTime = this.audioContext.currentTime - offset;
        this.currentOffset = offset;

        source.start(0, offset);
        this.currentSource = source;
        this.isPlaying = true;
    }



    pause() {
        if (!this.isPlaying) return;
        // Calculate where we are right now
        const elapsed = this.audioContext.currentTime - this.startTime;
        this.currentOffset = elapsed; // Save this position

        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) { }
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    seek(delta) {
        if (!this.currentAudioBuffer) return; // Can seek even if paused if we have buffer

        // If playing, use current time. If paused, use saved offset.
        let baseTime = this.isPlaying
            ? (this.audioContext.currentTime - this.startTime)
            : this.currentOffset;

        let newTime = baseTime + delta;

        // Clamp
        newTime = Math.max(0, Math.min(newTime, this.currentAudioBuffer.duration));

        if (this.isPlaying) {
            // If playing, skip to new spot immediately
            this.play(this.currentAudioBuffer, newTime, this.lastOnEnded);
        } else {
            // If paused, just update offset so hitting play resumes from new spot
            this.currentOffset = newTime;
        }
    }

    stop(fullReset = true) {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) { }
            this.currentSource = null;
        }
        this.isPlaying = false;
        if (fullReset) {
            this.currentOffset = 0;
            this.lastOnEnded = null;
            this.currentText = null;
        }
    }
}


