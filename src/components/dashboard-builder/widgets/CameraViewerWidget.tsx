import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetConfig } from '../../../store/useBuilderStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Square, Radio, Loader2, AlertCircle, Volume2, VolumeX, Camera, Maximize, Minimize, Info, Aperture } from 'lucide-react';
import { compressSdpZstd, decompressSdpZstd } from '@/utils/zstdSignaling';

interface CameraViewerWidgetProps {
  config: WidgetConfig;
  nodeId?: string;
  isEditMode?: boolean;
}

const STORAGE_KEYS = {
  relayOnly: 'pi-cam.relayOnly',
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function deflateRaw(str: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(str);
  const cs = new (window as any).CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(encoded).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  return buf;
}

function uint8ToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

async function inflateRaw(buf: Uint8Array): Promise<string> {
  const ds = new (window as any).DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const writePromise = writer.write(buf).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(out);
}


function optimizeSdp(sdp: string): string {
  const lines = sdp.split('\n');
  const optimizedLines = [];

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    // Filter out non-essential attributes to reduce SDP payload size
    if (
      l.startsWith('a=extmap:') ||
      l.startsWith('a=rtcp-fb:') ||
      l.startsWith('a=rtpmap:') ||
      l.startsWith('a=fmtp:') ||
      l.startsWith('a=ssrc:') ||
      l.startsWith('a=msid:') ||
      l.startsWith('a=rid:') ||
      l.startsWith('a=simulcast:')
    ) {
      continue;
    }

    // Filter candidates
    if (l.startsWith('a=candidate:')) {
      // Exclude TCP candidates
      if (l.toLowerCase().includes('tcp')) continue;

      // Exclude IPv6 candidates
      const parts = l.split(' ');
      const ip = parts[4];
      if (ip && ip.includes(':')) {
        continue;
      }
    }

    optimizedLines.push(l);
  }

  return optimizedLines.join('\r\n') + '\r\n';
}


export default function CameraViewerWidget({ config, nodeId, isEditMode }: CameraViewerWidgetProps) {
  // 'datachannel' = JPEG frames via RTCDataChannel (ESP32-CAM style)
  // 'video'       = H.264 media track (requires firmware support)
  const streamMode: 'datachannel' | 'video' = config?.config?.streamMode || 'datachannel';
  // 'zstd_dict' = Zstandard compression with trained dictionary (new Raspberry Pi peer default)
  // 'deflate_raw' = Deflate stream compression (legacy default)
  const compressionMode: 'zstd_dict' | 'deflate_raw' = config?.config?.compressionMode || 'zstd_dict';
  const [status, setStatus] = useState<'ready' | 'connecting' | 'streaming' | 'error'>('ready');
  const [errorMessage, setErrorMessage] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timeline state
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [draggingSlider, setDraggingSlider] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [connectionType, setConnectionType] = useState<'P2P' | 'TURN' | null>(null);
  const [connectionProgress, setConnectionProgress] = useState('CONNECTING...');

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const lastFrameUrlRef = useRef<string | null>(null);

  const statsStartMs = useRef<number>(0);
  const statsLastReportMs = useRef<number>(0);
  const statsWindowFrames = useRef<number>(0);
  const statsWindowBytes = useRef<number>(0);

  const recordJpegStats = (byteLength: number) => {
    const now = performance.now();
    if (!statsStartMs.current) {
      statsStartMs.current = now;
      statsLastReportMs.current = now;
    }

    statsWindowFrames.current += 1;
    statsWindowBytes.current += byteLength;

    const windowSeconds = (now - statsLastReportMs.current) / 1000;
    if (windowSeconds >= 1) {
      const fps = statsWindowFrames.current / Math.max(windowSeconds, 0.001);
      const bitrate = (statsWindowBytes.current * 8) / 1000 / Math.max(windowSeconds, 0.001);

      setNetworkStats({
        bitrate: Math.round(bitrate),
        fps: Math.round(fps),
        packetLoss: 0,
        resolution: ''
      });

      statsLastReportMs.current = now;
      statsWindowFrames.current = 0;
      statsWindowBytes.current = 0;
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [networkStats, setNetworkStats] = useState({ bitrate: 0, fps: 0, packetLoss: 0, resolution: '' });
  const lastBytesReceived = useRef(0);
  const lastTimestamp = useRef(0);

  const [forceRelay, setForceRelay] = useState(false);

  const apiKey = import.meta.env.VITE_ANEDYA_API_KEY;
  const ANEDYA_API_BASE = 'https://api.anedya.io/v1';

  const getApiHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
  }, [apiKey]);

  const sendCmdOffer = async (b64: string) => {
    if (!nodeId) return null;
    const resp = await fetch(`${ANEDYA_API_BASE}/commands/send`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        nodeId: nodeId,
        command: 'webrtc_offer',
        data: b64,
        type: 'string',
        expiry: Date.now() + 300000,
      }),
    });
    if (!resp.ok) {
      let message = `Failed to send command (HTTP ${resp.status})`;
      try {
        const json = await resp.json();
        if (json.error) message = json.error;
        else if (json.reasonCode) message = json.reasonCode;
      } catch (_) { /* non-JSON body */ }
      throw new Error(message);
    }
    const json = await resp.json();
    return json.commandId || json.id || json.commandID;
  };

  const getCommandStatus = async (commandId: string) => {
    const resp = await fetch(`${ANEDYA_API_BASE}/commands/getDetails`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ commandId }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  };

  const fetchNodeHealth = async (nodeIdStr: string) => {
    const resp = await fetch(`${ANEDYA_API_BASE}/health/status`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({
        nodes: [nodeIdStr],
        lastContactThreshold: 90,
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.success === false) return null;
    return json.data?.[nodeIdStr] || null;
  };

  const fetchTurnCredentials = async () => {
    const resp = await fetch(`${ANEDYA_API_BASE}/relay/create`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ relayType: 'turn' }),
    });
    if (!resp.ok) throw new Error(`TURN fetch failed: ${resp.status}`);
    const json = await resp.json();
    if (!json.relayData) throw new Error(json.error || 'no relayData');
    return {
      ...json.relayData,
      password: json.relayData.credential,
      relayExpiry: json.relayExpiry,
    };
  };

  const stopStream = useCallback((e?: any) => {
    const isError = e === true;
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (timelineTimerRef.current) { clearInterval(timelineTimerRef.current); timelineTimerRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    dcRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (lastFrameUrlRef.current) {
      URL.revokeObjectURL(lastFrameUrlRef.current);
      lastFrameUrlRef.current = null;
    }
    setImageUrl(null);

    statsStartMs.current = 0;
    statsLastReportMs.current = 0;
    statsWindowFrames.current = 0;
    statsWindowBytes.current = 0;

    if (!isError) {
      setStatus('ready');
    }
    setDuration(0);
    setPosition(0);
    setIsLive(false);
    setConnectionType(null);
    setShowStats(false);
    lastBytesReceived.current = 0;
    lastTimestamp.current = 0;
  }, []);

  const sendCmd = (cmd: any) => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.send(JSON.stringify(cmd));
    }
  };

  const startStream = async () => {
    if (isEditMode || !nodeId || !apiKey) {
      setErrorMessage('Missing Node ID or API Key');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');

    setConnectionProgress('CHECKING DEVICE STATUS...');
    try {
      const healthInfo = await fetchNodeHealth(nodeId);
      if (healthInfo && !healthInfo.online) {
        const lastTime = healthInfo.lastHeartbeat
          ? new Date(healthInfo.lastHeartbeat * 1000).toLocaleString()
          : 'never';
        setErrorMessage(`Device is offline (last heartbeat: ${lastTime})`);
        setStatus('error');
        return;
      }
    } catch (_) {
      // Continue if health API fails
    }

    setConnectionProgress('FETCHING RELAY CREDENTIALS...');

    try {
      const relayData = await fetchTurnCredentials();
      const turnPort = config?.config?.turnPort || 3478;

      const iceServers: RTCIceServer[] = [
        { urls: `stun:${relayData.endpoint}:${turnPort}` }
      ];
      if (!forceRelay) {
        iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
      }
      iceServers.push({
        urls: `turn:${relayData.endpoint}:${turnPort}`,
        username: relayData.username,
        credential: relayData.password
      });

      const iceConfig = {
        iceTransportPolicy: forceRelay ? 'relay' : 'all' as RTCIceTransportPolicy,
        iceServers
      };

      const pc = new RTCPeerConnection(iceConfig);
      pcRef.current = pc;

      // ── Data channel / media-track setup ──────────────────────────────────
      // 'datachannel' → JPEG frames via unordered RTCDataChannel (ESP32-CAM style)
      // 'video'       → H.264 media track via recvonly transceiver

      if (streamMode === 'datachannel') {
        // ── JPEG-over-DataChannel mode (ESP32-CAM) ──
        const dc = pc.createDataChannel('jpeg-test', { ordered: false, maxRetransmits: 0 });
        dc.binaryType = 'arraybuffer';
        dcRef.current = dc;

        dc.onopen = () => {
          setStatus('streaming');
          dc.send('browser handshake test ping');
        };

        dc.onclose = () => console.log('Data channel closed');
        dc.onerror = (event: any) => console.error('Data channel error:', event.error || 'unknown');

        dc.onmessage = (event) => {
          const data = event.data;
          let blob: Blob | null = null;
          if (data instanceof ArrayBuffer) {
            blob = new Blob([data], { type: 'image/jpeg' });
          } else if (data instanceof Blob) {
            blob = data;
          }
          if (blob) {
            const nextUrl = URL.createObjectURL(blob);
            setImageUrl(nextUrl);
            if (lastFrameUrlRef.current) {
              URL.revokeObjectURL(lastFrameUrlRef.current);
            }
            lastFrameUrlRef.current = nextUrl;
            recordJpegStats(blob.size);
          }
        };

      } else {
        // ── Video-track mode ──
        // No data channel needed; media arrives as a proper MediaStream track.
        const videoTransceiver = pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        if (RTCRtpReceiver.getCapabilities) {
          const caps = RTCRtpReceiver.getCapabilities('video');
          if (caps) {
            const h264 = caps.codecs.filter(c => c.mimeType === 'video/H264');
            const rest = caps.codecs.filter(c => c.mimeType !== 'video/H264');
            if (h264.length) {
              try { videoTransceiver.setCodecPreferences([...h264, ...rest]); } catch (_) { /* ignore */ }
            }
          }
        }

        pc.ontrack = (e) => {
          if (e.streams && e.streams[0] && videoRef.current) {
            videoRef.current.srcObject = e.streams[0];
            setStatus('streaming');
          }
        };
      }

      pc.onconnectionstatechange = async () => {
        if (pc.connectionState === 'connected') {
          try {
            const stats = await pc.getStats();
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const local = stats.get(report.localCandidateId);
                const remote = stats.get(report.remoteCandidateId);
                if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') {
                  setConnectionType('TURN');
                } else {
                  setConnectionType('P2P');
                }
              }
            });
          } catch (err) {
            console.error('Failed to get WebRTC stats', err);
          }
        }
        if (pc.connectionState === 'failed') {
          setErrorMessage('WebRTC Connection failed');
          setStatus('error');
          stopStream(true);
        }
      };

      setConnectionProgress('GATHERING ICE CANDIDATES...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 10000); // 10s timeout fallback
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      if (forceRelay && pc.localDescription?.sdp && !pc.localDescription.sdp.includes('typ relay')) {
        setErrorMessage('Failed to create relay candidate. Please check your quota limits.');
        setStatus('error');
        stopStream(true);
        return;
      }

      let b64 = '';
      if (compressionMode === 'zstd_dict') {
        const offerPayload = JSON.stringify({
          offer: { sdp: pc.localDescription?.sdp, type: pc.localDescription?.type },
          turn: relayData,
        });
        b64 = await compressSdpZstd(offerPayload);
      } else {
        const rawOfferSdp = pc.localDescription?.sdp || '';
        const cleanedOfferSdp = optimizeSdp(rawOfferSdp);
        const offerSdp = cleanedOfferSdp.replaceAll("a=setup:actpass", "a=setup:passive");
        const offerPayload = JSON.stringify({
          type: "offer",
          sdp: offerSdp,
          turn: relayData,
        });
        const compressed = await deflateRaw(offerPayload);
        b64 = uint8ToBase64(compressed);
      }

      if (b64.length > 980) {
        throw new Error(`Compressed offer payload too large: ${b64.length} bytes (limit ~1000)`);
      }

      setConnectionProgress('SENDING OFFER TO DEVICE...');
      const commandId = await sendCmdOffer(b64);
      if (!commandId) {
        throw new Error('Failed to retrieve a valid command ID.');
      }

      setConnectionProgress('WAITING FOR DEVICE ANSWER...');
      let attempts = 0;
      let answerApplied = false;
      const MAX_ATTEMPTS = 45; // 90 seconds like the HTML code

      pollTimerRef.current = setInterval(async () => {
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (!answerApplied) {
            setErrorMessage('Timed out waiting for device response.');
            setStatus('error');
            stopStream(true);
          }
          return;
        }

        try {
          const cmd = await getCommandStatus(commandId);
          if (!cmd) return;

          const processAnswer = async (ackdata: string) => {
            answerApplied = true;
            let sdpText = '';

            if (compressionMode === 'zstd_dict') {
              try {
                const decompressedStr = await decompressSdpZstd(ackdata);
                try {
                  const parsed = JSON.parse(decompressedStr);
                  sdpText = parsed.sdp || (typeof parsed.offer === 'object' ? parsed.offer.sdp : decompressedStr);
                } catch (_) {
                  sdpText = decompressedStr;
                }
              } catch (err: any) {
                console.error('Failed to decompress answer with zstd dict', err);
                throw new Error('Failed to decompress device answer payload');
              }
            } else {
              const answerSdpStr = await inflateRaw(base64ToUint8(ackdata));
              try {
                const parsed = JSON.parse(answerSdpStr);
                sdpText = parsed.sdp || answerSdpStr;
              } catch (e) {
                sdpText = answerSdpStr;
              }
            }

            if (forceRelay && sdpText && !sdpText.includes('typ relay')) {
              setErrorMessage('Failed to create relay candidate. Please check your quota limits.');
              setStatus('error');
              stopStream(true);
              return false;
            }

            setConnectionProgress('ESTABLISHING WEBRTC CONNECTION...');
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdpText }));
            return true;
          };

          if (cmd.status === 'failure') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            const reason = cmd.ackdata || cmd.error || 'Unknown device failure';
            setErrorMessage(`Device reported failure: ${reason}`);
            setStatus('error');
            stopStream(true);
            return;
          }

          if (cmd.status === 'success') {
            if (!answerApplied && cmd.ackdata) {
              await processAnswer(cmd.ackdata);
            }
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            return;
          }

          if (!answerApplied && cmd.ackdata) {
            await processAnswer(cmd.ackdata);
          }
        } catch (err) {
          // Keep polling
        }
      }, 2000);

    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start stream');
      setStatus('error');
      stopStream(true);
    }
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    if (!isEditMode && config?.config?.autoStart === true && status === 'ready') {
      startStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, isEditMode]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    // JPEG data-channel mode reports stats via recordJpegStats(); skip WebRTC inbound-rtp polling.
    if (streamMode === 'datachannel') return;

    if (showStats && status === 'streaming' && pcRef.current) {
      const interval = setInterval(async () => {
        try {
          const reports = await pcRef.current!.getStats();
          let newStats = { ...networkStats };
          reports.forEach(report => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              const bytes = report.bytesReceived;
              const timestamp = report.timestamp;
              if (lastTimestamp.current && lastBytesReceived.current) {
                const timeDiff = timestamp - lastTimestamp.current;
                const bytesDiff = bytes - lastBytesReceived.current;
                if (timeDiff > 0) {
                  const bitrate = (bytesDiff * 8) / timeDiff; // kbps
                  newStats.bitrate = Math.round(bitrate);
                }
              }
              lastBytesReceived.current = bytes;
              lastTimestamp.current = timestamp;

              newStats.fps = report.framesPerSecond || 0;
              const packetsLost = report.packetsLost || 0;
              const packetsReceived = report.packetsReceived || 0;
              const totalPackets = packetsLost + packetsReceived;
              newStats.packetLoss = totalPackets > 0 ? Number(((packetsLost / totalPackets) * 100).toFixed(2)) : 0;
            }
            if (report.type === 'track' && report.kind === 'video') {
              newStats.resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;
            }
          });
          setNetworkStats(newStats);
        } catch (err) {
          console.error("Failed to fetch stats", err);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showStats, status, networkStats, streamMode]);

  const takeSnapshot = () => {
    if (streamMode === 'datachannel') {
      // Snapshot from latest JPEG blob URL
      if (imageUrl) {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `snapshot-${new Date().toISOString().replace(/:/g, '-')}.jpg`;
        a.click();
      }
      return;
    }

    // Snapshot from <video> element (video track mode)
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `snapshot-${new Date().toISOString().replace(/:/g, '-')}.jpg`;
        a.click();
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };


  return (
    <Card ref={containerRef} className="w-full h-full flex flex-col bg-card overflow-hidden border shadow-sm hover:border-primary transition-colors cursor-default">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-3 px-4 border-b flex-none z-10 relative bg-card">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground m-0">
          <Camera className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate" title={config.title}>{config.title || 'Camera View'}</span>
        </CardTitle>
        <div className="flex items-center gap-2 m-0">
          {status === 'streaming' && connectionType && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm
              ${connectionType === 'TURN' ? 'bg-orange-500/20 text-orange-500 border-orange-500/30' : 'bg-blue-500/20 text-blue-500 border-blue-500/30'}`}>
              {connectionType}
            </div>
          )}
          {status === 'streaming' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-[10px] font-medium border border-green-500/30 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-[10px] font-medium border border-red-500/30 shadow-sm">
              <AlertCircle className="w-3 h-3" />
              ERROR
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 flex flex-col relative min-h-0 bg-black">
        {status === 'ready' && !isEditMode && (
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => setForceRelay(!forceRelay)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-medium tracking-wide transition-all duration-200 border shadow-sm backdrop-blur-md ${forceRelay
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-blue-500/10'
                : 'bg-black/40 text-white/60 border-white/10 hover:bg-black/60 hover:text-white/80'
                }`}
            >
              <div className={`w-2 h-2 rounded-full transition-colors ${forceRelay ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'bg-white/30'}`} />
              FORCE RELAY / TURN
            </button>
          </div>
        )}

        {/* Video Area */}
        <div className="flex-1 relative flex items-center justify-center min-h-0">
          {streamMode === 'datachannel' ? (
            // JPEG frames delivered via WebRTC DataChannel — rendered into <img>.
            // alt="" prevents the browser rendering alt-text (fixes the upside-down text glitch).
            <img
              src={imageUrl || undefined}
              alt=""
              aria-hidden="true"
              className={`w-full h-full object-contain ${status === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: 'scaleY(-1)' }}
            />
          ) : (
            // Video track (H.264) — rendered into <video>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className={`w-full h-full object-contain ${status === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
            />
          )}

          {status === 'streaming' && showStats && (
            <div className="absolute top-3 left-3 z-10 bg-black/60 p-3 rounded-lg backdrop-blur-sm border border-white/10 flex flex-col gap-1 text-[10px] text-white/90 font-mono shadow-lg">
              <div className="text-white/50 mb-1 font-sans text-[9px] uppercase tracking-wider">Network Stats</div>
              <div className="flex justify-between gap-4"><span>Bitrate:</span> <span>{networkStats.bitrate} kbps</span></div>
              <div className="flex justify-between gap-4"><span>Framerate:</span> <span>{networkStats.fps} fps</span></div>
              {streamMode !== 'datachannel' && (
                <div className="flex justify-between gap-4"><span>Packet Loss:</span> <span>{networkStats.packetLoss}%</span></div>
              )}
              {networkStats.resolution !== '0x0' && networkStats.resolution !== '' && (
                <div className="flex justify-between gap-4"><span>Resolution:</span> <span>{networkStats.resolution}</span></div>
              )}
            </div>
          )}

          {/* Status Overlays */}
          {status === 'ready' && !isEditMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-4">
              <Radio className="w-12 h-12 opacity-20" />
              <Button onClick={startStream} variant="secondary" className="gap-2 bg-white/10 hover:bg-white/20 text-white border-0">
                <Play className="w-4 h-4 fill-current" />
                Start Stream
              </Button>
            </div>
          )}

          {status === 'connecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-3">
              <Aperture className="w-8 h-8 animate-spin" />
              <span className="text-xs font-medium tracking-wide uppercase">{connectionProgress}</span>
              <div className="flex items-center gap-3 mt-2">
                <Button onClick={() => stopStream()} variant="outline" size="sm" className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                  Cancel
                </Button>
                <Button onClick={() => { stopStream(); setTimeout(() => startStream(), 100); }} variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-0">
                  Retry
                </Button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400/80 gap-3 px-6 text-center bg-red-950/20">
              <AlertCircle className="w-10 h-10 opacity-50" />
              <p className="text-sm">{errorMessage}</p>
              <Button onClick={startStream} variant="outline" size="sm" className="mt-2 border-red-500/30 text-red-400 hover:bg-red-500/10">
                Retry Connection
              </Button>
            </div>
          )}

          {isEditMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3 bg-white/5">
              <Radio className="w-10 h-10 opacity-30" />
              <span className="text-sm font-medium tracking-wide">CAMERA PREVIEW</span>
              <span className="text-xs opacity-70">Will connect in view mode</span>
            </div>
          )}
        </div>

        {/* DVR Controls */}
        {status === 'streaming' && config?.config?.showControls !== false && (
          <div className="p-3 bg-black/80 border-t border-white/10 backdrop-blur-md">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] text-white/60 font-mono">
                <span>{formatTime(position)}</span>
                <span className="text-white/40">{duration > 0 ? formatTime(duration) : 'LIVE'}</span>
              </div>

              <div className="flex items-center gap-3">
                {config?.config?.showNetworkStatsBtn !== false && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-8 w-8 shrink-0 ${showStats ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                    onClick={() => setShowStats(!showStats)}
                    title="Network Stats"
                  >
                    <Info className="w-4 h-4 fill-current" />
                  </Button>
                )}

                {/* Mute only applies to video track modes, not JPEG data channel, and when enabled in config */}
                {streamMode !== 'datachannel' && config?.config?.showMuteBtn !== false && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                    onClick={() => setIsMuted(!isMuted)}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4 fill-current" />}
                  </Button>
                )}

                {config?.config?.showSnapshotBtn !== false && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                    onClick={takeSnapshot}
                    title="Take Snapshot"
                  >
                    <Camera className="w-4 h-4 fill-current" />
                  </Button>
                )}

                {config?.config?.showStopBtn !== false && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                    onClick={stopStream}
                    title="Stop Stream"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </Button>
                )}

                <Slider
                  disabled={duration <= 0}
                  value={[draggingSlider ? position : Math.min(position, duration)]}
                  max={duration}
                  step={0.1}
                  className="flex-1"
                  onPointerDown={() => setDraggingSlider(true)}
                  onPointerUp={() => {
                    setDraggingSlider(false);
                    sendCmd({ cmd: 'seek', offset: position });
                  }}
                  onValueChange={(val) => setPosition(val[0])}
                />

                {duration > 0 && !isLive && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 shrink-0"
                    onClick={() => {
                      sendCmd({ cmd: 'live' });
                      setIsLive(true);
                    }}
                  >
                    GO LIVE
                  </Button>
                )}

                {config?.config?.showFullscreenBtn !== false && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4 fill-current" /> : <Maximize className="w-4 h-4 fill-current" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
