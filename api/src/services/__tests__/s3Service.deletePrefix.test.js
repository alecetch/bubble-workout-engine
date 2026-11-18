import test from "node:test";
import assert from "node:assert/strict";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { deletePrefix, listPrefixes, countPrefix } from "../s3Service.js";

test("deletePrefix pages and batches 2500 objects, including keys without database rows", async t => {
  const calls = [];
  t.mock.method(S3Client.prototype, "send", async command => {
    calls.push(command);
    if (command instanceof ListObjectsV2Command) {
      return command.input.ContinuationToken
        ? { Contents: Array.from({ length: 500 }, (_, i) => ({ Key: `physique/id/${2000 + i}` })) }
        : { Contents: Array.from({ length: 2000 }, (_, i) => ({ Key: `physique/id/${i}` })), IsTruncated: true, NextContinuationToken: "next" };
    }
    assert.ok(command instanceof DeleteObjectsCommand);
    assert.equal(command.input.Bucket, "photos");
    assert.equal(command.input.Delete.Quiet, true);
    return {};
  });
  assert.deepEqual(await deletePrefix("physique/id/", "photos"), { deleted: 2500 });
  const lists = calls.filter(c => c instanceof ListObjectsV2Command);
  assert.equal(lists[0].input.Prefix, "physique/id/");
  assert.equal(lists[1].input.ContinuationToken, "next");
  assert.deepEqual(calls.filter(c => c instanceof DeleteObjectsCommand).map(c => c.input.Delete.Objects.length), [1000, 1000, 500]);
});

test("deletePrefix fails on object errors and list errors", async t => {
  t.mock.method(S3Client.prototype, "send", async command => command instanceof ListObjectsV2Command
    ? { Contents: [{ Key: "physique/id/photo" }] } : { Errors: [{ Code: "AccessDenied" }] });
  await assert.rejects(deletePrefix("physique/id/"), /delete_prefix_failed/);
});

for (const prefix of ["", "physique", "physique/abc", "/", null]) {
  test(`deletePrefix rejects unsafe prefix ${String(prefix)}`, async t => {
    t.mock.method(S3Client.prototype, "send", () => assert.fail("No storage call for unsafe prefixes"));
    await assert.rejects(deletePrefix(prefix), /unsafe_prefix/);
  });
}

test("listPrefixes uses a delimiter and pages; countPrefix counts every page", async t => {
  const requests = [];
  t.mock.method(S3Client.prototype, "send", async command => {
    requests.push(command.input);
    return command.input.ContinuationToken ? { CommonPrefixes: [{ Prefix: "physique/b/" }], Contents: [{ Key: "b" }] }
      : { CommonPrefixes: [{ Prefix: "physique/a/" }], Contents: [{ Key: "a" }, { Key: "b" }], IsTruncated: true, NextContinuationToken: "next" };
  });
  assert.deepEqual(await listPrefixes("physique/", "photos"), ["physique/a/", "physique/b/"]);
  assert.ok(requests.every(r => r.Delimiter === "/" && r.Bucket === "photos"));
  requests.length = 0;
  assert.equal(await countPrefix("physique/a/", "photos"), 3);
  assert.ok(requests.every(r => !r.Delimiter));
});

test("an empty prefix has nothing to delete and broken pagination fails safely", async t => {
  t.mock.method(S3Client.prototype, "send", async () => ({}));
  assert.deepEqual(await deletePrefix("physique/id/"), { deleted: 0 });
  t.mock.method(S3Client.prototype, "send", async () => ({ IsTruncated: true }));
  await assert.rejects(deletePrefix("physique/id/"), /list_prefix_failed/);
});
