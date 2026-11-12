// Prüft die Planlogik aus index.html: node test.js
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8').match(/<script id="planner">([\s\S]*?)<\/script>/)[1];
const Planner = new Function('module', src + '; return Planner;')(undefined);

const errors = r => r.warnings.filter(w => w.level === 'error');
const maxRun = (r, pid) => { let run = 0, m = 0; for (const d of r.days) { run = r.plan[pid][d] ? run + 1 : 0; m = Math.max(m, run); } return m; };

// 1. Grundplan über 13 Wochen
let state = Planner.defaultState(new Date('2026-11-12T00:00:00Z'));
let r = Planner.generate(state);
assert.strictEqual(state.start, '2026-11-16');
assert.deepStrictEqual(errors(r), [], 'Grundplan ohne Regelverstöße');
for (const d of r.days) {
  const on = s => state.people.filter(p => r.plan[p.id][d] === s).length;
  assert.strictEqual(on('NS'), 1, 'genau eine Nachtschicht am ' + d);
  assert.ok(on('FRUEH') >= 1 && on('SP2') >= 1, 'Früh und Spät besetzt am ' + d);
  if (Planner.dow(d) > 4) {
    assert.strictEqual(state.people.filter(p => p.group === 'tech' && r.plan[p.id][d]).length, 2, 'zwei Techniker am ' + d);
    assert.strictEqual(state.people.filter(p => p.group === 'aushilfe' && r.plan[p.id][d]).length, 1, 'eine Aushilfe am ' + d);
  }
}
for (const s of r.stats.filter(s => s.group === 'tech')) {
  assert.ok(s.weekend >= 8 && s.weekend <= 10, `${s.name}: ${s.weekend} Wochenendtage in 13 Wochen`);
  assert.ok(maxRun(r, s.pid) <= 6, s.name + ': höchstens 6 Tage am Stück');
}
const t1 = r.stats.find(s => s.pid === 't1'), t2 = r.stats.find(s => s.pid === 't2');
assert.deepStrictEqual(Object.keys(t1.by).sort(), ['FRUEH', 'NS'], 'Techniker 1 nur Früh und Nacht');
assert.ok(!t2.by.NS, 'Techniker 2 ohne Nachtschicht');
assert.strictEqual(r.warnings.filter(w => w.level === 'warn').length, 0, 'Grundplan ohne Warnungen');

// 2. Zwei Wochen Urlaub: Pflichtschichten bleiben besetzt, niemand wird im Urlaub eingeteilt
state.entries.push({ pid: 't3', type: 'abwesend', from: '2026-11-23', to: '2026-12-06' });
r = Planner.generate(state);
assert.deepStrictEqual(errors(r), [], 'Plan mit Urlaub ohne Regelverstöße');
assert.ok(r.days.filter(d => d >= '2026-11-23' && d <= '2026-12-06').every(d => !r.plan.t3[d]));

// 3. Einzelner Krankheitstag der Nachtschicht wird aufgefangen
state = Planner.defaultState(new Date('2026-11-12T00:00:00Z'));
r = Planner.generate(state);
const day = '2026-11-18';
const ns = state.people.find(p => r.plan[p.id][day] === 'NS');
state.entries.push({ pid: ns.id, type: 'abwesend', from: day, to: day });
r = Planner.generate(state);
assert.deepStrictEqual(errors(r), [], 'Krankheitstag ohne Regelverstöße');
assert.strictEqual(state.people.filter(p => r.plan[p.id][day] === 'NS').length, 1);

// 4. Handänderung wird übernommen und geprüft
state.overrides = { t2: { [day]: 'NS' } };
r = Planner.generate(state);
assert.strictEqual(r.plan.t2[day], 'NS');
assert.ok(errors(r).some(w => w.pid === 't2' && w.date === day), 'Verstoß gegen „nie Nacht“ wird gemeldet');

console.log('Alle Prüfungen bestanden.');

// 5. Andere Varianten halten dieselben Regeln ein
for (const seed of [1, 7, 12345, 987654321]) {
  const st = Planner.defaultState(new Date('2026-11-12T00:00:00Z')); st.seed = seed;
  const v = Planner.generate(st);
  assert.deepStrictEqual(errors(v), [], 'Variante ' + seed + ' ohne Regelverstöße');
  for (const s of v.stats.filter(s => s.group === 'tech')) assert.ok(s.weekend >= 8 && s.weekend <= 10 && maxRun(v, s.pid) <= 6);
  assert.ok(!v.stats.find(s => s.pid === 't2').by.NS);
}
console.log('Varianten geprüft.');
