import React from 'react';

export function StatusBadge({ status = 'uncalibrated' }) {
  const norm = (status || '').toLowerCase();
  
  let badgeClass = 'badge-uncalibrated';
  let label = status;

  if (norm === 'calibrated' || norm === 'active' || norm === 'healthy') {
    badgeClass = 'badge-calibrated';
  } else if (norm === 'failed' || norm === 'inactive' || norm === 'degraded') {
    badgeClass = 'badge-inactive';
  } else if (norm === 'uncalibrated' || norm === 'pending' || norm === 'maintenance') {
    badgeClass = 'badge-uncalibrated';
  }

  return (
    <span className={`badge ${badgeClass}`}>
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
