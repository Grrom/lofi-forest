import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { PomoCard } from './PomoCard';
import { PomodoroController } from '../systems/PomodoroController';
import { StorageManager } from '../systems/StorageManager';

describe('PomoCard Component', () => {
  beforeEach(() => {
    StorageManager.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test: the countdown renders 24:59 one second after start.
  it('the countdown renders 24:59 one second after start', () => {
    vi.useFakeTimers();
    let currentTime = 1000000;
    const now = () => currentTime;

    const controller = new PomodoroController({
      now,
      focusMin: 25,
      breakMin: 5,
      preset: '25/5',
      autoDriver: false,
    });

    render(<PomoCard controller={controller} />);

    // Initially at 25:00
    expect(screen.getByText('25:00')).toBeDefined();

    // Click start
    const startBtn = screen.getByRole('button', { name: /start pomodoro/i });
    fireEvent.click(startBtn);

    expect(screen.getByText('Focus')).toBeDefined();

    // Advance 1 second (1000 ms)
    act(() => {
      currentTime += 1000;
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('24:59')).toBeDefined();

    controller.destroy();
  });

  it('renders phase label and buttons (start, pause, resume, reset, skip)', () => {
    const controller = new PomodoroController({ autoDriver: false });
    render(<PomoCard controller={controller} />);

    expect(screen.getByText('Idle')).toBeDefined();
    const startBtn = screen.getByRole('button', { name: /start pomodoro/i });
    expect(startBtn).toBeDefined();

    // Start
    fireEvent.click(startBtn);
    expect(screen.getByText('Focus')).toBeDefined();

    // Pause button now visible
    const pauseBtn = screen.getByRole('button', { name: /pause pomodoro/i });
    expect(pauseBtn).toBeDefined();
    fireEvent.click(pauseBtn);

    // Resume button now visible
    const resumeBtn = screen.getByRole('button', { name: /resume pomodoro/i });
    expect(resumeBtn).toBeDefined();
    fireEvent.click(resumeBtn);

    // Skip
    const skipBtn = screen.getByRole('button', { name: /skip pomodoro/i });
    fireEvent.click(skipBtn);
    expect(screen.getByText('Break')).toBeDefined();

    // Reset
    const resetBtn = screen.getByRole('button', { name: /reset pomodoro/i });
    fireEvent.click(resetBtn);
    expect(screen.getByText('Idle')).toBeDefined();

    controller.destroy();
  });

  it('preset picker switches presets and persists to StorageManager', () => {
    const controller = new PomodoroController({ autoDriver: false });
    render(<PomoCard controller={controller} />);

    const select = screen.getByLabelText(/pomodoro preset/i) as HTMLSelectElement;
    expect(select.value).toBe('25/5');

    fireEvent.change(select, { target: { value: '50/10' } });
    expect(controller.focusMin).toBe(50);
    expect(controller.breakMin).toBe(10);
    expect(StorageManager.get().pomo.preset).toBe('50/10');

    // Switch to custom
    fireEvent.change(select, { target: { value: 'custom' } });
    expect(screen.getByLabelText(/custom focus minutes/i)).toBeDefined();
    expect(screen.getByLabelText(/custom break minutes/i)).toBeDefined();

    controller.destroy();
  });
});
