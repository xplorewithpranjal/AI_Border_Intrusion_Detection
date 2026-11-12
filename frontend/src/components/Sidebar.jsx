import React from 'react';
import {
  LayoutDashboard,
  Camera,
  Video,
  Crosshair,
  CheckCircle,
  Radio,
  ShieldAlert,
  Layers,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
  { id: 'stream', label: 'Live Stream', icon: Video, badge: 'WebRTC' },
  { id: 'cameras', label: 'Cameras', icon: Camera, badge: 'CRUD' },
  { id: 'calibration', label: 'Calibration', icon: Crosshair, badge: 'Phase 1' },
  { id: 'testing', label: 'Testing / Validation', icon: CheckCircle, badge: 'Phase 1' },
  { id: 'localization', label: 'Live Localization', icon: Radio, badge: 'Phase 1' },
];

export function Sidebar({ activeTab, onSelectTab }) {
  return (
    <aside
      style={{
        width: '260px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '1.5rem 1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.2))',
            border: '1px solid var(--cyan-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--cyan-400)',
            boxShadow: '0 0 15px var(--cyan-glow)',
          }}
        >
          <ShieldAlert size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.04em', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            GEOLOC CORE
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Static Border Cam System
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ padding: '1.25rem 0.85rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.5rem 0.6rem 0.25rem' }}>
          Surveillance Modules
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                border: isActive ? '1px solid rgba(6, 182, 212, 0.35)' : '1px solid transparent',
                color: isActive ? 'var(--cyan-400)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <Icon size={18} style={{ color: isActive ? 'var(--cyan-400)' : 'inherit' }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '0.12rem 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    background: item.id === 'stream' ? 'rgba(16, 185, 129, 0.2)' : isActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: item.id === 'stream' ? 'var(--emerald-400)' : isActive ? 'var(--cyan-400)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* System Architecture Footer Card */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
        <div
          style={{
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-darkest)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Layers size={14} color="var(--cyan-400)" />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cyan-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Phase 2 WebRTC Active
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Live mobile camera WebRTC video transport, WebSocket signaling, and geometric ground calibration core.
          </p>
        </div>
      </div>
    </aside>
  );
}
