import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { DashboardPage } from './pages/DashboardPage';
import { CamerasPage } from './pages/CamerasPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { TestingPage } from './pages/TestingPage';
import { LocalizationPage } from './pages/LocalizationPage';
import { LiveStreamPage } from './pages/LiveStreamPage';

const PAGE_CONFIGS = {
  dashboard: {
    title: 'Surveillance Dashboard',
    subtitle: 'High-level telemetry, active cameras, and end-to-end localization pipeline architecture',
  },
  stream: {
    title: 'Live Mobile Camera Stream',
    subtitle: 'Low-latency WebRTC video streaming from mobile phone to desktop surveillance console',
  },
  cameras: {
    title: 'Perimeter Static Cameras',
    subtitle: 'Create, inspect, configure, and manage fixed border surveillance cameras in SQLite',
  },
  calibration: {
    title: 'Camera Calibration & Reference Pillars',
    subtitle: 'Independent camera calibration workspace with interactive pillar point registration',
  },
  testing: {
    title: 'Testing & Ground-Truth Validation',
    subtitle: 'Evaluate intrusion localization, two-frame motion vectors, and real-value error metrics against ground truth (Phase 3B)',
  },
  localization: {
    title: 'Live Localization & Motion Ingestion',
    subtitle: 'Architectural placeholder for real-time detection event ingestion and motion vectors (Phase 4)',
  },
};

export default function App() {
  // Check if opened with ?mode=broadcaster on phone or ?tab=stream
  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get('mode') === 'broadcaster' || searchParams.get('tab') === 'stream'
    ? 'stream'
    : 'dashboard';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const showToast = (toastObj) => {
    setToast(toastObj);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast({ type: 'info', message: 'Synchronized with database.' });
    }, 400);
  };

  const pageConfig = PAGE_CONFIGS[activeTab] || PAGE_CONFIGS.dashboard;

  return (
    <div className="app-container">
      {/* Tactical Sidebar */}
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="main-content">
        <Header
          title={pageConfig.title}
          subtitle={pageConfig.subtitle}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <main className="content-wrapper" key={refreshKey}>
          {activeTab === 'dashboard' && <DashboardPage onNavigate={setActiveTab} />}
          {activeTab === 'stream' && <LiveStreamPage showToast={showToast} />}
          {activeTab === 'cameras' && <CamerasPage showToast={showToast} onNavigate={setActiveTab} />}
          {activeTab === 'calibration' && <CalibrationPage showToast={showToast} />}
          {activeTab === 'testing' && <TestingPage showToast={showToast} onNavigate={setActiveTab} />}
          {activeTab === 'localization' && <LocalizationPage showToast={showToast} />}
        </main>
      </div>

      {/* Floating Alert Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
