import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Server, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { healthApi } from '../api/healthApi';

export function Header({ title, subtitle, onRefresh, isRefreshing }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const data = await healthApi.check();
      setHealth(data);
    } catch {
      setHealth({ status: 'offline', database_connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health && health.status === 'healthy';

  return (
    <header
      style={{
        backgroundColor: 'rgba(11, 15, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '1.1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* System Health Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.85rem',
            borderRadius: 'var(--radius-full)',
            background: isHealthy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
            border: `1px solid ${isHealthy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            fontSize: '0.78rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {isHealthy ? (
            <CheckCircle2 size={14} color="var(--emerald-400)" />
          ) : (
            <AlertTriangle size={14} color="var(--rose-400)" />
          )}
          <span style={{ color: isHealthy ? 'var(--emerald-400)' : 'var(--rose-400)', fontWeight: 600 }}>
            {isHealthy ? 'API & SQLite: Online' : 'Backend Offline'}
          </span>
        </div>

        {/* Phase Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            fontSize: '0.75rem',
            color: 'var(--cyan-400)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
          }}
        >
          <ShieldCheck size={14} />
          <span>PHASE 1</span>
        </div>

        {/* Manual Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn btn-secondary"
            title="Refresh current view"
            style={{ padding: '0.45rem 0.75rem' }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span style={{ fontSize: '0.8rem' }}>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
}
