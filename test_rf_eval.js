const Rules = require('./accessories_rules.js');
const RuleEngine = require('./rule_engine.js');

console.log('Testing RF evaluation in RuleEngine:');

const scopeInt = {
  W_C: 3.5, W_F: 0, L_C: 6, L_F: 0, L1_C: 6, L1_F: 0, L2_C: 0, L2_F: 0, L3_C: 0, L3_F: 0, L4_C: 0, L4_F: 0,
  H_O: 1.5, H_C: 1.5, H_F: 0, N_PA: 1, W_O: 3.5, L_O: 6, RF: 1, L2_O: 0, S_1M: 0, R1: 8, R05: 4
};

const scopeExt = Object.assign({}, scopeInt, { RF: 2 });

const ap50 = Rules.boltsAndNuts.rows.find(r => r.id === 'AP50');
const ap51 = Rules.boltsAndNuts.rows.find(r => r.id === 'AP51');
const ap23 = Rules.boltsAndNuts.rows.find(r => r.id === 'AP23');
const ap66 = Rules.boltsAndNuts.rows.find(r => r.id === 'AP66');

console.log('Internal (RF=1):');
console.log('  AP50 (External Stopper):', RuleEngine.evaluate(ap50.formula, scopeInt));
console.log('  AP51 (H beam Support):', RuleEngine.evaluate(ap51.formula, scopeInt));
console.log('  AP23 (Lower fixture 1.5mH):', RuleEngine.evaluate(ap23.formula, scopeInt));
console.log('  AP66 (Internal Tie-Rods Bracket):', RuleEngine.evaluate(ap66.formula, scopeInt));

console.log('\nExternal (RF=2):');
console.log('  AP50 (External Stopper):', RuleEngine.evaluate(ap50.formula, scopeExt));
console.log('  AP51 (H beam Support):', RuleEngine.evaluate(ap51.formula, scopeExt));
console.log('  AP23 (Lower fixture 1.5mH):', RuleEngine.evaluate(ap23.formula, scopeExt));
console.log('  AP66 (Internal Tie-Rods Bracket):', RuleEngine.evaluate(ap66.formula, scopeExt));
