import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool } from "../src/db.js";
import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import { auth, token, withApp } from "../testSupport/entitlementFixtures.js";
import { createPushTokenHandler } from "../src/routes/notificationPreferences.js";

after(() => pool.end());
async function fixture(t, fn, database = pool) {
  if (!await dbAvailableOrSkip(t, pool)) return;
  const ids = [randomUUID(), randomUUID()];
  t.after(() => pool.query("DELETE FROM app_user WHERE id = ANY($1::uuid[])", [ids]));
  for (const id of ids) await pool.query("INSERT INTO app_user(id,subject_id) VALUES($1,$2)", [id,id]);
  const logs = [];
  await withApp(app => {
    app.use((req, _res, next) => { req.request_id = "push-token-test"; req.log = { info: value => logs.push(value) }; next(); });
    app.use(auth);
    app.patch("/token", createPushTokenHandler(database));
  }, async base => {
    const register = async (id, value) => {
      const response = await fetch(`${base}/token`, { method: "PATCH", headers: {
        "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${token(id)}` } : {}),
      }, body: JSON.stringify({ push_token: value }) });
      return { status: response.status, body: await response.json() };
    };
    const rows = async () => (await pool.query("SELECT id,device_push_token,device_push_token_updated_at FROM app_user WHERE id=ANY($1::uuid[]) ORDER BY id", [ids])).rows;
    await fn({ ids, register, rows, logs, value: `ExponentPushToken[${randomUUID()}]` });
  });
}

test("registration assigns the authenticated account without disclosing another owner", async t => fixture(t, async f => {
  const [a,b] = f.ids;
  assert.deepEqual(await f.register(a, f.value), { status: 200, body: { ok: true } });
  assert.equal((await f.rows()).find(row => row.id === a).device_push_token, f.value);
  await pool.query("UPDATE app_user SET device_push_token_updated_at='2020-01-01' WHERE id=$1", [a]);
  assert.deepEqual(await f.register(b, f.value), { status: 200, body: { ok: true } });
  let rows = await f.rows();
  assert.equal(rows.find(row => row.id === b).device_push_token, f.value);
  assert.equal(rows.find(row => row.id === a).device_push_token, null);
  assert.ok(rows.find(row => row.id === a).device_push_token_updated_at > new Date("2020-01-01"));
  assert.deepEqual(f.logs.at(-1), { event: "push_token.reassigned", count: 1, request_id: "push-token-test" });
  assert.ok(!JSON.stringify(f.logs).includes(f.value));
  assert.ok(f.ids.every(id => !JSON.stringify(f.logs).includes(id)));
  assert.deepEqual(await f.register(a, f.value), { status: 200, body: { ok: true } });
  rows = await f.rows();
  assert.equal(rows.find(row => row.id === a).device_push_token, f.value);
  assert.equal(rows.find(row => row.id === b).device_push_token, null);
}));

test("same-account registration is idempotent and distinct tokens remain isolated", async t => fixture(t, async f => {
  const [a,b] = f.ids;
  const other = `ExponentPushToken[${randomUUID()}]`;
  await f.register(a, f.value); await f.register(a, f.value);
  assert.equal((await f.register(b, other)).status, 200);
  const rows = await f.rows();
  assert.equal(rows.find(row => row.id === a).device_push_token, f.value);
  assert.equal(rows.find(row => row.id === b).device_push_token, other);
}));

test("null clears only the caller and malformed input changes no rows", async t => fixture(t, async f => {
  const [a,b] = f.ids, other = `ExponentPushToken[${randomUUID()}]`;
  await f.register(a, f.value); await f.register(b, other);
  const before = await f.rows();
  assert.equal((await f.register(a, "malformed")).status, 400);
  assert.deepEqual(await f.rows(), before);
  assert.deepEqual(await f.register(a, null), { status: 200, body: { ok: true } });
  const rows = await f.rows();
  assert.equal(rows.find(row => row.id === a).device_push_token, null);
  assert.deepEqual(rows.find(row => row.id === b), before.find(row => row.id === b));
}));

test("missing authentication cannot register a token", async t => fixture(t, async f => {
  assert.equal((await f.register(null, f.value)).status, 401);
  assert.ok((await f.rows()).every(row => row.device_push_token === null));
}));

test("concurrent claims retry a real unique violation and leave exactly one owner", async t => {
  let arrivals = 0, conflicts = 0;
  const assignments = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const database = { async connect() {
    const client = await pool.connect(); let firstClear = true;
    return { release: () => client.release(), async query(sql, params) {
      try {
        const result = await client.query(sql, params);
        if (sql.includes("id <> $1") && firstClear) {
          firstClear = false;
          if (++arrivals === 2) release();
          await barrier;
        }
        if (sql.includes("SET device_push_token = $2")) assignments.push(params[0]);
        return result;
      } catch (error) { if (error.code === "23505") conflicts++; throw error; }
    } };
  } };
  await fixture(t, async f => {
    const results = await Promise.all(f.ids.map(id => f.register(id, f.value)));
    assert.deepEqual(results, [{status:200,body:{ok:true}}, {status:200,body:{ok:true}}]);
    assert.equal(conflicts, 1);
    const owners = (await f.rows()).filter(row => row.device_push_token === f.value);
    assert.equal(owners.length, 1); assert.equal(owners[0].id, assignments.at(-1));
  }, database);
});

test("a failed assignment rolls back the old owner's clear", async t => {
  const database = { async connect() {
    const client = await pool.connect();
    return { release: () => client.release(), query(sql, params) {
      if (sql.includes("SET device_push_token = $2")) throw new Error("assignment failed");
      return client.query(sql, params);
    } };
  } };
  await fixture(t, async f => {
    await pool.query("UPDATE app_user SET device_push_token=$2 WHERE id=$1", [f.ids[0], f.value]);
    assert.equal((await f.register(f.ids[1], f.value)).status, 500);
    assert.equal((await f.rows()).find(row => row.id === f.ids[0]).device_push_token, f.value);
    assert.equal(f.logs.length, 0);
  }, database);
});

test("unique conflicts retry only once and always release the dedicated client", async () => {
  let begins=0, rollbacks=0, releases=0;
  const handler=createPushTokenHandler({async connect(){return {release(){releases++;},async query(sql){
    if(sql==="BEGIN")begins++; if(sql==="ROLLBACK")rollbacks++;
    if(sql.includes("SET device_push_token = $2"))throw Object.assign(new Error("unique constraint"),{code:"23505"});
    return {rowCount:0,rows:[]};
  }};}});
  const response={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await handler({auth:{user_id:randomUUID()},body:{push_token:"ExponentPushToken[retry]"}},response);
  assert.equal(response.statusCode,500);assert.equal(begins,2);assert.equal(rollbacks,2);assert.equal(releases,1);
});

test("migration deduplicates timestamps and ties deterministically and enforces unique non-null tokens", async t => {
  if (!await dbAvailableOrSkip(t,pool)) return;
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE app_user(id uuid PRIMARY KEY,device_push_token text,device_push_token_updated_at timestamptz,created_at timestamptz) ON COMMIT DROP");
    const ids=[1,2,3,4,5,6,7,8].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
    for(let i=0;i<3;i++)await client.query("INSERT INTO app_user VALUES($1,'T',$2,'2020-01-01')",[ids[i],`2026-01-0${i+1}`]);
    for(let i=3;i<6;i++)await client.query("INSERT INTO app_user VALUES($1,'U',null,$2)",[ids[i],i===3?'2020-01-01':'2021-01-01']);
    for(let i=6;i<8;i++)await client.query("INSERT INTO app_user VALUES($1,null,null,'2020-01-01')",[ids[i]]);
    const migration=await readFile(new URL("../../migrations/V158__push_token_single_owner.sql",import.meta.url),"utf8").catch(error => {
      if(error.code!=="ENOENT")throw error;
      return readFile(new URL("../migrations/V158__push_token_single_owner.sql",import.meta.url),"utf8");
    });
    await client.query(migration);
    const rows=(await client.query("SELECT * FROM app_user ORDER BY id")).rows;
    assert.equal(rows.filter(row=>row.device_push_token==='T')[0].id,ids[2]);
    assert.equal(rows.filter(row=>row.device_push_token==='U')[0].id,ids[5]);
    assert.equal(rows.filter(row=>row.device_push_token!==null).length,2);
    for(const i of [0,1,3,4])assert.ok(rows[i].device_push_token_updated_at>new Date('2026-01-01'));
    await assert.rejects(client.query("INSERT INTO app_user VALUES($1,'T',now(),now())",[randomUUID()]),{code:"23505"});
  } finally {await client.query("ROLLBACK");client.release();}
});
