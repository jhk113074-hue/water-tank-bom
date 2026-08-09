// =============================================================================
// WATANI GRP Water Tank -- Generic Rule/Formula Engine
// =============================================================================
// A tiny, safe expression evaluator so that BOM calculation formulas can live
// as EDITABLE DATA (plain text formula strings in *_rules.js / *_catalog.js
// files) instead of being hard-coded inside panel_engine.js / accessories_
// engine.js. Nobody needs to touch JS code to change a coefficient, add a
// height bracket, or adjust a threshold -- just edit the formula string or
// table in the relevant *_rules.js file.
//
// SUPPORTED EXPRESSION SYNTAX (used inside "formula"/"condition" strings):
//   Numbers:        1, 2.5, 0
//   Variables:      any name from the scope object passed to evaluate()
//                    e.g. W_C, W_F, H_O, N_PA, totLC ...
//   Arithmetic:      + - * / %
//   Comparison:      == != < <= > >=
//   Logical:         && || !  (also "and"/"or"/"not" as aliases)
//   Grouping:        ( ... )
//   Ternary:         condition ? valueIfTrue : valueIfFalse
//   Functions:       max(a,b), min(a,b), abs(x), round(x), ceil(x), floor(x),
//                     trunc(x) -- plus any extra function passed in via the
//                     `scope` object (e.g. segCount(), layerFactor()).
//
// EXAMPLE formula strings actually used elsewhere in this app:
//   "(H_O==1.5||H_O==2) ? (W_F+totLF)*2 : 0"
//   "max(W_C*L_C - manhole - y11, 0)"
//   "(W_C+W_F-1)*N_PA"
//
// This file has NO dependency on the rest of the app and is safe to reuse
// for any future rule set (e.g. a second vendor's catalog/coefficients).
// =============================================================================
(function (global) {
  "use strict";

  // ---- Tokenizer -----------------------------------------------------------
  const TOKEN_RE = /\s*("[^"]*"|'[^']*'|=>|<=|>=|==|!=|&&|\|\||[-+*/%()?:,<>!]|[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+\.|\.\d+|\d+)\s*/y;

  function tokenize(src) {
    const tokens = [];
    TOKEN_RE.lastIndex = 0;
    let idx = 0;
    while (idx < src.length) {
      TOKEN_RE.lastIndex = idx;
      const m = TOKEN_RE.exec(src);
      if (!m || m[0].length === 0) {
        throw new Error(`수식을 해석할 수 없습니다 (위치 ${idx}): "${src}"`);
      }
      tokens.push(m[1]);
      idx += m[0].length;
    }
    return tokens;
  }

  const WORD_ALIASES = { and: "&&", or: "||", not: "!" };

  // ---- Recursive-descent parser + evaluator (parses & evaluates in one pass) ----
  function Parser(tokens, scope) {
    this.tokens = tokens;
    this.pos = 0;
    this.scope = scope;
  }
  Parser.prototype.peek = function () { return this.tokens[this.pos]; };
  Parser.prototype.next = function () { return this.tokens[this.pos++]; };
  Parser.prototype.expect = function (tok) {
    const t = this.next();
    if (t !== tok) throw new Error(`수식 오류: "${tok}"가 필요하지만 "${t}"를 만났습니다.`);
  };

  Parser.prototype.parseExpression = function () { return this.parseTernary(); };

  Parser.prototype.parseTernary = function () {
    const cond = this.parseOr();
    if (this.peek() === "?") {
      this.next();
      const a = this.parseTernary();
      this.expect(":");
      const b = this.parseTernary();
      return truthy(cond) ? a : b;
    }
    return cond;
  };

  Parser.prototype.parseOr = function () {
    let v = this.parseAnd();
    while (this.peek() === "||") { this.next(); const r = this.parseAnd(); v = truthy(v) || truthy(r); }
    return v;
  };
  Parser.prototype.parseAnd = function () {
    let v = this.parseEquality();
    while (this.peek() === "&&") { this.next(); const r = this.parseEquality(); v = truthy(v) && truthy(r); }
    return v;
  };
  Parser.prototype.parseEquality = function () {
    let v = this.parseComparison();
    for (;;) {
      const op = this.peek();
      if (op === "==") { this.next(); v = v === this.parseComparison(); }
      else if (op === "!=") { this.next(); v = v !== this.parseComparison(); }
      else break;
    }
    return v;
  };
  Parser.prototype.parseComparison = function () {
    let v = this.parseAdditive();
    for (;;) {
      const op = this.peek();
      if (op === "<") { this.next(); v = v < this.parseAdditive(); }
      else if (op === "<=") { this.next(); v = v <= this.parseAdditive(); }
      else if (op === ">") { this.next(); v = v > this.parseAdditive(); }
      else if (op === ">=") { this.next(); v = v >= this.parseAdditive(); }
      else break;
    }
    return v;
  };
  Parser.prototype.parseAdditive = function () {
    let v = this.parseMultiplicative();
    for (;;) {
      const op = this.peek();
      if (op === "+") {
        this.next();
        const rhs = this.parseMultiplicative();
        v = (typeof v === "string" || typeof rhs === "string") ? String(v) + String(rhs) : Number(v) + Number(rhs);
      }
      else if (op === "-") { this.next(); v = Number(v) - Number(this.parseMultiplicative()); }
      else break;
    }
    return v;
  };
  Parser.prototype.parseMultiplicative = function () {
    let v = this.parseUnary();
    for (;;) {
      const op = this.peek();
      if (op === "*") { this.next(); v = Number(v) * Number(this.parseUnary()); }
      else if (op === "/") { this.next(); v = Number(v) / Number(this.parseUnary()); }
      else if (op === "%") { this.next(); v = Number(v) % Number(this.parseUnary()); }
      else break;
    }
    return v;
  };
  Parser.prototype.parseUnary = function () {
    const op = this.peek();
    if (op === "!") { this.next(); return !truthy(this.parseUnary()); }
    if (op === "-") { this.next(); return -Number(this.parseUnary()); }
    if (op === "+") { this.next(); return Number(this.parseUnary()); }
    return this.parsePrimary();
  };
  const BUILTIN_FUNCS = {
    max: (...a) => Math.max(...a),
    min: (...a) => Math.min(...a),
    abs: Math.abs,
    round: Math.round,
    ceil: Math.ceil,
    floor: Math.floor,
    trunc: Math.trunc,
  };
  Parser.prototype.parsePrimary = function () {
    const t = this.next();
    if (t === undefined) throw new Error("수식이 예기치 않게 끝났습니다.");
    if (t.startsWith('"') || t.startsWith("'")) {
      return t.slice(1, -1);
    }
    if (t === "(") {
      const v = this.parseExpression();
      this.expect(")");
      return v;
    }
    if (/^\d/.test(t) || /^\.\d/.test(t)) return parseFloat(t);
    if (/^[A-Za-z_]/.test(t)) {
      if (t === "true") return true;
      if (t === "false") return false;
      if (t === "not") { return !truthy(this.parseUnary()); }
      if (this.peek() === "(") {
        this.next(); // consume '('
        const args = [];
        if (this.peek() !== ")") {
          args.push(this.parseExpression());
          while (this.peek() === ",") { this.next(); args.push(this.parseExpression()); }
        }
        this.expect(")");
        const fn = (this.scope && typeof this.scope[t] === "function") ? this.scope[t] : BUILTIN_FUNCS[t];
        if (!fn) throw new Error(`알 수 없는 함수: ${t}()`);
        return fn.apply(null, args);
      }
      if (this.scope && Object.prototype.hasOwnProperty.call(this.scope, t)) {
        const v = this.scope[t];
        return typeof v === "boolean" ? v : Number(v);
      }
      throw new Error(`정의되지 않은 변수: ${t}`);
    }
    throw new Error(`수식을 해석할 수 없습니다: "${t}"`);
  };

  function truthy(v) { return v === true || (typeof v === "number" && v !== 0); }

  /** Evaluate a single expression string against a scope object. Returns number|boolean. */
  function evaluate(exprString, scope) {
    const tokens = tokenize(String(exprString));
    const parser = new Parser(tokens, scope || {});
    const result = parser.parseExpression();
    if (parser.pos !== tokens.length) {
      throw new Error(`수식에 처리되지 않은 나머지 부분이 있습니다: "${tokens.slice(parser.pos).join(" ")}"`);
    }
    return result;
  }

  /**
   * Run an ordered list of named intermediate formulas against a base scope,
   * adding each computed value into the (copied) scope so later formulas can
   * reference earlier ones by name. Returns the extended scope.
   * intermediates: [{ name: "totLC", formula: "L1_C+L2_C+L3_C+L4_C" }, ...]
   */
  function withIntermediates(intermediates, baseScope) {
    const scope = Object.assign({}, baseScope);
    (intermediates || []).forEach(({ name, formula }) => {
      scope[name] = evaluate(formula, scope);
    });
    return scope;
  }

  /**
   * Evaluate a list of rule rows and reduce them to a single total.
   * rows: [{ id, condition? (default "true"), formula }]
   * reducer: "sum" | "sum_max0" | "sum_floor_max0" | "sum_round_max0"
   * Returns { total, detail: [{id, value}] } for easy debugging/audit.
   */
  function sumRules(rows, scope, reducer) {
    reducer = reducer || "sum";
    const detail = [];
    let total = 0;
    (rows || []).forEach((row) => {
      const cond = row.condition !== undefined ? row.condition : "true";
      const condVal = evaluate(cond, scope);
      let v = truthy(condVal) ? Number(evaluate(row.formula, scope)) || 0 : 0;
      if (reducer === "sum_max0") v = Math.max(0, v);
      else if (reducer === "sum_floor_max0") v = Math.floor(Math.max(0, v));
      else if (reducer === "sum_round_max0") v = Math.max(0, v); // rounding applied to grand total by caller
      detail.push({ id: row.id, value: v });
      total += v;
    });
    return { total, detail };
  }

  const RuleEngine = { evaluate, withIntermediates, sumRules, tokenize };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = RuleEngine;
  } else {
    global.RuleEngine = RuleEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
