import { useCallback, useEffect, useRef, useState } from 'react';

const denied = (e) => (e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
  ? 'Permission was denied. You can keep using chat, or allow camera and microphone access in your browser settings and try again.'
  : e?.name === 'NotFoundError' ? 'No camera or microphone was found on this device.'
    : `Couldn’t start media: ${e?.message ?? 'unknown error'}`);

/** Local camera/mic + screen share, with toggles. Stops every track on unmount. */
export function useMedia() {
  const [stream, setStream] = useState(null);
  const [screen, setScreen] = useState(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const refs = useRef({ stream: null, screen: null });
  refs.current = { stream, screen };
  // getUserMedia/getDisplayMedia can resolve after the component has gone (the user left
  // while the permission prompt was open); those streams must be stopped, not stored.
  const mounted = useRef(true);
  const stopTracks = (s) => s?.getTracks().forEach((t) => t.stop());

  const start = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('This browser can’t access a camera here. Try a recent browser over HTTPS or localhost.'); return null; }
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .catch((e) => (e.name === 'NotFoundError' ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(e)));
      if (!mounted.current) { stopTracks(s); return null; }
      setStream(s); setMic(true); setCam(s.getVideoTracks().length > 0);
      return s;
    } catch (e) {
      if (mounted.current) setError(denied(e));
      return null;
    } finally { if (mounted.current) setStarting(false); }
  }, []);

  const toggleMic = () => { stream?.getAudioTracks().forEach((t) => { t.enabled = !mic; }); setMic(!mic); };
  const toggleCam = () => { stream?.getVideoTracks().forEach((t) => { t.enabled = !cam; }); setCam(!cam); };

  const stopScreen = useCallback(() => { refs.current.screen?.getTracks().forEach((t) => t.stop()); setScreen(null); }, []);
  const shareScreen = async () => {
    if (screen) { stopScreen(); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setError('Screen sharing isn’t supported in this browser.'); return; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current) { stopTracks(s); return; }
      s.getVideoTracks()[0].addEventListener('ended', () => setScreen(null));
      setScreen(s);
    } catch (e) {
      if (e?.name !== 'NotAllowedError') setError(denied(e)); // a cancelled picker isn't an error
    }
  };

  const stopAll = useCallback(() => {
    refs.current.stream?.getTracks().forEach((t) => t.stop());
    refs.current.screen?.getTracks().forEach((t) => t.stop());
    setStream(null); setScreen(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refs.current.stream?.getTracks().forEach((t) => t.stop());
      refs.current.screen?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { stream, screen, mic, cam, error, starting, start, toggleMic, toggleCam, shareScreen, stopScreen, stopAll, setError };
}

/** Records the given stream with MediaRecorder; returns finished recordings as blob URLs. */
export function useRecorder() {
  const rec = useRef(null);
  const chunks = useRef([]);
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [clips, setClips] = useState([]);
  const [error, setError] = useState('');

  const start = (stream) => {
    setError('');
    if (!stream || typeof MediaRecorder === 'undefined') { setError('Recording isn’t supported here. Start your camera or screen first.'); return; }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    try {
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || 'video/webm' });
        const ext = (r.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
        setClips((c) => [...c, { url: URL.createObjectURL(blob), size: blob.size, name: `recording-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}` }]);
        setRecording(false);
      };
      r.start(1000);
      rec.current = r;
      setRecording(true); setStartedAt(Date.now());
    } catch (e) { setError(`Couldn’t start recording: ${e.message}`); }
  };
  const stop = () => { if (rec.current?.state !== 'inactive') rec.current?.stop(); };

  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop(); }, []);
  return { recording, startedAt, clips, error, start, stop };
}
