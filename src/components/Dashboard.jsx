import React, { useState, useMemo, useRef } from 'react';
import { Settings, Sliders, FileText, X, Check, Zap, Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import GateSim from './GateSim';

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
  const fileInputRef = useRef(null);

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

      // Auto-calculate A, B, C per typical BFT standards
      const aOff = 180;  // Post offset A (X-axis into the post)
      const bOff = 180;  // Post offset B (Z-axis inward)
      const gateB = Math.round(Math.max(250, Math.min(600, panelW * 0.25))); // distance along gate

      // Max angle of first panel
      let maxAngleDeg = 0;
      if (p0.type === 'Swing') maxAngleDeg = 90;
      else if (p0.type === 'Fold') maxAngleDeg = p0.tracked ? 90 : 80;

      const maxAngleRad = (maxAngleDeg * Math.PI) / 180;

      const zD = 0.09; // approximate panel thickness + clearance
      const pA = aOff / 1000;
      const pB = bOff / 1000;
      const gB = gateB / 1000;

      // Gate closed (0 deg). A = (-pA, 0, -pB). B = (gB, 0, -zD).
      const distClosed = Math.hypot(gB - (-pA), -zD - (-pB));

      // Gate open (maxAngle). Gate Bracket rotated around Y.
      const bxOpen = gB * Math.cos(maxAngleRad) + (-zD) * Math.sin(maxAngleRad);
      const bzOpen = -gB * Math.sin(maxAngleRad) + (-zD) * Math.cos(maxAngleRad);
      const distOpen = Math.hypot(bxOpen - (-pA), bzOpen - (-pB));

      const maxLen = Math.max(distClosed, distOpen);
      const minLen = Math.min(distClosed, distOpen);
      const stroke = maxLen - minLen;

      return {
        aOff, bOff, gateB,
        stroke: Math.round(stroke * 1000),
        minLength: Math.round(minLen * 1000),
        maxLength: Math.round(maxLen * 1000),
        maxAngleDeg,
      };
    };
    const leftW = config.totalWidth * config.splitRatio;
    const rightW = config.totalWidth * (1 - config.splitRatio);
    return { left: calc(config.left, leftW), right: calc(config.right, rightW) };
  }, [config]);

  const subOptStyle = {
    display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '22px',
    fontSize: '0.68rem', color: 'var(--text-muted)',
  };

  const smallInputStyle = {
    width: '52px', fontSize: '0.7rem', padding: '2px 4px',
    border: '1px solid var(--border-color)', borderRadius: '3px',
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

      {/* ——— Linear Actuator ——— */}
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
        <div className="ai-item"><span>Post bracket A:</span> <strong>{specs.aOff} mm</strong></div>
        <div className="ai-item"><span>Post bracket B:</span> <strong>{specs.bOff} mm</strong></div>
        <div className="ai-item"><span>Gate bracket:</span> <strong>{specs.gateB} mm</strong></div>
        <div className="ai-item"><span>Stroke:</span> <strong>{specs.stroke} mm</strong></div>
        <div className="ai-item"><span>Retracted:</span> <strong>{specs.minLength} mm</strong></div>
        <div className="ai-item"><span>Extended:</span> <strong>{specs.maxLength} mm</strong></div>
        <div className="ai-item"><span>Travel angle:</span> <strong>{specs.maxAngleDeg}°</strong></div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
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

      <main className="main-content">
        <div className="canvas-container">
          <GateSim openPercent={openPercent} config={config}
            motor={{ aOffset: 150, bOffset: 150 }} overloaded={false} />
        </div>
      </main>
    </div>
  );
}
