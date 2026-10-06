"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatClassName, MODEL_CLASSES, type ModelClass, type ThreatLevel } from "@/lib/classes";
import { Activity, Bell, Camera, Clock3, Menu, MonitorUp, Play, RefreshCw, ShieldCheck, Square, Trash2, TriangleAlert, Volume2, X } from "lucide-react";
import { Sidebar, type Section } from "@/components/dashboard/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Source = "Webcam" | "Screen share";
type ThreatRow = { name: ModelClass; level: ThreatLevel };
type Detection = { class_id: number; label: ModelClass; confidence: number; bbox: number[]; threatLevel: ThreatLevel };
type Alarm = { className: ModelClass; threatLevel: "High"; episodeId: string };
type EventRow = { id: string; source: Source; className: ModelClass; confidence: number; bbox: number[]; threatLevel: ThreatLevel; appearedAt: string; lastSeenAt: string; endedAt: string | null };
type Health = { status: string; mongodb: string; modelServer: string; modelServerUrl: string };

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons = { camera: Camera, screen: MonitorUp, play: Play, stop: Square, refresh: RefreshCw, shield: ShieldCheck, alert: TriangleAlert, clock: Clock3 };
  const IconComponent = icons[name as keyof typeof icons] ?? Activity;
  return <IconComponent size={size} strokeWidth={1.7} aria-hidden="true" />;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatElapsed(startedAt: number) {
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [section, setSection] = useState<Section>("monitor");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [source, setSource] = useState<Source>("Webcam");
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState("00:00");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [apiError, setApiError] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [imageSize, setImageSize] = useState({ width: 640, height: 360 });
  const [threatRows, setThreatRows] = useState<ThreatRow[]>([]);
  const [threatLoading, setThreatLoading] = useState(true);
  const [savingClass, setSavingClass] = useState<string | null>(null);
  const [history, setHistory] = useState<EventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [alertItems, setAlertItems] = useState<Array<{ id: string; className: ModelClass; time: string }>>([]);
  const [highCount, setHighCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const stoppingRef = useRef(false);
  const sessionRef = useRef("");
  const sourceRef = useRef<Source>("Webcam");
  const pendingRef = useRef<Promise<void> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const highThreatClasses = useMemo(() => threatRows.filter((row) => row.level === "High").length, [threatRows]);
  const eventTotal = eventCount || history.length;
  const dependenciesReady = health?.status === "ready";
  const navigateSection = useCallback((nextSection: Section) => {
    setSection(nextSection);
    setMobileNavOpen(false);
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const value = await response.json();
      setHealth(value);
      setHealthError(response.ok ? "" : "One or more services need attention");
    } catch {
      setHealthError("Dashboard API is unreachable");
    }
  }, []);

  const loadThreats = useCallback(async () => {
    setThreatLoading(true);
    try {
      const response = await fetch("/api/threat-classes", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load threat levels");
      setThreatRows(await response.json());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not load threat levels");
    } finally {
      setThreatLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (skip = 0, append = false) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/events?limit=100&skip=${skip}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load event history");
      const result: { events: EventRow[]; total: number; highTotal: number } = await response.json();
      setHistory((current) => append ? [...current, ...result.events] : result.events);
      setEventCount(result.total);
      setHighCount(result.highTotal);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not load event history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadHealth();
      void loadThreats();
    }, 0);
    const poll = setInterval(loadHealth, 15_000);
    return () => { clearTimeout(initialLoad); clearInterval(poll); };
  }, [loadHealth, loadThreats]);

  useEffect(() => {
    if (section !== "events") return;
    const load = setTimeout(() => { void loadHistory(); }, 0);
    return () => clearTimeout(load);
  }, [section, loadHistory]);

  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);

  const playAlarm = useCallback(() => {
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.56);
    } catch {
      setApiError("Browser audio is unavailable. Visual high-threat alerts remain enabled.");
    }
  }, []);

  const sendFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!runningRef.current || busyRef.current || !video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    busyRef.current = true;
    try {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(video, 0, 0, width, height);
      const frame = canvas.toDataURL("image/jpeg", 0.76);
      const operation = (async () => {
        const response = await fetch("/api/monitor/frame", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frame, source: sourceRef.current, sessionId: sessionRef.current }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail ?? "Frame detection failed");
        if (!runningRef.current) return;
        setDetections(result.detections ?? []);
        if (result.image?.width && result.image?.height) setImageSize(result.image);
        setApiError("");
        const newAppearances: ModelClass[] = result.newAppearances ?? [];
        if (newAppearances.length) setEventCount((count) => count + newAppearances.length);
        const alarms: Alarm[] = result.alarms ?? [];
        for (const alarm of alarms) {
          playAlarm();
          setAlertItems((current) => [{ id: alarm.episodeId, className: alarm.className, time: new Date().toISOString() }, ...current].slice(0, 6));
          setHighCount((count) => count + 1);
        }
      })();
      pendingRef.current = operation;
      await operation;
    } catch (error) {
      if (runningRef.current) setApiError(error instanceof Error ? error.message : "Detection request failed");
    } finally {
      busyRef.current = false;
      pendingRef.current = null;
    }
  }, [playAlarm]);

  const stopMonitoring = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    runningRef.current = false;
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setDetections([]);
    const sessionId = sessionRef.current;
    if (pendingRef.current) await pendingRef.current.catch(() => undefined);
    if (sessionId) {
      await fetch("/api/monitor/end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined);
    }
    sessionRef.current = "";
    stoppingRef.current = false;
  }, []);

  const startMonitoring = useCallback(async () => {
    setApiError("");
    try {
      const audio = audioRef.current ?? new AudioContext();
      audioRef.current = audio;
      await audio.resume();
      const stream = source === "Webcam"
        ? await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: cameraId ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      sourceRef.current = source;
      sessionRef.current = crypto.randomUUID();
      const video = videoRef.current;
      if (!video) throw new Error("Video preview is unavailable");
      video.srcObject = stream;
      await video.play();
      if (source === "Webcam") {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        setCameraDevices(devices);
        if (!cameraId) setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
      }
      const now = Date.now();
      setStartedAt(now);
      setElapsed("00:00");
      setDetections([]);
      runningRef.current = true;
      setRunning(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { void stopMonitoring(); }, { once: true });
      void sendFrame();
      intervalRef.current = setInterval(() => { void sendFrame(); }, 500);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setApiError(error instanceof Error ? error.message : "Could not start capture. Check browser permissions.");
    }
  }, [cameraId, sendFrame, source, stopMonitoring]);

  const updateThreat = async (name: ModelClass, level: ThreatLevel) => {
    const before = threatRows;
    setThreatRows((rows) => rows.map((row) => row.name === name ? { ...row, level } : row));
    setSavingClass(name);
    try {
      const response = await fetch("/api/threat-classes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classes: [{ name, level }] }),
      });
      if (!response.ok) throw new Error("Could not save threat level");
      setApiError("");
    } catch (error) {
      setThreatRows(before);
      setApiError(error instanceof Error ? error.message : "Could not save threat level");
    } finally {
      setSavingClass(null);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Delete all saved detection events? This cannot be undone.")) return;
    try {
      const response = await fetch("/api/events", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear history");
      setHistory([]);
      setEventCount(0);
      setHighCount(0);
      setAlertItems([]);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not clear history");
    }
  };

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
      <Sidebar
        section={section}
        onNavigate={navigateSection}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        health={health}
        healthError={healthError}
        highThreatClasses={highThreatClasses}
      />

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-leading">
            <Button variant="ghost" size="icon" className="mobile-nav-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={18} /></Button>
            <div className="breadcrumbs"><span>Predator Monitor</span><span className="crumb-sep">/</span><strong>{{ monitor: "Monitor", threats: "Threat rules", events: "Event history" }[section]}</strong></div>
          </div>
          <div className="topbar-right"><span className="local-pill"><span className="local-dot" />LOCAL</span><Button variant="ghost" size="icon" onClick={() => void loadHealth()} aria-label="Refresh service status" title="Refresh service status"><RefreshCw size={15} /></Button></div>
        </header>

        <div className="content-wrap">
          {apiError && <div className="error-banner" role="alert"><Icon name="alert" size={16} /><span>{apiError}</span><Button variant="ghost" size="icon" onClick={() => setApiError("")} aria-label="Dismiss"><X size={15} /></Button></div>}

          <section className="section-content" hidden={section !== "monitor"}>
            <div className="page-heading">
              <div><h1>Monitor</h1><p>Watch a camera or shared screen for wildlife activity.</p></div>
              <div className={`monitoring-status ${running ? "is-live" : ""}`}><span className="status-pulse" />{running ? "MONITORING" : "STANDBY"}</div>
            </div>

            <div className="stat-grid">
              <Card className="stat-card"><div className="stat-icon"><Icon name="clock" /></div><div className="stat-value">{running ? elapsed : "—"}</div><div className="stat-label">SESSION TIME</div></Card>
              <Card className="stat-card"><div className="stat-icon"><Icon name="alert" /></div><div className="stat-value">{highCount}</div><div className="stat-label">HIGH THREAT EVENTS</div></Card>
              <Card className="stat-card"><div className="stat-icon"><Icon name="shield" /></div><div className="stat-value">{highThreatClasses}<span className="stat-suffix">/20</span></div><div className="stat-label">HIGH THREAT CLASSES</div></Card>
              <Card className="stat-card"><div className="stat-icon"><Icon name="camera" /></div><div className="stat-value">{eventTotal}</div><div className="stat-label">SAVED APPEARANCES</div></Card>
            </div>

            <div className="monitor-layout">
              <Card className="panel camera-panel">
                <CardHeader className="panel-heading"><div><CardTitle>Source preview</CardTitle><CardDescription>Frames are processed locally through your model server.</CardDescription></div><Badge variant={running ? "default" : "outline"} className={`source-badge ${running ? "live" : ""}`}><span className="tiny-dot" />{running ? "LIVE" : "READY"}</Badge></CardHeader>
                <CardContent className="capture-content"><div className={`video-stage ${running ? "has-video" : ""}`}>
                  <video ref={videoRef} muted playsInline aria-label="Live camera or screen preview" />
                  <svg className="detection-overlay" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Detection boxes">
                    {detections.map((detection, index) => {
                      const [x1, y1, x2, y2] = detection.bbox;
                      const color = detection.threatLevel === "High" ? "#fff" : detection.threatLevel === "Medium" ? "#c6c6c6" : "#929292";
                      const label = `${formatClassName(detection.label)} · ${(detection.confidence * 100).toFixed(0)}%`;
                      return <g key={`${detection.class_id}-${index}`}><rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx="5" fill="none" stroke={color} strokeWidth={Math.max(2, imageSize.width / 320)} /><rect x={x1} y={Math.max(0, y1 - imageSize.height * 0.065)} width={Math.min(x2 - x1 + 24, label.length * imageSize.width * 0.008 + 22)} height={imageSize.height * 0.06} rx="3" fill={color} /><text x={x1 + 8} y={Math.max(imageSize.height * 0.04, y1 - imageSize.height * 0.023)} fill="#112018" fontSize={imageSize.height * 0.035} fontWeight="700">{label}</text></g>;
                    })}
                  </svg>
                  {!running && <div className="preview-empty"><div className="empty-orbit"><Icon name="camera" size={25} /></div><strong>Ready when you are</strong><span>Choose a source and start monitoring</span></div>}
                  {running && <div className="preview-live-tag"><span className="status-pulse" /> LIVE</div>}
                  {running && <div className="preview-frame-rate">UP TO 2 FPS <span>·</span> MAX 640 PX</div>}
                </div>
                <div className="source-controls">
                  <div className="source-picker" role="group" aria-label="Choose capture source">
                    <Button variant={source === "Webcam" ? "secondary" : "ghost"} size="sm" className={source === "Webcam" ? "selected" : ""} onClick={() => setSource("Webcam")} disabled={running}><Icon name="camera" size={16} />Camera</Button>
                    <Button variant={source === "Screen share" ? "secondary" : "ghost"} size="sm" className={source === "Screen share" ? "selected" : ""} onClick={() => setSource("Screen share")} disabled={running}><Icon name="screen" size={16} />Share screen</Button>
                  </div>
                  {source === "Webcam" && cameraDevices.length > 1 && <select className="camera-select" value={cameraId} onChange={(event) => setCameraId(event.target.value)} disabled={running} aria-label="Choose camera">{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select>}
                  <Button variant={running ? "outline" : "default"} className={`start-button ${running ? "stop-button" : ""}`} onClick={() => running ? void stopMonitoring() : void startMonitoring()} disabled={!running && !dependenciesReady} title={!running && !dependenciesReady ? "Start MongoDB and the model server first" : undefined}><Icon name={running ? "stop" : "play"} size={16} />{running ? "Stop monitoring" : "Start monitoring"}</Button>
                </div>
                <div className="monitor-footnote"><Volume2 size={14} />{dependenciesReady ? "Sound alerts are enabled when monitoring starts. High threat classes trigger once per appearance." : "Start MongoDB and the model server, then refresh system status to enable monitoring."}</div>
                <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
                </CardContent>
              </Card>

              <aside className="panel alerts-panel">
                <div className="panel-heading"><div><h2>Recent alerts</h2><p>New high-threat appearances</p></div><span className="alert-count">{alertItems.length}</span></div>
                {alertItems.length ? <div className="alert-list">{alertItems.map((alert) => <div className="alert-row" key={alert.id}><span className="alert-symbol"><Bell size={15} /></span><div className="alert-copy"><strong>{formatClassName(alert.className)}</strong><span>High threat · {formatTime(alert.time)}</span></div></div>)}</div> : <div className="alerts-empty"><span className="empty-check"><Bell size={17} /></span><strong>No alerts yet</strong><span>High-threat appearances will show here.</span></div>}
                <div className="alerts-note"><span className="note-line" /><p>Every alert is stored as event metadata. Images and video are never saved.</p></div>
              </aside>
            </div>
                <div className="below-panels"><div className="privacy-note"><Icon name="shield" size={17} /><div><strong>Private by design</strong><span>Frames stay on this workstation and are not retained.</span></div></div><button className="text-action" onClick={() => navigateSection("threats")}>Manage threat levels <span>→</span></button></div>
          </section>

          <section className="section-content" hidden={section !== "threats"}>
            <div className="page-heading"><div><h1>Threat rules</h1><p>Choose which detections should trigger an audible alert.</p></div><span className="class-total">{MODEL_CLASSES.length} classes</span></div>
            <div className="threat-summary"><div className="threat-summary-icon"><Icon name="shield" size={20} /></div><div><strong>All classes are set to Medium by default</strong><span>High-threat classes trigger one alert per appearance. The alert re-arms after two seconds without a detection.</span></div><div className="threat-summary-count"><b>{highThreatClasses}</b><small>HIGH</small></div></div>
            <section className="panel threat-panel"><div className="table-heading"><div><h2>Class configuration</h2><p>Changes are saved to your local MongoDB database.</p></div><span className="saved-state"><span className="saved-dot" />{savingClass ? "Saving change…" : "Changes save automatically"}</span></div>
              <div className="threat-grid">{MODEL_CLASSES.map((name, index) => {
                const row = threatRows.find((item) => item.name === name);
                const level = row?.level ?? "Medium";
                return <div className="threat-row" key={name}><span className="class-index">{String(index + 1).padStart(2, "0")}</span><span className="animal-icon">{name === "person" ? "P" : "·"}</span><strong>{formatClassName(name)}</strong><Badge className={`threat-pill ${level.toLowerCase()}`}>{level}</Badge><select className={`level-select ${level.toLowerCase()}`} value={level} disabled={threatLoading || savingClass === name} onChange={(event) => void updateThreat(name, event.target.value as ThreatLevel)} aria-label={`${formatClassName(name)} threat level`}><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>;
              })}</div>
              <div className="threat-legend"><span><i className="legend-dot low" />LOW <small>No sound alert</small></span><span><i className="legend-dot medium" />MEDIUM <small>Visible in history</small></span><span><i className="legend-dot high" />HIGH <small>Sound + visible alert</small></span></div>
            </section>
          </section>

          <section className="section-content" hidden={section !== "events"}>
            <div className="page-heading"><div><h1>Event history</h1><p>Detection appearances recorded from your local monitoring sessions.</p></div><div className="history-actions"><Button variant="outline" size="sm" className="secondary-button" onClick={() => void loadHistory()}><RefreshCw size={13} />Refresh</Button><Button variant="destructive" size="sm" className="danger-quiet" onClick={() => void clearHistory()} disabled={!history.length}><Trash2 size={13} />Clear history</Button></div></div>
            <div className="history-summary"><div><b>{eventCount}</b><span>saved appearances</span></div><div><b>{highCount}</b><span>high threat</span></div><div><b>Metadata only</b><span>no images or video stored</span></div></div>
            <section className="panel history-panel"><div className="table-heading"><div><h2>Recent appearances</h2><p>One record per class and source appearance.</p></div><span className="history-total">{history.length} RECORDS</span></div>
              {historyLoading ? <div className="table-empty">Loading saved events…</div> : history.length ? <div className="event-table-wrap"><table className="event-table"><thead><tr><th>DETECTED CLASS</th><th>THREAT</th><th>CONFIDENCE</th><th>SOURCE</th><th>FIRST SEEN</th><th>LAST SEEN</th></tr></thead><tbody>{history.map((event) => <tr key={event.id}><td><span className="table-class-icon">·</span><strong>{formatClassName(event.className)}</strong></td><td><Badge className={`threat-pill ${event.threatLevel.toLowerCase()}`}>{event.threatLevel}</Badge></td><td><span className="confidence-value">{Math.round(event.confidence * 100)}%</span><span className="confidence-track"><i style={{ width: `${Math.round(event.confidence * 100)}%` }} /></span></td><td><span className="event-source"><Icon name={event.source === "Webcam" ? "camera" : "screen"} size={13} />{event.source}</span></td><td>{formatTime(event.appearedAt)}</td><td>{formatTime(event.lastSeenAt)}</td></tr>)}</tbody></table></div> : <div className="table-empty"><span className="empty-check"><Icon name="clock" size={18} /></span><strong>No appearances recorded</strong><span>Start a monitoring session to build your event history.</span></div>}
              {history.length < eventCount && <button className="load-more" disabled={historyLoading} onClick={() => void loadHistory(history.length, true)}>{historyLoading ? "Loading…" : `Load more (${eventCount - history.length} remaining)`}</button>}
              <div className="history-retention"><Icon name="shield" size={15} />Event history stays on this computer until you clear it.</div>
            </section>
          </section>
        </div>
        {/* <footer className="app-footer"><span>PREDATOR MONITOR <b>·</b> LOCAL WILDLIFE DETECTION</span><span>MODEL SERVER <b>{health?.modelServer === "ready" ? "CONNECTED" : "OFFLINE"}</b></span></footer> */}
      </section>
    </main>
  );
}
