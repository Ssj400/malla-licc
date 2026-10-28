import curriculum from './curriculum.js';
import { initialState, validateState, moveCourse, ensureEmptySemester, parseCourseText } from './model.js';

const KEY = 'mi-malla-licc-v1';
const $ = selector => document.querySelector(selector);
let state = initialState(curriculum);
let storageAvailable = true;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = validateState(JSON.parse(saved));
} catch {
  storageAvailable = false;
  $('#save-status').textContent = 'No se pudo leer el guardado';
}
let editingId = null;
let draggedId = null;
let toastTimer;
let pendingState = null;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}

function save() {
  ensureEmptySemester(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageAvailable = true;
    $('#save-status').textContent = 'Guardado en este navegador';
  } catch {
    storageAvailable = false;
    $('#save-status').textContent = 'Sin guardar · exporta tu malla';
    toast('No se pudo guardar. Exporta tu malla para conservarla.');
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function block(course) {
  const node = element('article', 'course');
  node.dataset.id = course.id;
  node.dataset.color = course.color;
  node.draggable = true;
  node.tabIndex = 0;
  node.setAttribute('aria-label', `${course.code} ${course.name}, ${course.credits ?? 'sin definir'} créditos. Enter para editar o mover.`);
  const top = element('div', 'course-top');
  top.append(element('span', 'course-code', course.code || 'PERSONALIZADO'), element('span', 'course-grip', '⠿'));
  const bottom = element('div', 'course-bottom');
  const edit = element('button', 'course-edit', 'Editar ↗');
  edit.type = 'button';
  edit.setAttribute('aria-label', `Editar ${course.name}`);
  edit.addEventListener('click', event => { event.stopPropagation(); openEditor(course.id); });
  bottom.append(element('span', '', course.credits === null ? 'Créditos por definir' : `${course.credits} créditos`), edit);
  node.append(top, element('h4', '', course.name), bottom);
  node.addEventListener('click', () => { if (Date.now() > suppressClickUntil) openEditor(course.id); });
  node.addEventListener('pointerdown', startTouchDrag);
  node.addEventListener('keydown', event => {
    if (event.target === node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openEditor(course.id); }
  });
  node.addEventListener('dragstart', event => {
    if (touchDrag) { event.preventDefault(); return; }
    draggedId = course.id;
    event.dataTransfer.setData('text/plain', course.id);
    event.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', clearDrag);
  return node;
}

function render() {
  ensureEmptySemester(state);
  $('#tray').replaceChildren(...state.courses.filter(course => course.zone === 'tray').map(block));
  $('#tray-count').textContent = state.courses.filter(course => course.zone === 'tray').length;
  const planned = state.courses.filter(course => course.zone !== 'tray');
  $('#total-credits').textContent = `${planned.reduce((sum, course) => sum + (course.credits ?? 0), 0)} cr.${planned.some(course => course.credits === null) ? ' + por definir' : ''}`;
  $('#curriculum-label').textContent = `${curriculum.name} · ${curriculum.version}`;
  $('#semesters').replaceChildren(...state.semesters.map((semester, index) => {
    const courses = state.courses.filter(course => course.zone === semester.id);
    const section = element('section', 'semester');
    const heading = element('div', 'semester-heading');
    const title = element('h3', '', semester.name);
    title.id = `heading-${semester.id}`;
    heading.append(element('span', 'semester-number', String(index + 1).padStart(2, '0')), title, element('span', 'credits', `${courses.reduce((sum, course) => sum + (course.credits ?? 0), 0)}/60 cr.${courses.some(course => course.credits === null) ? ' + ?' : ''}`));
    const zone = element('div', 'dropzone');
    zone.dataset.zone = semester.id;
    zone.setAttribute('aria-labelledby', title.id);
    zone.append(...courses.map(block));
    section.append(heading, zone);
    return section;
  }));
}

function clearDrag() {
  draggedId = null;
  document.querySelectorAll('.dragging,.drag-over,.swap-target,.insert-before,.insert-after').forEach(node => node.classList.remove('dragging', 'drag-over', 'swap-target', 'insert-before', 'insert-after'));
}

function dropPosition(target, clientY) {
  if (!target) return 'replace';
  const rect = target.getBoundingClientRect();
  const fraction = (clientY - rect.top) / rect.height;
  return fraction < .25 ? 'before' : fraction > .75 ? 'after' : 'replace';
}

function resolveDrop(zone, target, clientY) {
  if (target) return { target, placement: dropPosition(target, clientY) };
  if (zone.dataset.zone !== 'tray') {
    const next = [...zone.querySelectorAll('.course')].find(node => node.dataset.id !== draggedId && clientY < node.getBoundingClientRect().top);
    if (next) return { target: next, placement: 'before' };
  }
  return { target: null, placement: 'replace' };
}

function highlight(zone, target, clientY) {
  document.querySelectorAll('.drag-over,.swap-target,.insert-before,.insert-after').forEach(node => node.classList.remove('drag-over', 'swap-target', 'insert-before', 'insert-after'));
  const resolved = resolveDrop(zone, target, clientY);
  target = resolved.target;
  if (target && target.dataset.id !== draggedId) {
    const placement = resolved.placement;
    target.classList.add(placement === 'replace' ? (zone.dataset.zone === 'tray' ? 'insert-before' : 'swap-target') : `insert-${placement}`);
  } else zone.classList.add('drag-over');
}

function finishDrop(zone, target, clientY) {
  const resolved = resolveDrop(zone, target, clientY);
  target = resolved.target;
  const placement = resolved.placement;
  const replaced = target && target.dataset.id !== draggedId && zone.dataset.zone !== 'tray' && placement === 'replace';
  const id = draggedId;
  const moved = moveCourse(state, id, zone.dataset.zone, target?.dataset.id, placement);
  const actualZone = state.courses.find(course => course.id === id)?.zone;
  const overflow = moved && actualZone !== zone.dataset.zone;
  clearDrag();
  if (moved) {
    save(); render();
    document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    toast(overflow ? `El bloque pasó a ${state.semesters.find(semester => semester.id === actualZone).name}: el destino superaba 60 créditos.` : replaced ? 'Bloque reemplazado. El anterior está en la bandeja superior.' : 'Ramo movido.');
  } else if (id !== target?.dataset.id) toast('No hay espacio disponible sin superar 60 créditos (máximo 30 semestres).');
}

document.addEventListener('dragover', event => {
  const zone = event.target.closest('.dropzone');
  if (!zone || !draggedId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const target = event.target.closest('.course');
  highlight(zone, target, event.clientY);
});

document.addEventListener('drop', event => {
  const zone = event.target.closest('.dropzone');
  if (!zone || !draggedId) return;
  event.preventDefault();
  const target = event.target.closest('.course');
  finishDrop(zone, target, event.clientY);
});

// Long-press touch dragging, without disabling ordinary page scrolling.
let touchDrag = null;
let suppressClickUntil = 0;
function startTouchDrag(event) {
  if (touchDrag || !event.isPrimary || event.pointerType !== 'touch' || event.target.closest('button')) return;
  const node = event.currentTarget;
  const start = { x: event.clientX, y: event.clientY };
  const pending = { id: event.pointerId, node, active: false, x: event.clientX, y: event.clientY };
  touchDrag = pending;
  pending.timer = setTimeout(() => {
    if (touchDrag !== pending) return;
    pending.active = true;
    draggedId = node.dataset.id;
    node.classList.add('dragging');
    const ghost = node.cloneNode(true);
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); ghost.className = 'course touch-ghost';
    ghost.style.width = `${node.offsetWidth}px`;
    document.body.append(ghost); pending.ghost = ghost;
    ghost.style.left = `${pending.x + 8}px`; ghost.style.top = `${pending.y - 35}px`;
    suppressClickUntil = Date.now() + 1000;
    navigator.vibrate?.(20);
    const scrollFrame = () => {
      if (touchDrag !== pending || !pending.active) return;
      const edge = 85;
      if (pending.y < edge) window.scrollBy(0, -Math.ceil((edge - pending.y) / 6));
      else if (pending.y > innerHeight - edge) window.scrollBy(0, Math.ceil((pending.y - innerHeight + edge) / 6));
      const under = document.elementFromPoint(pending.x, pending.y);
      const zone = under?.closest('.dropzone');
      if (zone) highlight(zone, under.closest('.course'), pending.y);
      pending.frame = requestAnimationFrame(scrollFrame);
    };
    pending.frame = requestAnimationFrame(scrollFrame);
  }, 250);
  pending.start = start;
}
document.addEventListener('pointermove', event => {
  const pending = touchDrag;
  if (!pending || event.pointerId !== pending.id) return;
  pending.x = event.clientX; pending.y = event.clientY;
  if (!pending.active) {
    if (Math.hypot(pending.x - pending.start.x, pending.y - pending.start.y) > 8) { clearTimeout(pending.timer); touchDrag = null; }
    return;
  }
  pending.ghost.style.left = `${pending.x + 8}px`; pending.ghost.style.top = `${pending.y - 35}px`;
  const target = document.elementFromPoint(pending.x, pending.y);
  const zone = target?.closest('.dropzone');
  if (zone) highlight(zone, target.closest('.course'), pending.y);
}, { passive: true });
document.addEventListener('touchmove', event => { if (touchDrag?.active) event.preventDefault(); }, { passive: false });
function endTouch(event) {
  const pending = touchDrag;
  if (!pending || event.pointerId !== pending.id) return;
  clearTimeout(pending.timer);
  cancelAnimationFrame(pending.frame);
  if (pending.active) {
    suppressClickUntil = Date.now() + 800;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const zone = target?.closest('.dropzone');
    pending.ghost.remove();
    if (zone && event.type !== 'pointercancel') finishDrop(zone, target.closest('.course'), event.clientY);
    else clearDrag();
  }
  touchDrag = null;
}
document.addEventListener('pointerup', endTouch);
document.addEventListener('pointercancel', endTouch);

function openEditor(id = null) {
  editingId = id;
  const course = state.courses.find(item => item.id === id);
  const form = $('#course-form');
  form.reset();
  $('#editor-title').textContent = course ? 'Editar bloque' : 'Crear ramo';
  $('#delete-course').hidden = !course;
  const destination = $('#destination');
  destination.replaceChildren(...[{ id: 'tray', name: 'Arriba · Ramos por ubicar' }, ...state.semesters].map(zone => {
    const option = element('option', '', zone.name);
    option.value = zone.id;
    return option;
  }));
  if (course) {
    for (const key of ['name', 'code', 'credits', 'color', 'zone']) form.elements.namedItem(key).value = course[key] ?? '';
  } else destination.value = 'tray';
  updatePositions();
  $('#editor').showModal();
  form.elements.namedItem('name').focus();
}

function updatePositions() {
  const select = $('#position');
  select.replaceChildren();
  for (const course of state.courses.filter(course => course.zone === $('#destination').value && course.id !== editingId)) {
    const option = element('option', '', `Antes de ${course.code || course.name}`);
    option.value = `before:${course.id}`; select.append(option);
  }
  const last = element('option', '', 'Al final'); last.value = ''; select.append(last);
  const current = state.courses.findIndex(course => course.id === editingId);
  const next = current >= 0 ? state.courses.slice(current + 1).find(course => course.zone === $('#destination').value) : null;
  select.value = next ? `before:${next.id}` : '';
}
$('#destination').addEventListener('change', updatePositions);

$('#add-course').addEventListener('click', () => openEditor());
$('#close-editor').addEventListener('click', () => $('#editor').close());
$('#course-form').addEventListener('submit', event => {
  event.preventDefault();
  if (applyPendingState()) return;
  const data = new FormData(event.currentTarget);
  const name = data.get('name').trim();
  if (!name) { toast('Escribe un nombre para el ramo.'); return; }
  const course = { id: editingId || crypto.randomUUID(), name, code: data.get('code').trim().toUpperCase(), credits: data.get('credits') === '' ? null : Number(data.get('credits')), color: data.get('color'), zone: data.get('zone') };
  const index = state.courses.findIndex(item => item.id === editingId);
  const next = structuredClone(state);
  if (index >= 0) next.courses[index] = course;
  else next.courses.push(course);
  const requestedZone = course.zone;
  if (!moveCourse(next, course.id, course.zone, data.get('position') ? data.get('position').slice(7) : null, 'before')) { toast('No hay espacio disponible sin superar 60 créditos.'); return; }
  try { state = validateState(next); } catch (error) { toast(error.message); return; }
  save(); render(); $('#editor').close();
  const actual = state.courses.find(item => item.id === course.id);
  toast(actual.zone !== requestedZone ? 'Bloque guardado en el siguiente semestre con espacio (máximo 60 créditos).' : editingId ? 'Bloque actualizado.' : 'Nuevo bloque creado.');
});
$('#delete-course').addEventListener('click', () => {
  if (applyPendingState()) return;
  state.courses = state.courses.filter(course => course.id !== editingId);
  save(); render(); $('#editor').close(); toast('Bloque eliminado.');
});
$('#add-semester').addEventListener('click', () => {
  if (state.semesters.length >= 30) { toast('Puedes tener hasta 30 semestres.'); return; }
  const id = `s-${crypto.randomUUID()}`;
  state.semesters.push({ id, name: `Semestre ${state.semesters.length + 1}` });
  save(); render();
  document.getElementById(`heading-${id}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
});
$('#reset').addEventListener('click', () => { $('#confirm-dialog').returnValue = ''; $('#confirm-dialog').showModal(); });
$('#confirm-dialog').addEventListener('close', () => {
  if (applyPendingState()) return;
  if ($('#confirm-dialog').returnValue !== 'confirm') return;
  state = initialState(curriculum); save(); render(); toast('Malla original restablecida.');
});
$('#export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = 'mi-malla-licc.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('El archivo es demasiado grande.');
    const imported = validateState(JSON.parse(await file.text()));
    if (!confirm('Importar reemplazará tu organización actual. ¿Continuar?')) return;
    state = imported; save(); render(); toast('Malla importada.');
  } catch (error) { toast(`No se pudo importar: ${error.message}`); }
  finally { event.target.value = ''; }
});

const knownCourses = curriculum.semesters.flatMap(semester => semester.courses);
$('#paste-courses').addEventListener('click', () => {
  $('#bulk-form').reset();
  $('#bulk-preview').textContent = 'Escribe o pega tu lista para comenzar.';
  $('#bulk-editor').showModal(); $('#bulk-text').focus();
});
$('#close-bulk').addEventListener('click', () => $('#bulk-editor').close());
$('#bulk-text').addEventListener('input', () => {
  try {
    const courses = parseCourseText($('#bulk-text').value, knownCourses);
    $('#bulk-preview').textContent = `${courses.length} bloque${courses.length === 1 ? '' : 's'} listo${courses.length === 1 ? '' : 's'} para crear.`;
  } catch (error) { $('#bulk-preview').textContent = error.message; }
});
$('#bulk-form').addEventListener('submit', event => {
  event.preventDefault();
  if (applyPendingState()) return;
  try {
    const courses = parseCourseText($('#bulk-text').value, knownCourses);
    if (state.courses.length + courses.length > 500) throw new Error('La malla admite hasta 500 bloques.');
    const next = structuredClone(state);
    const mode = $('#bulk-mode').value;
    let zone = 'tray';
    if (mode === 'semesters') {
      const last = next.semesters.at(-1);
      const reusable = !next.courses.some(course => course.zone === last.id);
      if (reusable) zone = last.id;
      else {
        if (next.semesters.length >= 30) throw new Error('No hay espacio: máximo 30 semestres.');
        zone = `s-${crypto.randomUUID()}`;
        next.semesters.push({ id: zone, name: `Semestre ${next.semesters.length + 1}` });
      }
    }
    courses.forEach(course => {
      const block = { ...course, id: crypto.randomUUID(), zone: 'tray' };
      next.courses.push(block);
      if (mode === 'semesters') {
        if (!moveCourse(next, block.id, zone)) throw new Error('No hay espacio: máximo 30 semestres. No se creó ningún bloque.');
        zone = block.zone;
      }
    });
    state = validateState(next); save(); render(); $('#bulk-editor').close();
    toast(`${courses.length} bloques creados${mode === 'semesters' ? ' y repartidos en nuevos semestres' : ' en la bandeja superior'}.`);
  } catch (error) { toast(error.message); }
});
window.addEventListener('storage', event => {
  if (event.key !== KEY || !event.newValue) return;
  try {
    const incoming = validateState(JSON.parse(event.newValue));
    if ($('#editor').open || $('#bulk-editor').open || $('#confirm-dialog').open) { pendingState = incoming; toast('La malla cambió en otra pestaña. Cierra este formulario para actualizarla; no se sobrescribirán los cambios.'); return; }
    state = incoming; render(); toast('Malla sincronizada con otra pestaña.');
  } catch { /* Ignore invalid external data. */ }
});
function applyPendingState() {
  if (!pendingState) return false;
  state = pendingState; pendingState = null;
  $('#editor').close(); $('#bulk-editor').close(); $('#confirm-dialog').close();
  render(); toast('Malla actualizada desde otra pestaña. Reabre el bloque para editar la versión actual.');
  return true;
}
for (const dialog of [$('#editor'), $('#bulk-editor'), $('#confirm-dialog')]) dialog.addEventListener('close', applyPendingState);
render();
if (!storageAvailable) toast('No se pudo recuperar el guardado. Puedes importar una copia o guardar una nueva malla.');
