import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('supabase/migrations/20260923_friendship_backfill_and_trigger.sql', 'utf8');
test('friendship migration statically guards identity, duplicate pairs and both entry paths', () => {
  assert.match(sql, /after insert or update of contributor_id on public\.contributions/i);
  assert.match(sql, /if new\.contributor_id is null then return new/i);
  assert.match(sql, /recipient_id <> new\.contributor_id/);
  assert.match(sql, /c\.contributor_id is not null/);
  assert.match(sql, /c\.contributor_id <> w\.owner_id/);
  assert.equal((sql.match(/on conflict \(member_a, member_b\) do nothing/g) || []).length, 2);
  assert.match(sql, /select distinct least\(c\.contributor_id, w\.owner_id\)/);
  assert.doesNotMatch(sql, /contributor_name|display_name/);
  assert.match(sql, /revoke all on function.*from public, anon, authenticated/);
  assert.match(sql, /begin;[\s\S]*commit;/);
});
