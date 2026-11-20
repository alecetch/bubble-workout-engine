import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailableOrSkip } from './requireDb.js';
const original=process.env.REQUIRE_DB;
afterEach(()=>{if(original===undefined)delete process.env.REQUIRE_DB;else process.env.REQUIRE_DB=original;});
const offline={async query(){throw Object.assign(new Error('private connection details'),{code:'ECONNREFUSED'});}};
test('local DB outage calls skip and returns false',async()=>{
  delete process.env.REQUIRE_DB;const reasons=[];
  assert.equal(await dbAvailableOrSkip({skip:reason=>reasons.push(reason)},offline),false);
  assert.deepEqual(reasons,['Postgres unavailable: ECONNREFUSED']);
});
test('required DB outage throws instead of skipping',async()=>{
  process.env.REQUIRE_DB='true';let skipped=false;
  await assert.rejects(dbAvailableOrSkip({skip(){skipped=true;}},offline),{message:'REQUIRE_DB=true but Postgres is unavailable: ECONNREFUSED'});
  assert.equal(skipped,false);
});
test('available DB executes its probe and returns true',async()=>{
  process.env.REQUIRE_DB='true';let sql;
  assert.equal(await dbAvailableOrSkip({skip(){assert.fail('must not skip');}},{async query(value){sql=value;}}),true);
  assert.equal(sql,'SELECT 1');
});
