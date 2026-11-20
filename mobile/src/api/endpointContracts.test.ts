import { beforeEach, expect, it, vi } from 'vitest';
import { authGetJson, authPostJson, authPatchJson, authDeleteJson, authenticatedFetch, authPostFormData, getJson, ApiError } from './client';
import * as history from './history';
import { getEquipmentItemsForPreset } from './equipmentPresets';
import { getProgramEquipment, regenerateProgramDays } from './equipmentRegen';
import { addBonusDay } from './bonusDayApi';
import { getReferenceData } from './referenceData';
import { fetchReferralInfo, fetchReferralStats } from './referral';
import { getPreferredUnit, getPreferredHeightUnit, updatePreferredUnit, updatePreferredHeightUnit } from './profileApi';
import { getMe } from './me';
import { getClientProfile } from './clientProfiles';
import { fetchExerciseGuidance, normalizeGuidance } from './exerciseGuidance';
import { getExerciseSwapOptions, applyExerciseSwap } from './programExercise';
import { getCheckIns, submitCheckIn, triggerAnalysis, deleteCheckIn, recordConsent } from './physique';
import { getScans, getScan, getScanTrend, deleteScan, getMilestones, getComparison, submitScan } from './physiqueScan';
import { uploadTrainingHistoryCsv, getTrainingHistoryImport } from './trainingHistoryImport';
import { skipProgramDay, rescheduleProgramDay, pollSubstitutionJob } from './programDayActions';
vi.mock('./client', async original => ({...await original<typeof import('./client')>(), authGetJson:vi.fn(),authPostJson:vi.fn(),authPatchJson:vi.fn(),authDeleteJson:vi.fn(),authenticatedFetch:vi.fn(),authPostFormData:vi.fn(),getJson:vi.fn()}));
vi.mock('./tokenStorage',()=>({getAccessToken:vi.fn(),getRefreshToken:vi.fn(),saveTokens:vi.fn(),clearTokens:vi.fn()}));
vi.mock('./me',()=>({getMe:vi.fn()}));
vi.mock('./clientProfiles',()=>({getClientProfile:vi.fn()}));
beforeEach(()=>{
  vi.clearAllMocks();
  for(const fn of [authGetJson,authPostJson,authPatchJson,authDeleteJson,authenticatedFetch,authPostFormData,getJson])vi.mocked(fn).mockResolvedValue({ok:true});
});
it('loads public reference data and preset options without an authenticated endpoint',async()=>{
  await getReferenceData();await getEquipmentItemsForPreset('commercial_gym');
  expect(getJson).toHaveBeenNthCalledWith(1,'/reference-data');expect(getJson).toHaveBeenNthCalledWith(2,'/equipment-items?preset=commercial_gym');expect(authGetJson).not.toHaveBeenCalled();
});
it('preserves selected day IDs and equipment when regenerating a program',async()=>{
  const body={dayIds:['day-1'],equipmentPresetSlug:null,equipmentItemSlugs:['bodyweight']};
  await getProgramEquipment('program');await regenerateProgramDays('program',body);
  expect(authGetJson).toHaveBeenCalledWith('/api/program/program/equipment');expect(authPostJson).toHaveBeenCalledWith('/api/program/program/regenerate-days',body);
  const error=new ApiError(403,'not owned');vi.mocked(authPostJson).mockRejectedValueOnce(error);await expect(regenerateProgramDays('program',body)).rejects.toBe(error);
});
it('encodes bonus-day and day-action identifiers and preserves action payloads',async()=>{
  const body={focusType:null,programType:'strength',scope:'today' as const,targetDate:'2026-11-20',weekday:'Fri'};
  await addBonusDay('program/id',body);await skipProgramDay('program/id','day/id','illness');await skipProgramDay('program/id','day/id');
  await rescheduleProgramDay('program/id','day/id','2026-12-01');await pollSubstitutionJob('program/id','job/id');
  expect(authPostJson).toHaveBeenCalledWith('/api/programs/program%2Fid/bonus-day',body);
  expect(authPostJson).toHaveBeenCalledWith('/api/programs/program%2Fid/days/day%2Fid/skip',{reason:'illness'});
  expect(authPostJson).toHaveBeenCalledWith('/api/programs/program%2Fid/days/day%2Fid/skip',{});
  expect(authPostJson).toHaveBeenCalledWith('/api/programs/program%2Fid/days/day%2Fid/reschedule',{targetDate:'2026-12-01'});
  expect(authGetJson).toHaveBeenCalledWith('/api/programs/program%2Fid/equipment-substitution/job%2Fid');
});
it('uses safe referral defaults and preserves populated stats',async()=>{
  expect(await fetchReferralInfo()).toEqual({code:'',shareUrl:''});
  expect(await fetchReferralStats()).toEqual({totalReferrals:0,conversions:0,rewardsGranted:0,rewardsPending:0,rewardsCapped:0,rewardCapPerYear:2,rewardsRemainingThisYear:0});
  const stats={totalReferrals:4,conversions:3,rewardsGranted:1,rewardsPending:1,rewardsCapped:1,rewardCapPerYear:2,rewardsRemainingThisYear:1};
  vi.mocked(authGetJson).mockResolvedValueOnce(stats);expect(await fetchReferralStats()).toEqual(stats);
  vi.mocked(authGetJson).mockResolvedValueOnce({code:'CODE',shareUrl:'https://200days.app/ref/CODE'});expect(await fetchReferralInfo()).toEqual({code:'CODE',shareUrl:'https://200days.app/ref/CODE'});
});
it.each([null,'profile'])('reads preference defaults when profile is %s and sends preference updates',async profileId=>{
  vi.mocked(getMe).mockResolvedValue({id:'user',clientProfileId:profileId});
  vi.mocked(getClientProfile).mockResolvedValue({preferredUnit:'lbs',preferredHeightUnit:'ft'} as any);
  expect(await getPreferredUnit()).toBe(profileId?'lbs':'kg');expect(await getPreferredHeightUnit()).toBe(profileId?'ft':'cm');
  if(!profileId)expect(getClientProfile).not.toHaveBeenCalled();
  await updatePreferredUnit('kg');await updatePreferredHeightUnit('cm');
  expect(authPatchJson).toHaveBeenCalledWith('/api/users/me',{preferredUnit:'kg'});expect(authPatchJson).toHaveBeenCalledWith('/api/users/me',{preferredHeightUnit:'cm'});
});
it('normalizes guidance arrays and old media field names instead of trusting malformed values',async()=>{
  const raw={exerciseId:'squat',name:'Squat',coachingCues:['brace','',42],techniqueExecution:['drive'],techniqueMistakes:null,still_image_url:'image',video_status:'ready'};
  vi.mocked(authGetJson).mockResolvedValueOnce({guidance:raw});
  expect(await fetchExerciseGuidance('squat/id')).toMatchObject({exerciseId:'squat',coachingCues:['brace'],techniqueExecution:['drive'],techniqueMistakes:[],stillImageUrl:'image',videoStatus:'ready'});
  expect(authGetJson).toHaveBeenCalledWith('/api/exercise/squat%2Fid/guidance');expect(normalizeGuidance(null)).toMatchObject({exerciseId:'',coachingCues:[],videoStatus:'none'});
});
it('normalizes exercise-swap responses and submits the server exercise_id field',async()=>{
  vi.mocked(authPostJson).mockResolvedValueOnce({program_exercise_id:'row',exercise_id:'new',exercise_name:'Replacement',original_exercise_id:'old'});
  expect(await applyExerciseSwap('row/id',{exerciseId:'new',reason:'equipment'})).toEqual({programExerciseId:'row',exerciseId:'new',exerciseName:'Replacement',originalExerciseId:'old'});
  expect(authPostJson).toHaveBeenCalledWith('/api/program-exercise/row%2Fid/swap',{exercise_id:'new',reason:'equipment'});
  await getExerciseSwapOptions('row/id');expect(authGetJson).toHaveBeenCalledWith('/api/program-exercise/row%2Fid/swap-options');
});
it('submits multipart check-in fields and keeps consent a separate explicit request',async()=>{
  await submitCheckIn('file:///photo.jpg',{skipAnalysis:true});
  const [url,options]=vi.mocked(authenticatedFetch).mock.calls[0];expect(url).toBe('/api/physique/check-in');expect(options?.method).toBe('POST');
  expect((options?.body as FormData).get('skip_analysis')).toBe('true');expect((options?.body as FormData).has('photo')).toBe(true);
  await getCheckIns();await triggerAnalysis('check/in');await deleteCheckIn('id');await recordConsent();
  expect(authGetJson).toHaveBeenCalledWith('/api/physique/check-ins?limit=20');expect(authenticatedFetch).toHaveBeenCalledWith('/api/physique/check-ins/check%2Fin/analyse',{method:'POST'});
  expect(authDeleteJson).toHaveBeenCalledWith('/api/physique/check-ins/id');expect(authenticatedFetch).toHaveBeenCalledWith('/api/physique/consent',{method:'POST'});
});
it('premium scan endpoints preserve successful results and map only premium-required errors',async()=>{
  await getScans();await getScan('id');await getScanTrend();await getMilestones();await getComparison('a','b');await deleteScan('id');await submitScan('file:///photo.jpg');
  expect(authGetJson).toHaveBeenCalledWith('/api/physique/scans?limit=20');expect(authGetJson).toHaveBeenCalledWith('/api/physique/scans/id');
  expect(authGetJson).toHaveBeenCalledWith('/api/physique/scans/comparison?scan_a_id=a&scan_b_id=b');
  const premium=new ApiError(402,'upgrade',{code:'premium_required'});vi.mocked(authGetJson).mockRejectedValueOnce(premium);await expect(getScans()).rejects.toMatchObject({code:'premium_required'});
  const offline=new TypeError('offline');vi.mocked(authGetJson).mockRejectedValueOnce(offline);await expect(getScans()).rejects.toBe(offline);
});
it('normalizes CSV import counts and sends multipart source metadata',async()=>{
  vi.mocked(authPostFormData).mockResolvedValueOnce({import_id:'import',status:'complete',summary:{total_rows:'3',mapped_rows:'2',unmapped_rows:'1',derived_anchors:0,saved_anchors:0}});
  expect(await uploadTrainingHistoryCsv({uri:'file:///import.csv'})).toMatchObject({importId:'import',status:'complete',summary:{totalRows:3,mappedRows:2,unmappedRows:1}});
  expect(vi.mocked(authPostFormData).mock.calls[0][1].get('source_app')).toBe('hevy');
  vi.mocked(authGetJson).mockResolvedValueOnce({import_id:'import',status:'complete',row_count:'3'});expect(await getTrainingHistoryImport('import')).toMatchObject({importId:'import',rowCount:3});
});

it('history searches suppress short terms and encode user-scoped normalized search terms',async()=>{
  expect(await history.searchExercises(' x ','user')).toEqual([]);expect(await history.searchLoggedExercises('x','user')).toEqual([]);expect(authGetJson).not.toHaveBeenCalled();
  await history.searchExercises(' squat ','user/id');await history.searchLoggedExercises(' row ','user/id');
  expect(authGetJson).toHaveBeenCalledWith('/api/logged-exercises/search?q=squat&user_id=user%2Fid');expect(authGetJson).toHaveBeenCalledWith('/api/logged-exercises/search?q=row&user_id=user%2Fid');
});
it('history pagination sends complete cursors and keeps user scope on every read',async()=>{
  await history.getHistoryOverview('user');await history.getHistoryPrograms(10,'user');await history.getSessionHistoryMetrics('user');await history.getPrsFeed('user');await history.getHistoryPersonalRecords(20,'user');await history.getExerciseSummary('squat','user');
  for(const path of ['/api/v1/history/overview?user_id=user','/api/v1/history/programs?limit=10&user_id=user','/api/session-history-metrics?user_id=user','/api/prs-feed?user_id=user','/api/v1/history/personal-records?limit=20&user_id=user','/api/exercise-summary?exercise_id=squat&user_id=user'])expect(authGetJson).toHaveBeenCalledWith(path);
  await history.getHistoryTimeline();expect(authGetJson).toHaveBeenLastCalledWith('/api/v1/history/timeline?limit=40');
  await history.getHistoryTimeline({limit:5,cursorDate:'2026-11-20',cursorId:'cursor',userId:'user'});
  expect(authGetJson).toHaveBeenLastCalledWith('/api/v1/history/timeline?limit=5&cursorDate=2026-11-20&cursorId=cursor&user_id=user');
  await history.fetchExerciseHistory('squat/id','12w','user');expect(authGetJson).toHaveBeenLastCalledWith('/api/v1/history/exercise/squat%2Fid?window=12w&include_decisions=true&user_id=user');
});
