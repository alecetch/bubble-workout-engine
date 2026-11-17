import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { hashResetCode, resetCodeMatches, resetHmacSecret, sendPasswordChangedEmail, sendPasswordResetEmail } from '../emailService.js';
test('HMAC is deterministic per secret and safely matches only valid hashes',()=>{
  const hash=hashResetCode('123456','a'.repeat(32));assert.equal(hash,hashResetCode('123456','a'.repeat(32)));
  assert.notEqual(hash,hashResetCode('123456','b'.repeat(32)));assert.notEqual(hash,createHash('sha256').update('123456').digest('hex'));
  assert.equal(resetCodeMatches('123456',hash,'a'.repeat(32)),true);
  for(const value of ['000000','123457'])assert.equal(resetCodeMatches(value,hash,'a'.repeat(32)),false);
  for(const value of ['ff','not-hex',''])assert.equal(resetCodeMatches('123456',value,'a'.repeat(32)),false);
});
test('missing or short explicit secret derives a domain-separated key from JWT_SECRET',()=>{
  for(const value of [undefined,'short'])assert.deepEqual(resetHmacSecret({JWT_SECRET:'jwt',PASSWORD_RESET_HMAC_SECRET:value}),createHmac('sha256','jwt').update('password-reset-v1').digest());
  assert.equal(resetHmacSecret({PASSWORD_RESET_HMAC_SECRET:'x'.repeat(32)}),'x'.repeat(32));
});
test('console auth email delivery never logs recipient, code or message body',async t=>{
  const output=[];t.mock.method(console,'log',(...args)=>output.push(args.join(' ')));
  await sendPasswordResetEmail({to:'secret@example.test',code:'123456'});await sendPasswordChangedEmail({to:'secret@example.test',changedAt:new Date()});
  assert.ok(output.length);assert.doesNotMatch(output.join('\n'),/secret@example|123456|Your password was changed/);
});
