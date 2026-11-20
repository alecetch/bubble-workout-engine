import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import * as Haptics from 'expo-haptics';
import { useSegmentTimer } from './useSegmentTimer';
import { useTimerStore } from '../../state/timer/useTimerStore';
vi.mock('expo-haptics',()=>({notificationAsync:vi.fn().mockResolvedValue(undefined),NotificationFeedbackType:{Success:'success'}}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));useTimerStore.setState({entries:{},restOverrides:{},activeSegmentId:null});vi.mocked(Haptics.notificationAsync).mockClear();});
afterEach(()=>vi.useRealTimers());
it('countdown supports pause and reset, then finishes once without a negative display',()=>{
  const {result}=renderHook(()=>useSegmentTimer({segmentId:'segment',segmentTotal:2,restTotal:0}));
  expect(result.current.displaySeconds).toBe(2);act(()=>{result.current.onStartPause();vi.advanceTimersByTime(1100);});expect(result.current.displaySeconds).toBe(1);
  act(()=>{result.current.onStartPause();vi.advanceTimersByTime(2000);});expect(result.current.displaySeconds).toBe(1);
  act(()=>{result.current.onReset();vi.advanceTimersByTime(300);});expect(result.current.displaySeconds).toBe(2);
  act(()=>{result.current.onStartPause();vi.advanceTimersByTime(4000);});expect(result.current.displaySeconds).toBe(0);expect(result.current.segmentFinished).toBe(true);expect(result.current.isRunning).toBe(false);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});
it('rest mode charges elapsed time to a countdown and returns to segment flow',()=>{
  const {result}=renderHook(()=>useSegmentTimer({segmentId:'segment',segmentTotal:30,restTotal:2}));
  act(()=>result.current.onSwitchMode());expect(useTimerStore.getState().entries.segment.activeMode).toBe('segment');
  act(()=>{result.current.onStartPause();vi.advanceTimersByTime(1000);result.current.onSwitchMode();vi.advanceTimersByTime(300);});
  expect(result.current.activeMode).toBe('rest');expect(result.current.hasRest).toBe(true);
  act(()=>{result.current.onReset();vi.advanceTimersByTime(300);result.current.onStartPause();vi.advanceTimersByTime(2400);});
  expect(useTimerStore.getState().entries.segment.activeMode).toBe('segment');expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});
it('count-up mode grows without a segment expiry and cleans up polling on unmount',()=>{
  const {result,unmount}=renderHook(()=>useSegmentTimer({segmentId:'segment',segmentTotal:null,restTotal:0}));
  act(()=>{result.current.onStartPause();vi.advanceTimersByTime(3100);});expect(result.current.displaySeconds).toBe(3);expect(result.current.progress).toBe(1);expect(result.current.segmentFinished).toBe(false);expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  unmount();expect(vi.getTimerCount()).toBe(0);
});
