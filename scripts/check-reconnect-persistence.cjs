const fs = require('node:fs');
const path = require('node:path');

const storePath = path.join(__dirname, '..', 'src', 'lib', 'supabaseRoomStore.js');
const source = fs.readFileSync(storePath, 'utf8');

function getFunctionSource(name) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf('\nexport ', start + 1);
  if (start < 0) return '';
  return source.slice(start, end < 0 ? source.length : end);
}

const playerPersistence = getFunctionSource('upsertRemotePlayer');
const studentStatePersistence = getFunctionSource('upsertRemoteStudentState');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  playerPersistence && !/\.upsert\(/.test(playerPersistence),
  'players 저장에 upsert가 다시 사용되었습니다. 제한된 SELECT 권한과 충돌할 수 있습니다.',
);
assert(
  studentStatePersistence && !/\.upsert\(/.test(studentStatePersistence),
  'student_states 저장에 upsert가 다시 사용되었습니다. 제한된 SELECT 권한과 충돌할 수 있습니다.',
);
assert(
  /\.from\('players'\)[\s\S]{0,500}?\.update\(/.test(playerPersistence),
  '학생 접속 상태를 UPDATE로 저장하는 흐름을 찾지 못했습니다.',
);
assert(
  /const updateExistingState[\s\S]{0,800}?\.from\('student_states'\)[\s\S]{0,300}?\.update\(/.test(studentStatePersistence),
  '기존 학생 계좌를 UPDATE하는 흐름을 찾지 못했습니다.',
);
assert(
  /\.from\('student_states'\)[\s\S]{0,200}?\.insert\(stateRow\)/.test(studentStatePersistence),
  '최초 학생 계좌를 INSERT하는 흐름을 찾지 못했습니다.',
);
assert(
  /insertError\.code !== '23505'/.test(studentStatePersistence),
  '최초 저장 경합 시 중복 키 복구 흐름을 찾지 못했습니다.',
);

console.log('학생 재접속 저장 회귀 점검 통과: 접속 상태 UPDATE · 계좌 INSERT/UPDATE · 중복 저장 복구');
