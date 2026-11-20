import React from 'react';
import { Animated, Linking } from 'react-native';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TechniqueSheet } from './TechniqueSheet';
const query=vi.hoisted(()=>vi.fn());
vi.mock('../../api/hooks',()=>({useExerciseGuidance:query}));
vi.mock('../interaction/PressableScale',()=>({PressableScale:({children,onPress}:any)=><button onClick={onPress}>{children}</button>}));
beforeEach(()=>{
  query.mockReturnValue({data:undefined,isLoading:false,isError:false});
  vi.spyOn(Animated,'spring').mockReturnValue({start:vi.fn(),stop:vi.fn(),reset:vi.fn()});
  vi.spyOn(Animated,'timing').mockReturnValue({start:vi.fn(),stop:vi.fn(),reset:vi.fn()});
});
afterEach(()=>vi.restoreAllMocks());
it('does not request guidance while hidden and handles an empty guidance result',()=>{
  const {rerender}=render(<TechniqueSheet visible={false} exerciseId="squat" exerciseName={null} onClose={()=>{}}/>);
  expect(query).toHaveBeenCalledWith(null);
  rerender(<TechniqueSheet visible exerciseId="squat" exerciseName={null} onClose={()=>{}}/>);
  expect(query).toHaveBeenLastCalledWith('squat');expect(screen.getByText('No technique notes for this exercise yet.')).toBeInTheDocument();
});
it('renders technique content, opens its video and closes the sheet',()=>{
  const close=vi.fn(),open=vi.spyOn(Linking,'openURL').mockResolvedValue(undefined);
  query.mockReturnValue({data:{techniqueCue:'Brace firmly',coachingCues:['Keep heels down'],techniqueSetup:'Set your feet',techniqueExecution:['Lower slowly'],techniqueMistakes:['Knees cave'],loadGuidance:'Start light',loggingGuidance:'Log every set',techniqueVideoUrl:'https://example.test/squat'},isLoading:false,isError:false});
  render(<TechniqueSheet visible exerciseId="squat" exerciseName="Squat" onClose={close}/>);
  for(const text of ['Brace firmly','Keep heels down','Set your feet','Lower slowly','Knees cave','Start light','Log every set'])expect(screen.getByText(text)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Open video'}));expect(open).toHaveBeenCalledWith('https://example.test/squat');
  fireEvent.click(screen.getByLabelText('Close technique sheet'));expect(close).toHaveBeenCalledTimes(1);
});
it('shows a recoverable guidance error rather than claiming no notes exist',()=>{
  query.mockReturnValue({isLoading:false,isError:true,error:new Error('Guidance unavailable')});
  render(<TechniqueSheet visible exerciseId="squat" exerciseName="Squat" onClose={()=>{}}/>);
  expect(screen.getByText('Guidance unavailable')).toBeInTheDocument();expect(screen.queryByText('No technique notes for this exercise yet.')).not.toBeInTheDocument();
});
