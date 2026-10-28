import { test } from 'node:test';
import assert from 'node:assert/strict';
import curriculum from './curriculum.js';
import { initialState, validateState, moveCourse, ensureEmptySemester, parseCourseText, MAX_CREDITS } from './model.js';

function emptyState(count = 2) {
  return { version: 1, semesters: Array.from({ length: count }, (_, i) => ({ id: `s${i + 1}`, name: `Semestre ${i + 1}` })), courses: [] };
}
function block(id, zone, credits, color = 'mint') {
  return { id, zone, code: id, name: id, credits, color };
}

test('source has eight semesters, 45 distinct blocks and five minor slots', () => {
  const state = initialState(curriculum);
  assert.equal(state.semesters.length, 8);
  assert.equal(state.courses.length, 45);
  assert.equal(state.courses.filter(course => course.code === 'MINOR').length, 5);
  assert.deepEqual(validateState(state), state);
  assert.ok(state.courses.some(course => course.credits === null));
});
test('replacement preserves every block and moves displaced course to tray', () => {
  const state = initialState(curriculum);
  const source = state.courses[0], target = state.courses[9];
  const targetZone = target.zone;
  assert.equal(moveCourse(state, source.id, targetZone, target.id), true);
  assert.equal(source.zone, targetZone);
  assert.equal(target.zone, 'tray');
  assert.equal(state.courses.length, 45);
  validateState(state);
});
test('reorder inserts before/after without displacement, including same semester', () => {
  const state = initialState(curriculum);
  const first = state.courses[0], second = state.courses[1], third = state.courses[2];
  moveCourse(state, third.id, 's1', first.id, 'before');
  assert.equal(state.courses[0], third);
  moveCourse(state, third.id, 's1', second.id, 'after');
  assert.deepEqual(state.courses.slice(0, 3).map(course => course.id), [first.id, second.id, third.id]);
  assert.equal(state.courses.filter(course => course.zone === 'tray').length, 0);
});
test('moving to empty zone appends; invalid and self drops do not mutate', () => {
  const state = initialState(curriculum);
  assert.equal(moveCourse(state, state.courses[0].id, 'tray'), true);
  const saved = structuredClone(state);
  assert.equal(moveCourse(state, 'missing', 's1'), false);
  assert.equal(moveCourse(state, state.courses[0].id, 'bad'), false);
  assert.equal(moveCourse(state, state.courses[0].id, state.courses[0].zone, state.courses[0].id), false);
  assert.deepEqual(state, saved);
});
test('last occupied semester generates exactly one empty semester', () => {
  const state = initialState(curriculum);
  ensureEmptySemester(state); ensureEmptySemester(state);
  assert.equal(state.semesters.length, 9);
  moveCourse(state, state.courses[0].id, state.semesters.at(-1).id);
  ensureEmptySemester(state);
  assert.equal(state.semesters.length, 10);
  validateState(state);
});
test('import rejects duplicates, invalid zones and nonfinite credits', () => {
  for (const mutate of [state => state.courses.push(state.courses[0]), state => { state.courses[0].zone = 'unknown'; }, state => { state.courses[0].credits = NaN; }, state => { state.semesters[0].id = 'tray'; }]) {
    const state = initialState(curriculum); mutate(state);
    assert.throws(() => validateState(state));
  }
});
test('text entry handles known siglas, names, explicit credits and bullet lists', () => {
  const courses = parseCourseText('IIC2233\nMi optativo\nMAT1610 | Cálculo I | 10\n- Otro ramo\nXYZ1234 Nuevo ramo', curriculum.semesters.flatMap(semester => semester.courses));
  assert.equal(courses.length, 5);
  assert.equal(courses[0].name, 'Programación Avanzada');
  assert.equal(courses[0].credits, 10);
  assert.equal(courses[1].credits, null);
  assert.equal(courses[2].credits, 10);
  assert.equal(courses[3].name, 'Otro ramo');
  assert.equal(courses[4].code, 'XYZ1234');
  assert.throws(() => parseCourseText('ABC | Ramo | nope'));
  assert.throws(() => parseCourseText('  '));
});


test('semester cap is exactly 60 regardless of how many blocks it contains', () => {
  const state = emptyState();
  state.courses = [block('a', 's1', 30), block('b', 's1', 30)];
  assert.deepEqual(validateState(state).courses, state.courses);
  state.courses.push(block('c', 's1', 1));
  assert.throws(() => validateState(state), /60 créditos/);
});

test('unknown credits and zero credits do not consume cap; count is not a cap', () => {
  const state = emptyState();
  state.courses = Array.from({ length: 100 }, (_, i) => block(`z${i}`, 's1', i === 0 ? null : 0));
  assert.equal(validateState(state).courses.length, 100);
  state.courses.push(block('sixty', 's1', 60));
  assert.equal(validateState(state).courses.length, 101);
});

test('overflow creates a semester when there is no later semester with room', () => {
  const state = emptyState(1);
  state.courses = [block('full', 's1', 60), block('extra', 'tray', 4)];
  assert.equal(moveCourse(state, 'extra', 's1'), true);
  assert.equal(state.semesters.length, 2);
  assert.equal(state.courses.find(c => c.id === 'extra').zone, state.semesters[1].id);
  assert.equal(state.courses.find(c => c.id === 'full').zone, 's1');
  validateState(state);
});

test('replacement frees displaced credits when checking destination capacity', () => {
  const state = emptyState(1);
  state.courses = [block('incoming', 'tray', 50), block('displaced', 's1', 40), block('remaining', 's1', 10)];
  assert.equal(moveCourse(state, 'incoming', 's1', 'displaced'), true);
  assert.equal(state.courses.find(c => c.id === 'incoming').zone, 's1');
  assert.equal(state.courses.find(c => c.id === 'displaced').zone, 'tray');
  assert.equal(state.courses.find(c => c.id === 'remaining').zone, 's1');
  assert.equal(state.courses.filter(c => c.zone === 's1').reduce((n, c) => n + (c.credits ?? 0), 0), 60);
});

test('moving within the same semester does not count the course twice', () => {
  const state = emptyState(1);
  state.courses = [block('a', 's1', 35), block('b', 's1', 25)];
  assert.equal(moveCourse(state, 'a', 's1'), true);
  assert.equal(state.semesters.length, 1);
  assert.equal(state.courses.find(c => c.id === 'a').zone, 's1');
  validateState(state);
});

test('editing credits through clone then moving rechecks cap at destination', () => {
  const state = emptyState(2);
  state.courses = [block('edited', 's1', 10), block('resident', 's2', 45)];
  const next = structuredClone(state);
  next.courses.find(c => c.id === 'edited').credits = 20;
  assert.equal(moveCourse(next, 'edited', 's2'), true);
  assert.notEqual(next.courses.find(c => c.id === 'edited').zone, 's2');
  assert.equal(next.courses.find(c => c.id === 'resident').zone, 's2');
  assert.equal(next.courses.find(c => c.id === 'edited').credits, 20);
  validateState(next);
});

test('import-like validation rejects a semester total above 60', () => {
  const state = emptyState(1);
  state.courses = [block('a', 's1', 31), block('b', 's1', 30)];
  assert.throws(() => validateState(state), /60 créditos/);
});

test('bulk semester placement simulation rolls through full semesters', () => {
  const state = emptyState(2);
  state.courses = [block('seed1', 's1', 60), block('seed2', 's2', 55)];
  const added = [block('x', 'tray', 10), block('y', 'tray', 5), block('z', 'tray', null)];
  for (const item of added) {
    state.courses.push(item);
    assert.equal(moveCourse(state, item.id, 's2'), true);
  }
  const overflowZone = state.courses.find(c => c.id === 'x').zone;
  assert.notEqual(overflowZone, 's1');
  assert.notEqual(overflowZone, 's2');
  assert.equal(state.courses.find(c => c.id === 'y').zone, 's2');
  assert.equal(state.courses.find(c => c.id === 'z').zone, 's2');
  assert.equal(state.courses.find(c => c.id === 'z').credits, null);
  validateState(state);
});

test('30-semester limit rejects overflow atomically', () => {
  const state = emptyState(30);
  state.courses = [block('full', 's30', MAX_CREDITS), block('extra', 'tray', 1)];
  const before = structuredClone(state);
  assert.equal(moveCourse(state, 'extra', 's30'), false);
  assert.deepEqual(state, before);
});
