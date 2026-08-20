// =============================================================================
// WATANI GRP Water Tank -- PART NAMING (거래처별 품번 표기)
// =============================================================================
// The same physical item is called different things by different companies.
// Inside this repo alone the reinforcing drawings and the parts catalog already
// disagree 22 times -- the drawing says WBR-1610Z where the DB says WCP-1610Z,
// WBR-1616Z vs WCP-1616Z, plain "1200Z" vs WFB-1200Z -- and the YS ACC deck
// introduces a third set again (TR-12M0000Z, WBR-1760S).
//
// Everything in the app looks a part up by EXACT partNo (app.js lookupPart),
// so any other name simply fails to resolve and shows as "DB 미등록".
//
// This module adds a naming layer on top of that, without moving the anchor:
//
//   * the DB's own partNo stays the CANONICAL key. Quantities, formula rows,
//     drawing bindings and the BOM all keep using it, so nothing downstream
//     changes meaning.
//   * a PARTY (거래처) is a named set of alternative part numbers/names for
//     those canonical parts. Selecting a party changes how parts are LABELLED.
//   * toCanonical() resolves any known label back to the canonical partNo, so
//     a drawing that says WBR-1610Z can still find its DB record.
//
// IT DOES NOT INVENT MAPPINGS. A label only resolves once someone has recorded
// the match; anything unmatched stays visibly unmatched, which is the point --
// the matching itself is domain work for the person who owns the catalog.
//
// Persistence mirrors the pattern steel_accessories.js already uses:
// localStorage first, Firestore (settings/partNaming) merged on top when
// available, so a match recorded on one device shows up on another.
// =============================================================================
(function (global) {
  "use strict";

  const STORAGE_KEY = "water_tank_part_naming_v1";
  const FIRESTORE_DOC = "partNaming";
  const STANDARD = "YSACC (Default)";  // the primary default party
  const DEFAULT_PARTIES = ["YSACC (Default)", "MNT", "WATANI", "HAYOUNG", "ALMUFTAH"];

  // {
  //   activeParty: "YSACC (Default)",
  //   parties: ["YSACC (Default)", "MNT", "WATANI", "HAYOUNG", "ALMUFTAH"],
  //   map: { "<canonical partNo>": { "<party>": { partNo, name } } }
  // }
  let state = null;
  let dbRef = null;
  const listeners = [];

  function emptyState() {
    return { activeParty: STANDARD, parties: DEFAULT_PARTIES.slice(), deletedParties: [], map: {} };
  }

  function normalise(s) {
    const deleted = Array.isArray(s.deletedParties) ? s.deletedParties.slice() : [];
    let rawParties = Array.isArray(s.parties) ? s.parties.slice() : [];

    // Always include DEFAULT_PARTIES if not explicitly deleted
    DEFAULT_PARTIES.forEach(function (dp) {
      if (deleted.indexOf(dp) === -1 && rawParties.indexOf(dp) === -1) {
        rawParties.push(dp);
      }
    });

    // Incorporate any presets defined in Panel Config matrix
    if (typeof global !== 'undefined' && typeof global.getMatrixCustomerPresetList === 'function') {
      try {
        const matrixCusts = global.getMatrixCustomerPresetList();
        matrixCusts.forEach(function (c) {
          const pName = (c.id === 'default') ? STANDARD : c.name.replace(/\s*Spec$/i, '').trim();
          if (pName && deleted.indexOf(pName) === -1 && rawParties.indexOf(pName) === -1) {
            rawParties.push(pName);
          }
        });
      } catch (e) {}
    }
    // Filter out duplicate or legacy names
    let parties = [];
    rawParties.forEach(function(p) {
      if (p === "표준" || p === "표준 (Standard)" || p === "YSACC (도면 표기)" || p === "YSACC") return;
      if (deleted.indexOf(p) !== -1) return;
      if (parties.indexOf(p) === -1) parties.push(p);
    });
    if (parties.indexOf(STANDARD) === -1) parties.unshift(STANDARD);

    let active = s.activeParty;
    if (!active || active === "표준" || active === "표준 (Standard)" || active === "YSACC (도면 표기)" || active === "YSACC" || parties.indexOf(active) === -1) {
      active = STANDARD;
    }
    return { activeParty: active,
             parties: parties,
             deletedParties: deleted,
             map: s.map && typeof s.map === "object" ? s.map : {} };
  }

  function load() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      state = raw ? normalise(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.error("[PartNaming] localStorage 불러오기 실패:", e);
      state = emptyState();
    }
    if (state.parties.indexOf(STANDARD) === -1) state.parties.unshift(STANDARD);
    rebuildIndex();
  }

  function ensure() {
    if (!state) load();
    return state;
  }

  function persist() {
    rebuildIndex();
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[PartNaming] localStorage 저장 실패:", e);
    }
    if (dbRef) {
      dbRef.collection("settings").doc(FIRESTORE_DOC)
        .set({ state: state, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(function (err) {
          console.warn("[PartNaming] Firestore 저장 실패 (localStorage에는 저장됨):", err);
        });
    }
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* listener's problem */ } });
  }

  // Reverse index: every known label -> canonical partNo. Rebuilt on every
  // write rather than searched linearly, because toCanonical() is called once
  // per drawn member per render.
  let reverse = {};
  function rebuildIndex() {
    reverse = {};
    const map = state.map || {};
    Object.keys(map).forEach(function (canonical) {
      const byParty = map[canonical] || {};
      Object.keys(byParty).forEach(function (party) {
        const alt = byParty[party];
        if (alt && alt.partNo) reverse[String(alt.partNo).trim().toUpperCase()] = canonical;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  // Canonical partNo -> the label the active party uses for it.
  function displayPartNo(canonical) {
    if (!canonical) return canonical;
    const s = ensure();
    if (s.activeParty === STANDARD) return canonical;
    const alt = (s.map[canonical] || {})[s.activeParty];
    return (alt && alt.partNo) || canonical;
  }

  // The active party's own product name, when they gave one.
  function displayName(canonical) {
    if (!canonical) return null;
    const s = ensure();
    if (s.activeParty === STANDARD) return null;
    const alt = (s.map[canonical] || {})[s.activeParty];
    return (alt && alt.name) || null;
  }

  // Any recorded label -> canonical partNo. Returns the input unchanged when no
  // match has been recorded: an unmatched name must stay unmatched rather than
  // silently resolving to something plausible.
  function toCanonical(anyName) {
    if (!anyName) return anyName;
    const s = ensure();
    const key = String(anyName).trim().toUpperCase();
    if (s.map[anyName]) return anyName;          // already canonical
    return reverse[key] || anyName;
  }

  function getMapping(canonical, party) {
    const s = ensure();
    return ((s.map[canonical] || {})[party]) || null;
  }

  function setMapping(canonical, party, alt) {
    const s = ensure();
    if (!canonical || !party || party === STANDARD) return false;
    if (s.parties.indexOf(party) === -1) s.parties.push(party);
    const partNo = alt && alt.partNo ? String(alt.partNo).trim() : "";
    const name = alt && alt.name ? String(alt.name).trim() : "";
    if (!partNo && !name) {
      if (s.map[canonical]) {
        delete s.map[canonical][party];
        if (!Object.keys(s.map[canonical]).length) delete s.map[canonical];
      }
    } else {
      if (!s.map[canonical]) s.map[canonical] = {};
      s.map[canonical][party] = { partNo: partNo, name: name };
    }
    persist();
    return true;
  }

  function listParties() {
    const s = ensure();
    const deleted = Array.isArray(s.deletedParties) ? s.deletedParties : [];
    DEFAULT_PARTIES.forEach(function (dp) {
      if (deleted.indexOf(dp) === -1 && s.parties.indexOf(dp) === -1) {
        s.parties.push(dp);
      }
    });
    if (typeof global !== 'undefined' && typeof global.getMatrixCustomerPresetList === 'function') {
      try {
        const matrixCusts = global.getMatrixCustomerPresetList();
        matrixCusts.forEach(function (c) {
          const pName = (c.id === 'default') ? STANDARD : c.name.replace(/\s*Spec$/i, '').trim();
          if (pName && deleted.indexOf(pName) === -1 && s.parties.indexOf(pName) === -1) {
            s.parties.push(pName);
          }
        });
      } catch (e) {}
    }
    if (s.parties.indexOf(STANDARD) === -1) s.parties.unshift(STANDARD);
    return s.parties.slice();
  }

  function activeParty() { return ensure().activeParty; }

  function setActiveParty(p) {
    const s = ensure();
    if (listParties().indexOf(p) === -1) return false;
    s.activeParty = p;
    persist();
    return true;
  }

  function addParty(p) {
    const s = ensure();
    const name = String(p || "").trim();
    if (!name || s.parties.indexOf(name) !== -1) return false;
    if (!s.deletedParties) s.deletedParties = [];
    const dIdx = s.deletedParties.indexOf(name);
    if (dIdx !== -1) s.deletedParties.splice(dIdx, 1);
    s.parties.push(name);
    persist();
    return true;
  }

  function removeParty(p) {
    const s = ensure();
    if (p === STANDARD) return false;
    if (!s.deletedParties) s.deletedParties = [];
    if (s.deletedParties.indexOf(p) === -1) s.deletedParties.push(p);
    const i = s.parties.indexOf(p);
    if (i !== -1) s.parties.splice(i, 1);
    Object.keys(s.map).forEach(function (c) {
      delete s.map[c][p];
      if (!Object.keys(s.map[c]).length) delete s.map[c];
    });
    if (s.activeParty === p) s.activeParty = STANDARD;
    persist();
    return true;
  }

  // Seed a party from pairs the drawing author already recorded (a member's
  // aliasLabel next to its partNo). This TRANSCRIBES existing data -- it does
  // not infer a match that nobody wrote down. Existing entries are never
  // overwritten.
  function seedFromPairs(party, pairs) {
    const s = ensure();
    if (!party || party === STANDARD || !Array.isArray(pairs)) return 0;
    if (s.deletedParties && s.deletedParties.indexOf(party) !== -1) return 0;
    if (s.parties.indexOf(party) === -1) s.parties.push(party);
    let n = 0;
    pairs.forEach(function (p) {
      if (!p || !p.canonical || !p.label) return;
      if (p.canonical === p.label) return;
      if (!s.map[p.canonical]) s.map[p.canonical] = {};
      if (s.map[p.canonical][party]) return;     // never clobber a real decision
      s.map[p.canonical][party] = { partNo: p.label, name: "" };
      n++;
    });
    if (n) persist();
    return n;
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function syncFromFirestore(db) {
    dbRef = db || dbRef;
    if (!dbRef) return Promise.resolve();
    return dbRef.collection("settings").doc(FIRESTORE_DOC).get().then(function (doc) {
      if (!doc.exists) return;
      const remote = (doc.data() || {}).state;
      if (!remote) return;
      const s = ensure();
      const remoteDeleted = remote.deletedParties || [];
      const combinedDeleted = Array.from(new Set((s.deletedParties || []).concat(remoteDeleted)));
      state = normalise({
        activeParty: s.activeParty,               // party choice stays local
        deletedParties: combinedDeleted,
        parties: s.parties.concat((remote.parties || []).filter(function (p) { return s.parties.indexOf(p) === -1 && combinedDeleted.indexOf(p) === -1; })),
        map: Object.assign({}, s.map, remote.map || {}),
      });
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { /* ignore */ }
      rebuildIndex();
      listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    }).catch(function (err) {
      console.warn("[PartNaming] Firestore 불러오기 실패, localStorage만 사용:", err);
    });
  }

  function init(db) {
    load();
    dbRef = db || null;
    return syncFromFirestore(dbRef);
  }

  function renameParty(oldParty, newParty) {
    const s = ensure();
    const oName = String(oldParty || "").trim();
    const nName = String(newParty || "").trim();
    if (!oName || !nName || oName === STANDARD || oName === nName) return false;
    const idx = s.parties.indexOf(oName);
    if (idx === -1) return false;
    if (s.parties.indexOf(nName) !== -1) return false;
    s.parties[idx] = nName;
    Object.keys(s.map).forEach(function (c) {
      if (s.map[c][oName]) {
        s.map[c][nName] = s.map[c][oName];
        delete s.map[c][oName];
      }
    });
    if (s.activeParty === oName) s.activeParty = nName;
    persist();
    return true;
  }

  function copyParty(srcParty, dstParty) {
    const s = ensure();
    const sName = String(srcParty || "").trim();
    const dName = String(dstParty || "").trim();
    if (!sName || !dName || s.parties.indexOf(sName) === -1 || s.parties.indexOf(dName) !== -1) return false;
    s.parties.push(dName);
    Object.keys(s.map).forEach(function (c) {
      if (s.map[c][sName]) {
        s.map[c][dName] = JSON.parse(JSON.stringify(s.map[c][sName]));
      }
    });
    persist();
    return true;
  }

  global.PartNaming = {
    STANDARD: STANDARD,
    init: init,
    displayPartNo: displayPartNo,
    displayName: displayName,
    toCanonical: toCanonical,
    getMapping: getMapping,
    setMapping: setMapping,
    listParties: listParties,
    activeParty: activeParty,
    setActiveParty: setActiveParty,
    addParty: addParty,
    renameParty: renameParty,
    copyParty: copyParty,
    removeParty: removeParty,
    seedFromPairs: seedFromPairs,
    onChange: onChange,
    getState: function () { return JSON.parse(JSON.stringify(ensure())); },
  };
})(typeof window !== "undefined" ? window : globalThis);
