import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const { type = 'info', message } = toast;

  let Icon = Info;
  let borderColor = 'var(--cyan-500)';
  let iconColor = 'var(--cyan-400)';

  if (type === 'success') {
    Icon = CheckCircle2;
    borderColor = 'var(--emerald-500)';
    iconColor = 'var(--emerald-400)';
  } else if (type === 'error') {
    Icon = XCircle;
    borderColor = 'var(--rose-500)';
    iconColor = 'var(--rose-400)';
  } else if (type === 'warning') {
    Icon = AlertTriangle;
    borderColor = 'var(--amber-500)';
    iconColor = 'var(--amber-400)';
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 2000,
        background: 'rgba(17, 24, 39, 0.95)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
        padding: '0.9rem 1.2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        minWidth: '280px',
        maxWidth: '420px',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <Icon size={20} color={iconColor} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '0.2rem',
          display: 'flex',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
