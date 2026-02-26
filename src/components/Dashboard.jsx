import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Sliders, FileText, X, Check, Zap, Plus, Trash2, Save, FolderOpen, Share2, Copy, ExternalLink, Shield, Loader2, Play, Square, RotateCcw } from 'lucide-react';
import GateSim from './GateSim';
import { supabase } from '../lib/supabase';

const PANEL_TYPES = ['None', 'Fold', 'Swing', 'Slide'];

export default function Dashboard() {
  const [openPercent, setOpenPercent] = useState(0);

  const [config, setConfig] = useState({
    totalWidth: 4000,
    height: 1800,
    material: '4x4',
    splitRatio: 0.5,
    left: {
      panels: [
        { type: 'Fold', direction: 'Inward', tracked: true },
        { type: 'Fold', direction: 'Inward', tracked: true },
      ],
      actuator: { enabled: false, aOffset: 200, bOffset: 300 },
    },
    right: {
      panels: [
        { type: 'Slide' },
        { type: 'Swing' },
      ],
      actuator: { enabled: false, aOffset: 200, bOffset: 300 },
    },
  });

  const [pendingConfig, setPendingConfig] = useState(JSON.parse(JSON.stringify(config)));
  const [isDirty, setIsDirty] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load state on mount: URL (Database ID or Base64) takes priority, then LocalStorage
  useEffect(() => {
    const fetchSharedConfig = async () => {
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get('id');
      const sharedBase64 = params.get('c');

      if (sharedId) {
        if (!supabase) {
          console.error('Supabase client not initialized. Check your environment variables.');
          return;
        }
        setIsLoading(true);
        try {
          const { data, error } = await supabase
            .from('gate_configs')
            .select('*')
            .eq('id', sharedId)
            .single();

          if (data) {
            setConfig(data.config);
            setPendingConfig(JSON.parse(JSON.stringify(data.config)));
            if (data.open_percent !== undefined) setOpenPercent(data.open_percent);
            setIsReadOnly(true);
          }
        } catch (e) {
          console.error('Failed to fetch from DB', e);
        } finally {
          setIsLoading(false);
        }
      } else if (sharedBase64) {
        // Fallback for legacy Base64 links
        try {
          const decodedStr = decodeURIComponent(escape(atob(decodeURIComponent(sharedBase64))));
          const payload = JSON.parse(decodedStr);
          if (payload.config) {
            setConfig(payload.config);
            setPendingConfig(JSON.parse(JSON.stringify(payload.config)));
            if (payload.openPercent !== undefined) setOpenPercent(payload.openPercent);
            setIsReadOnly(true);
          }
        } catch (e) {
          console.error('Failed to parse legacy shared config', e);
        }
      } else {
        // If no shared link, load from local storage
        const savedConfig = localStorage.getItem('gatesim_last_config');
        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            setConfig(parsed);
            setPendingConfig(JSON.parse(JSON.stringify(parsed)));
          } catch (e) { }
        }
        const savedPct = localStorage.getItem('gatesim_last_percent');
        if (savedPct !== null) setOpenPercent(Number(savedPct));
      }
    };

    fetchSharedConfig();
  }, []);

  // Persist changes to LocalStorage
  useEffect(() => {
    if (!isReadOnly) {
      localStorage.setItem('gatesim_last_config', JSON.stringify(config));
    }
  }, [config, isReadOnly]);

  useEffect(() => {
    localStorage.setItem('gatesim_last_percent', openPercent);
  }, [openPercent]);

  // Animation logic
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setOpenPercent((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return Math.min(100, prev + 1);
        });
      }, 30);
    } else {
      clearInterval(playTimerRef.current);
    }
    return () => clearInterval(playTimerRef.current);
  }, [isPlaying]);

  const exitReadOnly = () => {
    setIsReadOnly(false);
    // Remove the shared link from URL so refresh doesn't reset state
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('c');
    window.history.replaceState({}, '', url.toString());
  };

  const checkDirty = (next) => setIsDirty(JSON.stringify(next) !== JSON.stringify(config));

  const handleApply = () => {
    setConfig(JSON.parse(JSON.stringify(pendingConfig)));
    setIsDirty(false);
  };

  const saveConfig = () => {
    const data = JSON.stringify(config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `gatesim-${ts}.gatesim`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareConfig = async () => {
    if (!supabase) {
      alert('Sharing is currently unavailable. Supabase configuration is missing.');
      return;
    }
    setIsSharing(true);
    try {
      // Save to database
      const { data, error } = await supabase
        .from('gate_configs')
        .insert({
          config,
          open_percent: openPercent
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const url = new URL(window.location.href);
        url.searchParams.set('id', data.id);
        url.searchParams.delete('c'); // Cleanup legacy param if exists

        await navigator.clipboard.writeText(url.toString());
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      }
    } catch (e) {
      console.error('Sharing failed', e);
      const detailed = `${e.message || 'Error'}${e.hint ? `\nHint: ${e.hint}` : ''}${e.details ? `\nDetails: ${e.details}` : ''}`;
      alert(`Could not save to database: ${detailed}`);
    } finally {
      setIsSharing(false);
    }
  };

  const openConfig = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const loaded = JSON.parse(ev.target.result);
        if (loaded.totalWidth && loaded.height && loaded.left && loaded.right) {
          // Ensure actuator defaults exist for loaded configs
          if (!loaded.left.actuator) loaded.left.actuator = { enabled: false, aOffset: 200, bOffset: 300 };
          if (!loaded.right.actuator) loaded.right.actuator = { enabled: false, aOffset: 200, bOffset: 300 };
          setConfig(loaded);
          setPendingConfig(JSON.parse(JSON.stringify(loaded)));
          setIsDirty(false);
        } else {
          alert('Invalid gate config file.');
        }
      } catch {
        alert('Could not parse file. Please select a valid .gatesim file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTopChange = (e) => {
    const { name, value } = e.target;
    const val = ['totalWidth', 'height', 'splitRatio'].includes(name) ? Number(value) : value;
    setPendingConfig((p) => {
      const next = { ...p, [name]: val };
      checkDirty(next);
      return next;
    });
  };

  const handlePanelChange = (side, idx, field, value) => {
    setPendingConfig((p) => {
      const next = { ...p, [side]: { ...p[side], panels: [...p[side].panels] } };
      const panel = { ...next[side].panels[idx] };

      if (field === 'type') {
        panel.type = value;
        if (value === 'Fold') {
          panel.direction = panel.direction || 'Inward';
          panel.tracked = panel.tracked !== undefined ? panel.tracked : false;
        } else {
          delete panel.direction;
          delete panel.tracked;
        }
      } else if (field === 'direction') {
        panel.direction = value;
      } else if (field === 'tracked') {
        panel.tracked = value;
      }

      next[side].panels[idx] = panel;
      checkDirty(next);
      return next;
    });
  };

  const handleActuatorChange = (side, field, value) => {
    setPendingConfig((p) => {
      const act = { ...(p[side].actuator || { enabled: false, placement: 'Inside' }) };
      if (field === 'enabled') {
        act.enabled = value;
        if (!act.placement) act.placement = 'Inside';
      } else {
        act[field] = value;
      }
      const next = { ...p, [side]: { ...p[side], actuator: act } };
      checkDirty(next);
      return next;
    });
  };

  const addPanel = (side) => {
    setPendingConfig((p) => {
      const next = { ...p, [side]: { ...p[side], panels: [...p[side].panels, { type: 'None' }] } };
      checkDirty(next);
      return next;
    });
  };

  const removePanel = (side, idx) => {
    setPendingConfig((p) => {
      if (p[side].panels.length <= 1) return p;
      const next = { ...p, [side]: { ...p[side], panels: p[side].panels.filter((_, i) => i !== idx) } };
      checkDirty(next);
      return next;
    });
  };

  // ——— Auto-calculate actuator mounting & specs ———
  const actuatorSpecs = useMemo(() => {
    const calc = (leaf, leafWidthMm) => {
      if (!leaf.actuator?.enabled) return null;
      const p0 = leaf.panels[0];
      const panelW = leafWidthMm / leaf.panels.length;

      let aOff = 180;
      let bOff = 180;
      const gateB = Math.round(Math.max(250, Math.min(600, panelW * 0.25)));

      if (p0?.type === 'Fold' && p0?.dir === 'Outward' && leaf.actuator?.placement === 'Inside') {
        aOff = 220;
        bOff = 300;
      }

      let maxAngleDeg = 0;
      if (p0.type === 'Swing') maxAngleDeg = 90;
      else if (p0.type === 'Fold') maxAngleDeg = p0.tracked ? 90 : 80;

      const maxAngleRad = (maxAngleDeg * Math.PI) / 180;
      const zD = 0.09;
      const pA = aOff / 1000;
      const pB = bOff / 1000;
      const gB = gateB / 1000;

      const distClosed = Math.hypot(gB - (-pA), -zD - (-pB));
      const bxOpen = gB * Math.cos(maxAngleRad) + (-zD) * Math.sin(maxAngleRad);
      const bzOpen = -gB * Math.sin(maxAngleRad) + (-zD) * Math.cos(maxAngleRad);
      const distOpen = Math.hypot(bxOpen - (-pA), bzOpen - (-pB));

      const maxLen = Math.max(distClosed, distOpen);
      const minLen = Math.min(distClosed, distOpen);
      const stroke = maxLen - minLen;

      return {
        postA: aOff,
        postB: bOff,
        gateB,
        stroke: Math.round(stroke * 1000),
        retracted: Math.round(minLen * 1000),
        extended: Math.round(maxLen * 1000),
        maxAngleDeg,
      };
    };
    const leftW = pendingConfig.totalWidth * pendingConfig.splitRatio;
    const rightW = pendingConfig.totalWidth * (1 - pendingConfig.splitRatio);
    return { left: calc(pendingConfig.left, leftW), right: calc(pendingConfig.right, rightW) };
  }, [pendingConfig]);

  const subOptStyle = {
    display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '22px',
    fontSize: '0.68rem', color: 'var(--text-muted)',
  };

  const renderPanelList = (side, leaf) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {leaf.panels.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(0,0,0,0.03)', borderRadius: '4px', padding: '6px 8px',
            border: '1px solid var(--border-color)',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', minWidth: '16px' }}>
              P{i + 1}
            </span>
            <select value={p.type} onChange={(e) => handlePanelChange(side, i, 'type', e.target.value)}
              style={{ flex: 1, fontSize: '0.78rem', padding: '4px 6px' }}>
              {PANEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => removePanel(side, i)} disabled={leaf.panels.length <= 1}
              style={{ background: 'none', border: 'none', cursor: leaf.panels.length <= 1 ? 'not-allowed' : 'pointer', color: leaf.panels.length <= 1 ? '#ccc' : '#c44536', padding: '2px' }}>
              <Trash2 size={13} />
            </button>
          </div>

          {p.type === 'Fold' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '2px' }}>
              <div style={subOptStyle}>
                <span style={{ minWidth: '28px' }}>Dir</span>
                <select value={p.direction || 'Inward'} onChange={(e) => handlePanelChange(side, i, 'direction', e.target.value)}
                  style={{ flex: 1, fontSize: '0.7rem', padding: '2px 4px' }}>
                  <option value="Inward">Inward</option>
                  <option value="Outward">Outward</option>
                </select>
              </div>
              <label style={{ ...subOptStyle, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!p.tracked}
                  onChange={(e) => handlePanelChange(side, i, 'tracked', e.target.checked)}
                  style={{ accentColor: 'var(--blueprint)' }} />
                Follow Track
              </label>
            </div>
          )}
        </div>
      ))}
      {leaf.panels.length < 6 && (
        <button onClick={() => addPanel(side)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          background: 'none', border: '1px dashed var(--border-color)', borderRadius: '4px',
          padding: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.72rem',
        }}>
          <Plus size={12} /> Add Panel
        </button>
      )}

      <label style={{
        display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px',
        fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer',
        paddingTop: '6px', borderTop: '1px dashed var(--border-color)',
      }}>
        <input type="checkbox" checked={!!leaf.actuator?.enabled}
          onChange={(e) => handleActuatorChange(side, 'enabled', e.target.checked)}
          style={{ accentColor: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>Actuator</span>
      </label>
      {leaf.actuator?.enabled && (
        <div style={{ ...subOptStyle, marginTop: '4px' }}>
          <span style={{ minWidth: '28px' }}>Side</span>
          <select value={leaf.actuator.placement || 'Inside'} onChange={(e) => handleActuatorChange(side, 'placement', e.target.value)}
            style={{ flex: 1, fontSize: '0.7rem', padding: '2px 4px' }}>
            <option value="Inside">Inside</option>
            <option value="Outside">Outside</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderActuatorSpecs = (specs, label) => {
    if (!specs) return null;
    return (
      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>
          {label} Actuator
        </div>
        <div className="ai-item"><span>Post bracket A:</span> <strong>{specs.postA} mm</strong></div>
        <div className="ai-item"><span>Post bracket B:</span> <strong>{specs.postB} mm</strong></div>
        <div className="ai-item"><span>Gate bracket:</span> <strong>{specs.gateB} mm</strong></div>
        <div className="ai-item"><span>Stroke:</span> <strong>{specs.stroke} mm</strong></div>
        <div className="ai-item"><span>Retracted:</span> <strong>{specs.retracted} mm</strong></div>
        <div className="ai-item"><span>Extended:</span> <strong>{specs.extended} mm</strong></div>
        <div className="ai-item"><span>Travel angle:</span> <strong>{specs.maxAngleDeg}°</strong></div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      {isLoading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.8)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '12px', backdropFilter: 'blur(4px)'
        }}>
          <Loader2 size={48} className="button-pulse" style={{ color: 'var(--blueprint)' }} />
          <div style={{ fontWeight: 600, color: 'var(--blueprint)', letterSpacing: '1px' }}>LOADING CONFIGURATION...</div>
        </div>
      )}

      {!isReadOnly && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <Settings size={24} style={{ color: 'var(--blueprint)' }} />
            <h1>GateSim Pro</h1>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
              <button onClick={() => fileInputRef.current?.click()} title="Open config file"
                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '5px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <FolderOpen size={16} />
              </button>
              <button onClick={saveConfig} title="Save config to file"
                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '5px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <Save size={16} />
              </button>
              <button onClick={shareConfig} title="Copy publish link"
                disabled={isSharing}
                className={shareSuccess ? 'share-success button-pulse' : ''}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '5px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  opacity: isSharing ? 0.5 : 1
                }}>
                {isSharing ? <Loader2 size={16} className="button-pulse" /> : <Share2 size={16} />}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".gatesim,.json" onChange={openConfig}
              style={{ display: 'none' }} />
          </div>

          <div className="sidebar-section">
            <h2><Sliders size={16} /> Operation</h2>
            <div className="input-group">
              <label>
                <span>Open %</span>
                <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{openPercent}%</span>
              </label>
              <input type="range" min="0" max="100" value={openPercent} onChange={(e) => setOpenPercent(Number(e.target.value))} />
            </div>
          </div>

          <div className="sidebar-section">
            <h2>Geometry</h2>
            <div className="input-group">
              <label>Total Width (mm)</label>
              <input type="number" name="totalWidth" value={pendingConfig.totalWidth} onChange={handleTopChange} step="100" />
            </div>
            <div className="input-group">
              <label>Gate Height (mm)</label>
              <input type="number" name="height" value={pendingConfig.height} onChange={handleTopChange} step="100" />
            </div>
            <div className="input-group">
              <label>
                <span>Width Split</span>
                <span>{Math.round(pendingConfig.splitRatio * 100)}% / {Math.round((1 - pendingConfig.splitRatio) * 100)}%</span>
              </label>
              <input type="range" min="0.1" max="0.9" step="0.05" name="splitRatio" value={pendingConfig.splitRatio} onChange={handleTopChange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '0.75rem' }}>
              <div className="side-card">
                <span className="side-tag">Left Leaf</span>
                {renderPanelList('left', pendingConfig.left)}
              </div>
              <div className="side-card">
                <span className="side-tag">Right Leaf</span>
                {renderPanelList('right', pendingConfig.right)}
              </div>
            </div>
          </div>

          <div className="sidebar-section ai-recommended">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--blueprint)', marginBottom: '0.75rem' }}>
              <Zap size={16} fill="currentColor" />
              <h2 style={{ margin: 0, color: 'inherit', fontSize: '0.85rem' }}>Specs</h2>
            </div>
            <div className="ai-report">
              {renderActuatorSpecs(actuatorSpecs.left, 'Left')}
              {renderActuatorSpecs(actuatorSpecs.right, 'Right')}
              {!actuatorSpecs.left && !actuatorSpecs.right && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Enable an actuator on a leaf to see specs
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '1.25rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)', background: '#fff', display: 'flex', gap: '8px' }}>
            <button onClick={handleApply} disabled={!isDirty} className="export-btn"
              style={{ flex: 1, backgroundColor: isDirty ? 'var(--success)' : 'var(--border-color)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Check size={18} /> Apply
            </button>
            <button className="export-btn" onClick={() => setShowModal(true)}
              style={{ flex: 1, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileText size={16} /> Export
            </button>
          </div>
        </aside>
      )}

      <main className="main-content" style={{ paddingLeft: isReadOnly ? 0 : 'var(--sidebar-width)', width: '100%', height: '100%', position: 'relative' }}>
        <div className="canvas-container" style={{ width: '100%', height: '100%' }}>
          <GateSim openPercent={openPercent} config={config}
            motor={{ aOffset: 150, bOffset: 150 }} overloaded={false} />
        </div>

        {isReadOnly && (
          <div className="playback-bar" style={{
            position: 'absolute',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: '600px',
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 100
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <button
                className="player-btn"
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  backgroundColor: 'var(--blueprint)', color: 'white',
                  border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>

              <button
                onClick={() => { setOpenPercent(0); setIsPlaying(false); }}
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  backgroundColor: 'white', color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <RotateCcw size={18} />
              </button>

              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blueprint)', letterSpacing: '1px' }}>
                    {openPercent === 100 ? 'OPENED' : openPercent === 0 ? 'CLOSED' : isPlaying ? 'OPERATING...' : 'PAUSED'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>{openPercent}%</span>
                </div>
                <input
                  type="range" min="0" max="100" value={openPercent}
                  onChange={(e) => {
                    setOpenPercent(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  style={{ width: '100%', accentColor: 'var(--blueprint)', height: '6px', cursor: 'pointer' }}
                />
              </div>

              <button
                onClick={exitReadOnly}
                className="edit-btn"
                style={{
                  padding: '8px 16px', borderRadius: '8px',
                  backgroundColor: 'white', color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 600
                }}
              >
                EDIT
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', fontSize: '0.65rem', color: 'var(--text-muted)', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>PREVIEW MODE</span>
              <span>•</span>
              <span>{Math.round(config.totalWidth / 1000)}m x {Math.round(config.height / 1000)}m</span>
            </div>
          </div>
        )}
      </main>

      {/* Legacy Modals */}
      {showModal && <div className="modal-backdrop visible" onClick={() => setShowModal(false)} />}
    </div>
  );
}
