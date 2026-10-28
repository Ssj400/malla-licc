export const COLORS = ['mint', 'blue', 'peach', 'lavender', 'sand'];
export const MAX_CREDITS = 60;

export function semesterCredits(state, zone, excluding = []) {
  return state.courses.filter(course => course.zone === zone && !excluding.includes(course.id)).reduce((sum, course) => sum + (course.credits ?? 0), 0);
}

export function initialState(curriculum) {
  return {
    version: 1,
    semesters: curriculum.semesters.map((semester, index) => ({ id: `s${index + 1}`, name: semester.name || `Semestre ${index + 1}` })),
    courses: curriculum.semesters.flatMap((semester, index) => semester.courses.map((course, position) => ({ ...course, id: `base-${index}-${position}`, zone: `s${index + 1}` }))),
  };
}

export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.semesters) || !Array.isArray(value.courses)) throw new Error('Formato de malla no válido.');
  if (!value.semesters.length || value.semesters.length > 30 || value.courses.length > 500) throw new Error('La malla excede los límites permitidos.');
  const ids = new Set();
  const zones = new Set(['tray']);
  for (const semester of value.semesters) {
    if (!semester || typeof semester.id !== 'string' || !semester.id || zones.has(semester.id) || typeof semester.name !== 'string' || !semester.name.trim() || semester.name.length > 80) throw new Error('Semestre no válido.');
    zones.add(semester.id);
  }
  for (const course of value.courses) {
    if (!course || typeof course.id !== 'string' || !course.id || ids.has(course.id) || typeof course.name !== 'string' || !course.name.trim() || course.name.length > 160 || typeof course.code !== 'string' || course.code.length > 30 || (course.credits !== null && (!Number.isInteger(course.credits) || course.credits < 0 || course.credits > MAX_CREDITS)) || !COLORS.includes(course.color) || !zones.has(course.zone)) throw new Error('Bloque no válido (máximo 60 créditos por ramo).');
    ids.add(course.id);
  }
  for (const semester of value.semesters) {
    if (semesterCredits(value, semester.id) > MAX_CREDITS) throw new Error(`${semester.name} supera los 60 créditos.`);
  }
  return structuredClone(value);
}

export function moveCourse(state, id, zone, targetId = null, placement = 'replace') {
  if (zone !== 'tray' && !state.semesters.some(semester => semester.id === zone)) return false;
  const sourceIndex = state.courses.findIndex(course => course.id === id);
  if (sourceIndex < 0 || id === targetId) return false;
  const course = state.courses[sourceIndex];
  let target = targetId ? state.courses.find(item => item.id === targetId && item.zone === zone) : null;
  if (targetId && !target) return false;
  if ((course.credits ?? 0) > MAX_CREDITS) return false;
  if (zone !== 'tray') {
    const excluding = [id, ...(target && placement === 'replace' ? [target.id] : [])];
    if (semesterCredits(state, zone, excluding) + (course.credits ?? 0) > MAX_CREDITS) {
      const next = state.semesters.slice(state.semesters.findIndex(semester => semester.id === zone) + 1).find(semester => semesterCredits(state, semester.id, [id]) + (course.credits ?? 0) <= MAX_CREDITS);
      if (next) zone = next.id;
      else {
        if (state.semesters.length >= 30) return false;
        zone = `s-${crypto.randomUUID()}`;
        state.semesters.push({ id: zone, name: `Semestre ${state.semesters.length + 1}` });
      }
      target = null;
    }
  }
  state.courses.splice(sourceIndex, 1);
  course.zone = zone;
  if (target && placement !== 'replace') {
    state.courses.splice(state.courses.indexOf(target) + (placement === 'after' ? 1 : 0), 0, course);
  } else if (target && zone !== 'tray') {
    const index = state.courses.indexOf(target);
    target.zone = 'tray';
    state.courses.splice(index, 0, course);
  } else if (target) {
    state.courses.splice(state.courses.indexOf(target), 0, course);
  } else {
    state.courses.push(course);
  }
  return true;
}

export function ensureEmptySemester(state) {
  const last = state.semesters.at(-1);
  if (last && state.courses.some(course => course.zone === last.id) && state.semesters.length < 30) {
    state.semesters.push({ id: `s-${crypto.randomUUID()}`, name: `Semestre ${state.semesters.length + 1}` });
  }
}

export function parseCourseText(text, knownCourses = []) {
  const known = new Map(knownCourses.filter(course => course.code).map(course => [course.code.toUpperCase(), course]));
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Escribe al menos un ramo.');
  if (lines.length > 300) throw new Error('Puedes pegar hasta 300 ramos a la vez.');
  return lines.map((raw, index) => {
    const line = raw.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '');
    const fields = line.split(/[|\t;]/).map(field => field.trim());
    let code = '', name = line, credits = null, color = 'sand';
    const reference = known.get(line.toUpperCase());
    if (reference) return { code: reference.code, name: reference.name, credits: reference.credits, color: reference.color };
    if (fields.length > 1) {
      if (fields.length > 3) throw new Error(`Línea ${index + 1}: usa SIGLA | Nombre | Créditos.`);
      [code, name] = fields;
      if (fields[2]) {
        credits = Number(fields[2]);
        if (!Number.isInteger(credits) || credits < 0 || credits > MAX_CREDITS) throw new Error(`Línea ${index + 1}: créditos no válidos (0–60).`);
      }
    } else {
      const match = line.match(/^([A-Za-z]{2,5}\d{3,4}[A-Za-z]?)\s+(.+)$/);
      if (match) { code = match[1]; name = match[2]; }
      else if (/^[A-Za-z]{2,5}\d{3,4}[A-Za-z]?$/.test(line)) { code = line; name = line; }
    }
    code = code.toUpperCase();
    if (!name || name.length > 160 || code.length > 30) throw new Error(`Línea ${index + 1}: revisa el nombre o la sigla.`);
    if (/^(MAT|EYP)/.test(code)) color = 'blue';
    else if (/^IIC/.test(code)) color = 'mint';
    else if (/^(FIL|ETI|VRA|FG)/.test(code)) color = 'lavender';
    return { code, name, credits, color };
  });
}
