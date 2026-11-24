import React, { useState, useEffect } from 'react';
import {
  pomodoroController,
  PomodoroController,
  formatTimerMs,
} from '../systems/PomodoroController';
import { usePrefs, type PomoPreset } from '../systems/StorageManager';

interface PomoCardProps {
  controller?: PomodoroController;
}

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontFamily: 'monospace',
  fontSize: '11px',
  cursor: 'pointer',
  backgroundColor: 'rgba(30, 40, 30, 0.9)',
  color: '#e0eee0',
  border: '1px solid #334433',
  borderRadius: '4px',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#141914',
  color: '#e0eee0',
  border: '1px solid #334433',
  borderRadius: '4px',
  padding: '2px 4px',
  fontFamily: 'monospace',
  fontSize: '11px',
  width: '100%',
  boxSizing: 'border-box',
};

export const PomoCard: React.FC<PomoCardProps> = ({
  controller = pomodoroController,
}) => {
  const prefs = usePrefs();
  const [state, setState] = useState(() => controller.getState());
  const [remainingMs, setRemainingMs] = useState(() => controller.remainingMs());
  const [customFocus, setCustomFocus] = useState(prefs.pomo.focusMin);
  const [customBreak, setCustomBreak] = useState(prefs.pomo.breakMin);

  useEffect(() => {
    const unsub = controller.subscribe((newState) => {
      setState(newState);
      setRemainingMs(controller.remainingMs());
    });
    return unsub;
  }, [controller]);

  useEffect(() => {
    // If running, tick remainingMs every 250ms for smooth UI display
    if (state.phase === 'idle' || state.pausedRemainingMs !== null) {
      setRemainingMs(controller.remainingMs());
      return;
    }

    const interval = setInterval(() => {
      setRemainingMs(controller.remainingMs());
    }, 250);

    return () => clearInterval(interval);
  }, [state.phase, state.pausedRemainingMs, state.endsAtMs, controller]);

  const handleStart = () => {
    controller.start();
  };

  const handlePause = () => {
    controller.pause();
  };

  const handleResume = () => {
    controller.resume();
  };

  const handleReset = () => {
    controller.reset();
  };

  const handleSkip = () => {
    controller.skip();
  };

  const handlePresetChange = (preset: PomoPreset) => {
    if (preset === '25/5') {
      controller.setPreset('25/5', 25, 5);
    } else if (preset === '50/10') {
      controller.setPreset('50/10', 50, 10);
    } else {
      controller.setPreset('custom', customFocus, customBreak);
    }
  };

  const handleCustomFocusChange = (val: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(val || 1)));
    setCustomFocus(clamped);
    if (prefs.pomo.preset === 'custom') {
      controller.setPreset('custom', clamped, customBreak);
    }
  };

  const handleCustomBreakChange = (val: number) => {
    const clamped = Math.max(1, Math.min(60, Math.round(val || 1)));
    setCustomBreak(clamped);
    if (prefs.pomo.preset === 'custom') {
      controller.setPreset('custom', customFocus, clamped);
    }
  };

  const isPaused = state.pausedRemainingMs !== null;

  const phaseLabel =
    state.phase === 'focus'
      ? 'Focus'
      : state.phase === 'break'
        ? 'Break'
        : 'Idle';

  return (
    <div
      className="hud-pomo-card"
      style={{
        backgroundColor: 'rgba(20, 25, 20, 0.85)',
        border: '1px solid #334433',
        borderRadius: '8px',
        padding: '10px 14px',
        color: '#e0eee0',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxWidth: '240px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 'bold',
          marginBottom: '8px',
          borderBottom: '1px solid #334433',
          paddingBottom: '4px',
        }}
      >
        <span>Pomodoro</span>
        <span
          className="pomo-phase-label"
          style={{
            fontSize: '11px',
            color:
              state.phase === 'focus'
                ? '#4ade80'
                : state.phase === 'break'
                  ? '#f59e0b'
                  : '#9ca3af',
          }}
        >
          {phaseLabel}
        </span>
      </div>

      <div
        className="pomo-countdown"
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          textAlign: 'center',
          letterSpacing: '2px',
          margin: '8px 0',
          color:
            state.phase === 'focus'
              ? '#4ade80'
              : state.phase === 'break'
                ? '#f59e0b'
                : '#e0eee0',
        }}
      >
        {formatTimerMs(remainingMs)}
      </div>

      {/* Action buttons: Start, Pause, Resume, Reset, Skip */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          justifyContent: 'center',
          marginBottom: '10px',
        }}
      >
        {state.phase === 'idle' ? (
          <button
            type="button"
            className="pomo-start-btn"
            onClick={handleStart}
            aria-label="Start Pomodoro"
            style={btnStyle}
          >
            Start
          </button>
        ) : isPaused ? (
          <button
            type="button"
            className="pomo-resume-btn"
            onClick={handleResume}
            aria-label="Resume Pomodoro"
            style={btnStyle}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="pomo-pause-btn"
            onClick={handlePause}
            aria-label="Pause Pomodoro"
            style={btnStyle}
          >
            Pause
          </button>
        )}

        <button
          type="button"
          className="pomo-reset-btn"
          onClick={handleReset}
          aria-label="Reset Pomodoro"
          style={btnStyle}
        >
          Reset
        </button>

        <button
          type="button"
          className="pomo-skip-btn"
          onClick={handleSkip}
          aria-label="Skip Pomodoro"
          style={btnStyle}
        >
          Skip
        </button>
      </div>

      {/* Preset Picker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <label htmlFor="pomo-preset-select" style={{ fontSize: '11px' }}>
            Preset:
          </label>
          <select
            id="pomo-preset-select"
            aria-label="Pomodoro Preset"
            value={prefs.pomo.preset}
            onChange={(e) => handlePresetChange(e.target.value as PomoPreset)}
            style={{
              backgroundColor: '#141914',
              color: '#e0eee0',
              border: '1px solid #334433',
              borderRadius: '4px',
              padding: '2px 6px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            <option value="25/5">25/5</option>
            <option value="50/10">50/10</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {prefs.pomo.preset === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <label
                htmlFor="custom-focus-min"
                style={{ fontSize: '10px', color: '#9ca3af' }}
              >
                Focus (m)
              </label>
              <input
                id="custom-focus-min"
                type="number"
                min="1"
                max="180"
                aria-label="Custom Focus Minutes"
                value={customFocus}
                onChange={(e) =>
                  handleCustomFocusChange(Number(e.target.value))
                }
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <label
                htmlFor="custom-break-min"
                style={{ fontSize: '10px', color: '#9ca3af' }}
              >
                Break (m)
              </label>
              <input
                id="custom-break-min"
                type="number"
                min="1"
                max="60"
                aria-label="Custom Break Minutes"
                value={customBreak}
                onChange={(e) =>
                  handleCustomBreakChange(Number(e.target.value))
                }
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
