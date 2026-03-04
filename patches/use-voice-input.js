'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * Groq Whisper voice input hook — replaces AssemblyAI WebSocket streaming.
 *
 * Uses MediaRecorder to capture audio, then POSTs to /api/voice/transcribe
 * which calls Groq Whisper Large v3 Turbo. No AssemblyAI key required —
 * works with GROQ_API_KEY.
 *
 * Maintains the same interface as the upstream AssemblyAI version so
 * chat-input.jsx requires no changes.
 *
 * @param {Object} options
 * @param {() => Promise<{token?: string, error?: string}>} options.getToken - Unused (AssemblyAI compat shim)
 * @param {(text: string) => void} options.onTranscript - Called with finalized transcript text
 * @param {(error: string) => void} [options.onError] - Called on errors
 * @param {(rms: number) => void} [options.onVolumeChange] - Called with RMS volume level
 * @returns {{ isRecording: boolean, startRecording: () => void, stopRecording: () => void }}
 */
export function useVoiceInput({ getToken, onTranscript, onError, onVolumeChange }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const chunksRef = useRef([]);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Volume metering via Web Audio API
      if (onVolumeChange) {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          onVolumeChange(Math.sqrt(sum / data.length));
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
      }

      // Choose best supported format (prefer webm/opus, fallback to webm)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 1000) return; // too short, skip

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'voice.webm');

          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();
          const text = data.text?.trim();
          if (text) onTranscript(text);
        } catch (err) {
          onError?.('Transcription failed — check GROQ_API_KEY');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        onError?.('Microphone permission denied');
      } else {
        onError?.('Failed to start voice input');
      }
      cleanup();
    }
  }, [isRecording, onTranscript, onError, onVolumeChange, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startRecording, stopRecording };
}
