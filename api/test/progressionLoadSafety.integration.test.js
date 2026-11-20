import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import { withUsers, withApp, auth, token } from "../testSupport/entitlementFixtures.js";
import { trainingProgram, transactionalPool } from "../testSupport/trainingFixtures.js";
import { createReadProgramHandlers } from "../src/routes/readProgram.js";
import { createSegmentLogHandlers } from "../src/routes/segmentLog.js";
import { makeProgressionDecisionService } from "../src/services/progressionDecisionService.js";

after(() => pool.end());
async function fixture(t, fn) {
  if (!await dbAvailableOrSkip(t,pool)) return;
  await withUsers(async (db,[user,other]) => {
    await db.query("UPDATE app_user SET created_at='2020-01-01', timezone='UTC' WHERE id=$1",[user]);
    const program=await trainingProgram(db,user);
    await db.query("UPDATE program SET program_type='strength' WHERE id=$1",[program.id]);
    const exercises=[program.exercise], segments=[program.segment];
    for (let i=1;i<3;i++) {
      const segment=(await db.query(`INSERT INTO workout_segment(program_id,program_day_id,program_day_key,segment_key,block_key,block_order,segment_order_in_block,segment_type,purpose)
        VALUES($1,$2,$3,'test','main',1,1,'single','main') RETURNING id`,[program.id,program.days[i],`test-${i+1}`])).rows[0].id;
      segments.push(segment);
      exercises.push((await db.query(`INSERT INTO program_exercise(program_id,program_day_id,workout_segment_id,program_day_key,segment_key,segment_type,exercise_id,order_in_day,block_order,order_in_block,purpose)
        VALUES($1,$2,$3,$4,'test','single','bb_back_squat',1,1,1,'main') RETURNING id`,[program.id,program.days[i],segment,`test-${i+1}`])).rows[0].id);
    }
    await db.query("UPDATE program_exercise SET is_loadable=true,reps_prescribed='5',intensity_prescription='2 RIR',sets_prescribed=3 WHERE program_id=$1",[program.id]);
    const database=transactionalPool(db);
    const service=makeProgressionDecisionService(database);
    const notifications=[];
    let completed;
    const completion=new Promise(resolve=>{completed=resolve;});
    const read=createReadProgramHandlers({db:database,
      guidelineLoadService:{annotateExercisesWithGuidelineLoads:async({exercises})=>exercises},
      progressionDecisionService:{async applyProgressionRecommendations(args) { const result=await service.applyProgressionRecommendations(args); completed(result); return result; }},
      notificationService:{async send(message){ notifications.push(message); }} });
    const log=createSegmentLogHandlers(database,{async send(){}});
    await withApp(app=>{
      app.use((req,res,next)=>{req.log={error(){},warn(){},info(){}};next();});
      app.use(auth);
      app.post('/log',log.postSegmentLog);
      app.post('/day/:program_day_id/complete',read.dayComplete);
      app.get('/day/:program_day_id',read.dayFull);
    },async base=>{
      const request=(path,options={},who=user)=>fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(who?{Authorization:`Bearer ${token(who)}`}:{})}});
      async function logSession(index,load) {
        const response=await request('/log',{method:'POST',body:JSON.stringify({program_id:program.id,program_day_id:program.days[index],workout_segment_id:segments[index],rows:[1,2,3].map(order_index=>({program_exercise_id:exercises[index],order_index,weight_kg:load,reps_completed:5,rir_actual:2}))})});
        assert.equal(response.status,200,JSON.stringify(await response.json()));
      }
      await logSession(0,100);
      await db.query("UPDATE program_day SET is_completed=true WHERE id=$1",[program.days[0]]);
      await db.query("UPDATE segment_exercise_log SET created_at=now()-interval '35 days' WHERE program_day_id=$1",[program.days[0]]);
      await fn({db,database,user,other,program,exercises,request,logSession,completion,notifications});
    });
  });
}
for(const [name,load,expected] of [['cap',100,105],['typo',1000,100],['unconfirmed',225,100]])
  test(`log, complete and read: ${name} respects trusted load and sends no false deload push`,async t=>fixture(t,async f=>{
    await f.logSession(1,load);
    const complete=await f.request(`/day/${f.program.days[1]}/complete`,{method:'POST',body:'{}'});
    assert.equal(complete.status,200,JSON.stringify(await complete.json()));
    const result=await f.completion;
    assert.equal(result.decisions.length,1);
    // Let the non-blocking notification branch finish before checking its side effects.
    await new Promise(resolve=>setImmediate(resolve));
    const response=await f.request(`/day/${f.program.days[2]}`);
    assert.equal(response.status,200);
    const body=await response.json();
    const rec=body.segments[0].items[0].progression_recommendation;
    assert.ok(rec.recommended_load_kg<=expected); assert.ok(rec.recommended_load_kg>=100);
    const state=(await f.db.query('SELECT current_load_kg_override FROM exercise_progression_state WHERE user_id=$1',[f.user])).rows[0];
    assert.ok(Number(state.current_load_kg_override)<=expected);
    if(load!==100){assert.equal(rec.outcome,'hold');assert.match(rec.reasoning.join(' '),/until it's confirmed/);}
    assert.equal(f.notifications.filter(n=>n.data?.event==='deload').length,0);
  }));
test('read-time layoff reduces presentation only and preserves ownership',async t=>fixture(t,async f=>{
  const service=makeProgressionDecisionService(f.db);
  await service.applyProgressionRecommendations({programId:f.program.id,userId:f.user,programType:'strength',completedProgramDayId:f.program.days[0]});
  const before=(await f.db.query('SELECT recommended_load_kg FROM program_exercise WHERE id=$1',[f.exercises[2]])).rows[0].recommended_load_kg;
  const response=await f.request(`/day/${f.program.days[2]}`);assert.equal(response.status,200);
  const rec=(await response.json()).segments[0].items[0].progression_recommendation;
  assert.equal(rec.recommended_load_kg,90);assert.equal(rec.layoff_adjusted,true);assert.equal(rec.layoff_band,'reduce');
  assert.ok(rec.reasoning.includes("Welcome back. We've eased your weight after 5 weeks off."));
  assert.equal((await f.db.query('SELECT recommended_load_kg FROM program_exercise WHERE id=$1',[f.exercises[2]])).rows[0].recommended_load_kg,before);
  assert.equal((await f.request(`/day/${f.program.days[2]}`,{},f.other)).status,404);
  assert.equal((await f.request(`/day/${f.program.days[2]}`,{},null)).status,401);
}));

for (const [name, days, trusted, shown, band] of [
  ["old inflated recommendation",0,100,110,"none"],
  ["legacy state without trusted load",35,null,999,"none"],
  ["major layoff",57,100,80,"major"],
]) test(`read safety: ${name}`,async t=>fixture(t,async f=>{
  await makeProgressionDecisionService(f.db).applyProgressionRecommendations({programId:f.program.id,userId:f.user,programType:"strength",completedProgramDayId:f.program.days[0]});
  await f.db.query("UPDATE segment_exercise_log SET created_at=now()-$2*interval '1 day' WHERE user_id=$1",[f.user,days]);
  await f.db.query("UPDATE program_exercise SET recommended_load_kg=999 WHERE id=$1",[f.exercises[2]]);
  await f.db.query("UPDATE exercise_progression_state SET last_decision_context_json=$2::jsonb WHERE user_id=$1",[f.user,JSON.stringify({evidence:trusted==null?{}:{trusted_load_kg:trusted}})]);
  const response=await f.request(`/day/${f.program.days[2]}`);assert.equal(response.status,200);
  const rec=(await response.json()).segments[0].items[0].progression_recommendation;
  assert.equal(rec.recommended_load_kg,shown);assert.equal(rec.layoff_band,band);
  if(band==="major")assert.equal(rec.confidence,"low");
  assert.equal(Number((await f.db.query("SELECT recommended_load_kg FROM program_exercise WHERE id=$1",[f.exercises[2]])).rows[0].recommended_load_kg),999);
}));
