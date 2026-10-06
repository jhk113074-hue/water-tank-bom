/**
 * company_auth.js - Multi-Tenant Company Authentication & Isolated Workspace Engine
 * 
 * Manages 5 core companies:
 *   1. ysacc (YSACC / Standard - Admin)
 *   2. mnt (MNT)
 *   3. almuftah (ALMUFTAH)
 *   4. hayoung (HAYOUNG)
 *   5. alhilal (ALHILAL)
 * 
 * Provides:
 *   - Secure login & session management (with admin bypass & password changes)
 *   - Per-company System Settings auto-memory (Preset, Currency, Bolt, Naming, Mold, Hole, Reinforcing)
 *   - Per-company Master BOM DB Price Overlays & Custom Catalog isolation
 *   - Per-company Part Availability/Usage Management (부품별 각업체 사용여부 관리 - O/X)
 *   - Firestore cloud sync for all settings, prices & part usage
 */

(function (global) {
  "use strict";

  const SESSION_KEY = "water_tank_company_session_v1";
  const AUTH_SETTINGS_KEY = "water_tank_company_auth_settings_v1";
  const SESSION_LOGGED_IN_KEY = "water_tank_company_logged_in_v1";
  const REMEMBER_LOGIN_KEY = "water_tank_company_remember_login_v1";
  const FIRESTORE_SETTINGS_DOC = "companyAuth";
  const FIRESTORE_PART_USAGE_DOC = "companyPartUsage";

  // 5 Canonical Supported Companies
  const DEFAULT_COMPANIES = {
    ysacc: {
      id: "ysacc",
      name: "YSACC",
      fullName: "YSACC Co., Ltd.",
      presetId: "default",
      partyName: "YSACC (Default)",
      currency: "USD",
      role: "admin",
      defaultPassword: "ysacc",
      color: "#0284c7",
      icon: "fa-shield-halved"
    },
    mnt: {
      id: "mnt",
      name: "MNT",
      fullName: "M.N.T Trading & Contracting",
      presetId: "mnt_spec",
      partyName: "MNT",
      currency: "USD",
      role: "company",
      defaultPassword: "mnt",
      color: "#16a34a",
      icon: "fa-building"
    },
    almuftah: {
      id: "almuftah",
      name: "ALMUFTAH",
      fullName: "Almuftah Group",
      presetId: "almuftah",
      partyName: "ALMUFTAH",
      currency: "QAR",
      role: "company",
      defaultPassword: "almuftah",
      color: "#8b5cf6",
      icon: "fa-building"
    },
    hayoung: {
      id: "hayoung",
      name: "HAYOUNG",
      fullName: "HAYOUNG Industry",
      presetId: "hayoung_spec",
      partyName: "HAYOUNG",
      currency: "KRW",
      role: "company",
      defaultPassword: "hayoung",
      color: "#f59e0b",
      icon: "fa-building"
    },
    alhilal: {
      id: "alhilal",
      name: "ALHILAL",
      fullName: "Al Hilal Group",
      presetId: "alhilal_spec",
      partyName: "ALHILAL",
      currency: "SAR",
      role: "company",
      defaultPassword: "alhilal",
      color: "#ec4899",
      icon: "fa-building"
    }
  };

  let firestoreDb = null;
  let currentCompanyId = "ysacc";
  let authSettings = {}; // { [companyId]: { password, name, currency, logoUrl, customNotes } }
  let priceOverlays = {}; // { [companyId]: { [partNo]: price } }
  let disabledPartsByCompany = {}; // { [companyId]: { [partNo]: true } }
  let baselineDbCatalog = null; // Unmodified standard baseline catalog
  const changeListeners = [];

  function loadLocalSettings() {
    try {
      const raw = localStorage.getItem(AUTH_SETTINGS_KEY);
      if (raw) {
        authSettings = JSON.parse(raw) || {};
      }
    } catch (e) {
      console.warn("[CompanyAuth] Failed to load local auth settings:", e);
      authSettings = {};
    }

    // Ensure every company has default credentials
    Object.keys(DEFAULT_COMPANIES).forEach(id => {
      const def = DEFAULT_COMPANIES[id];
      if (!authSettings[id]) {
        authSettings[id] = {
          password: def.defaultPassword,
          name: def.name,
          fullName: def.fullName,
          currency: def.currency,
          presetId: def.presetId,
          partyName: def.partyName
        };
      } else {
        if (!authSettings[id].password) authSettings[id].password = def.defaultPassword;
        if (!authSettings[id].currency) authSettings[id].currency = def.currency;
        if (!authSettings[id].presetId) authSettings[id].presetId = def.presetId;
        if (!authSettings[id].partyName) authSettings[id].partyName = def.partyName;
      }
    });

    // Load active session
    try {
      const sessRaw = localStorage.getItem(SESSION_KEY);
      if (sessRaw) {
        const sess = JSON.parse(sessRaw);
        if (sess && sess.companyId && DEFAULT_COMPANIES[sess.companyId]) {
          currentCompanyId = sess.companyId;
        }
      }
    } catch (e) {
      currentCompanyId = "ysacc";
    }

    // Load price overlays & disabled parts for each company
    Object.keys(DEFAULT_COMPANIES).forEach(id => {
      try {
        const overlayRaw = localStorage.getItem(`water_tank_company_prices_${id}`);
        priceOverlays[id] = overlayRaw ? JSON.parse(overlayRaw) : {};
      } catch (e) {
        priceOverlays[id] = {};
      }

      try {
        const disabledRaw = localStorage.getItem(`water_tank_company_disabled_parts_${id}`);
        disabledPartsByCompany[id] = disabledRaw ? JSON.parse(disabledRaw) : {};
      } catch (e) {
        disabledPartsByCompany[id] = {};
      }
    });
  }

  function persistSettings() {
    try {
      localStorage.setItem(AUTH_SETTINGS_KEY, JSON.stringify(authSettings));
    } catch (e) {
      console.warn("[CompanyAuth] LocalStorage save error:", e);
    }

    if (firestoreDb) {
      firestoreDb.collection("settings").doc(FIRESTORE_SETTINGS_DOC)
        .set({ authSettings: authSettings, updatedAt: new Date().toISOString() }, { merge: true })
        .catch(err => console.warn("[CompanyAuth] Firestore settings sync warning:", err));
    }
  }

  function persistSession() {
    try {
      const comp = DEFAULT_COMPANIES[currentCompanyId] || DEFAULT_COMPANIES.ysacc;
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        companyId: currentCompanyId,
        role: comp.role,
        loggedInAt: Date.now()
      }));
    } catch (e) {}
  }

  function persistPriceOverlay(companyId) {
    if (!companyId) companyId = currentCompanyId;
    const overlay = priceOverlays[companyId] || {};
    try {
      localStorage.setItem(`water_tank_company_prices_${companyId}`, JSON.stringify(overlay));
    } catch (e) {}

    if (firestoreDb) {
      firestoreDb.collection("settings").doc(`companyPrices_${companyId}`)
        .set({ prices: overlay, updatedAt: new Date().toISOString() }, { merge: false })
        .catch(err => console.warn(`[CompanyAuth] Cloud price sync error for ${companyId}:`, err));
    }
  }

  function persistPartUsage(companyId) {
    if (companyId) {
      const disabledMap = disabledPartsByCompany[companyId] || {};
      try {
        localStorage.setItem(`water_tank_company_disabled_parts_${companyId}`, JSON.stringify(disabledMap));
      } catch (e) {}
    } else {
      Object.keys(DEFAULT_COMPANIES).forEach(id => {
        const disabledMap = disabledPartsByCompany[id] || {};
        try {
          localStorage.setItem(`water_tank_company_disabled_parts_${id}`, JSON.stringify(disabledMap));
        } catch (e) {}
      });
    }

    if (firestoreDb) {
      firestoreDb.collection("settings").doc(FIRESTORE_PART_USAGE_DOC)
        .set({ disabledPartsByCompany: disabledPartsByCompany, updatedAt: new Date().toISOString() }, { merge: true })
        .catch(err => console.warn("[CompanyAuth] Firestore part usage sync error:", err));
    }
  }

  // --- PART USAGE / AVAILABILITY (사용여부 관리) ---

  function isPartEnabled(partNo, companyId) {
    if (!partNo) return true;
    const cid = companyId || currentCompanyId;
    const pKey = String(partNo).trim().toUpperCase();
    const compDisabled = disabledPartsByCompany[cid];
    if (compDisabled && compDisabled[pKey] === true) {
      return false; // Disabled (미사용)
    }
    return true; // Enabled (사용)
  }

  function setPartStatus(partNo, isEnabled, companyId) {
    if (!partNo) return;
    const cid = companyId || currentCompanyId;
    const pKey = String(partNo).trim().toUpperCase();
    if (!disabledPartsByCompany[cid]) disabledPartsByCompany[cid] = {};

    if (isEnabled) {
      delete disabledPartsByCompany[cid][pKey];
    } else {
      disabledPartsByCompany[cid][pKey] = true;
    }
    persistPartUsage(cid);
  }

  function togglePartStatus(partNo, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const cur = getCurrentCompany();
    if (cur.role !== "admin") {
      alert("부품 사용여부는 관리자(YSACC) 계정으로 로그인 후 변경할 수 있습니다.");
      return;
    }
    const currentEnabled = isPartEnabled(partNo, cur.id);
    setPartStatus(partNo, !currentEnabled, cur.id);

    if (typeof window.renderPartsDbMasterTable === "function") {
      window.renderPartsDbMasterTable();
    }
    if (typeof window.renderAll === "function") {
      window.renderAll();
    }
  }

  function getPartCompanyStatus(partNo) {
    const pKey = String(partNo || "").trim().toUpperCase();
    const res = {};
    Object.keys(DEFAULT_COMPANIES).forEach(cid => {
      const compDisabled = disabledPartsByCompany[cid];
      res[cid] = !(compDisabled && compDisabled[pKey] === true);
    });
    return res;
  }

  function setPartCompanyStatus(partNo, statusMap) {
    if (!partNo || typeof statusMap !== "object") return;
    const pKey = String(partNo).trim().toUpperCase();
    Object.keys(DEFAULT_COMPANIES).forEach(cid => {
      if (statusMap[cid] !== undefined) {
        if (!disabledPartsByCompany[cid]) disabledPartsByCompany[cid] = {};
        if (statusMap[cid]) {
          delete disabledPartsByCompany[cid][pKey];
        } else {
          disabledPartsByCompany[cid][pKey] = true;
        }
      }
    });
    persistPartUsage();
  }

  // --- SINGLE PART USAGE MODAL ---

  let currentModalPartNo = null;

  function openPartCompanyUsageModal(partNo, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const cur = getCurrentCompany();
    if (cur.role !== "admin") {
      alert("부품 사용여부는 관리자(YSACC) 계정으로 로그인 후 변경할 수 있습니다.");
      return;
    }

    currentModalPartNo = partNo;
    let modal = document.getElementById("partCompanyUsageModal");
    if (!modal) {
      createPartCompanyUsageModalHtml();
      modal = document.getElementById("partCompanyUsageModal");
    }

    const titleEl = document.getElementById("partUsageModalTitle");
    if (titleEl) {
      titleEl.innerHTML = `<i class="fa-solid fa-sliders" style="color: #38bdf8;"></i> 업체별 부품 사용여부: <span style="color:#facc15;">${escapeHtml(partNo)}</span>`;
    }

    const partObj = (window.partsDb || []).find(p => p && p.partNo && p.partNo.trim().toUpperCase() === String(partNo).trim().toUpperCase());
    const infoEl = document.getElementById("partUsageModalInfo");
    if (infoEl && partObj) {
      infoEl.innerHTML = `<b>${escapeHtml(partObj.nameKo || partObj.nameEn || '')}</b> | Spec: ${escapeHtml(partObj.spec || '')} | Cat: ${escapeHtml(partObj.category || '')}`;
    }

    const statusMap = getPartCompanyStatus(partNo);
    const companies = getCompanyList();
    const container = document.getElementById("partUsageModalCheckboxes");
    if (container) {
      container.innerHTML = companies.map(c => {
        const isChecked = statusMap[c.id] !== false;
        return `
          <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border: 1.5px solid ${c.color}; border-radius: 8px; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: ${c.color}; color: #ffffff; font-size: 12px;">
                <i class="fa-solid ${c.icon}"></i>
              </span>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${escapeHtml(c.name)} (${escapeHtml(c.fullName)})</div>
                <div style="font-size: 11px; color: #64748b;">Preset: ${c.presetId} | Currency: ${c.currency}</div>
              </div>
            </div>
            <input type="checkbox" class="part-usage-chk" data-company-id="${c.id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #0284c7;">
          </label>
        `;
      }).join("");
    }

    modal.style.display = "flex";
  }

  function closePartCompanyUsageModal() {
    const modal = document.getElementById("partCompanyUsageModal");
    if (modal) modal.style.display = "none";
    currentModalPartNo = null;
  }

  function savePartCompanyUsageModal() {
    if (!currentModalPartNo) return;
    const checkboxes = document.querySelectorAll(".part-usage-chk");
    const statusMap = {};
    checkboxes.forEach(chk => {
      const cid = chk.getAttribute("data-company-id");
      statusMap[cid] = chk.checked;
    });

    setPartCompanyStatus(currentModalPartNo, statusMap);
    closePartCompanyUsageModal();

    if (typeof window.renderPartsDbMasterTable === "function") {
      window.renderPartsDbMasterTable();
    }
    if (typeof window.renderAll === "function") {
      window.renderAll();
    }
  }

  function createPartCompanyUsageModalHtml() {
    if (document.getElementById("partCompanyUsageModal")) return;

    const modal = document.createElement("div");
    modal.id = "partCompanyUsageModal";
    modal.style.cssText = `
      display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px);
      z-index: 10001; justify-content: center; align-items: center;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 12px; width: 90%; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); overflow: hidden; border: 1.5px solid #cbd5e1;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7;">
          <h3 id="partUsageModalTitle" style="margin: 0; color: #f8fafc; font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            업체별 부품 사용여부 관리
          </h3>
          <button type="button" onclick="window.CompanyAuth.closePartCompanyUsageModal()" style="background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;">
          <div id="partUsageModalInfo" style="font-size: 12px; color: #334155; padding: 8px 12px; background: #e0f2fe; border-radius: 6px; border: 1px solid #bae6fd;"></div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 12px; font-weight: 700; color: #475569;">업체별 사용 여부 체크:</span>
            <div style="display: flex; gap: 6px;">
              <button type="button" onclick="document.querySelectorAll('.part-usage-chk').forEach(c => c.checked = true)" style="font-size: 11px; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; cursor: pointer;">모두 사용</button>
              <button type="button" onclick="document.querySelectorAll('.part-usage-chk').forEach(c => c.checked = false)" style="font-size: 11px; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; cursor: pointer;">모두 미사용</button>
            </div>
          </div>

          <div id="partUsageModalCheckboxes" style="display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto;"></div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
            <button type="button" onclick="window.CompanyAuth.closePartCompanyUsageModal()" 
              style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f1f5f9; color: #475569; font-size: 12.5px; font-weight: 700; cursor: pointer;">
              취소
            </button>
            <button type="button" onclick="window.CompanyAuth.savePartCompanyUsageModal()" 
              style="padding: 8px 18px; border-radius: 6px; border: none; background: #0284c7; color: #ffffff; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-floppy-disk"></i> 저장 적용
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --- FULL MATRIX USAGE MANAGER MODAL ---

  function openCompanyUsageMatrixModal() {
    const cur = getCurrentCompany();
    if (cur.role !== "admin") {
      alert("업체별 부품 사용 매트릭스는 관리자(YSACC) 계정으로 로그인 후 관리할 수 있습니다.");
      return;
    }

    let modal = document.getElementById("companyUsageMatrixModal");
    if (!modal) {
      createCompanyUsageMatrixModalHtml();
      modal = document.getElementById("companyUsageMatrixModal");
    }

    renderMatrixRows();
    modal.style.display = "flex";
  }

  function closeCompanyUsageMatrixModal() {
    const modal = document.getElementById("companyUsageMatrixModal");
    if (modal) modal.style.display = "none";
  }

  function renderMatrixRows() {
    const tbody = document.getElementById("tbodyUsageMatrixList");
    if (!tbody) return;

    const searchInput = document.getElementById("usageMatrixSearch");
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

    const catSelect = document.getElementById("usageMatrixCatFilter");
    const selectedCat = catSelect ? catSelect.value : "";

    const parts = window.partsDb || [];
    const companies = getCompanyList();

    let filtered = parts.filter(p => {
      if (!p || !p.partNo) return false;
      if (selectedCat && p.category !== selectedCat) return false;
      if (query) {
        const match = (p.partNo || '').toLowerCase().includes(query) ||
                      (p.nameKo || '').toLowerCase().includes(query) ||
                      (p.nameEn || '').toLowerCase().includes(query) ||
                      (p.spec || '').toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    });

    tbody.innerHTML = filtered.map(item => {
      const statusMap = getPartCompanyStatus(item.partNo);
      const safePNo = escapeHtml(item.partNo);

      const compCheckboxes = companies.map(c => {
        const isChecked = statusMap[c.id] !== false;
        return `
          <td align="center" style="padding: 6px 4px;">
            <input type="checkbox" class="matrix-usage-chk" 
              data-part-no="${safePNo}" 
              data-company-id="${c.id}" 
              ${isChecked ? 'checked' : ''} 
              onchange="window.CompanyAuth.onMatrixCheckboxChange('${safePNo}', '${c.id}', this.checked)"
              style="width: 17px; height: 17px; cursor: pointer; accent-color: ${c.color};" />
          </td>
        `;
      }).join("");

      return `
        <tr>
          <td style="font-weight: 700; font-family: monospace; color: #0284c7; padding: 6px 10px;">${safePNo}</td>
          <td style="font-size: 11.5px; color: #334155; padding: 6px 10px;">${escapeHtml(item.nameKo || item.nameEn || '')}</td>
          <td style="font-size: 11px; color: #64748b; padding: 6px 10px;">${escapeHtml(item.category || '')}</td>
          ${compCheckboxes}
        </tr>
      `;
    }).join("");

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" align="center" style="padding: 30px; color: #94a3b8;">검색 결과가 없습니다.</td></tr>`;
    }
  }

  function onMatrixCheckboxChange(partNo, companyId, isChecked) {
    setPartStatus(partNo, isChecked, companyId);
  }

  function setAllMatrixForCompany(companyId, enableAll) {
    const parts = window.partsDb || [];
    parts.forEach(p => {
      if (p && p.partNo) {
        setPartStatus(p.partNo, enableAll, companyId);
      }
    });
    renderMatrixRows();
    if (typeof window.renderPartsDbMasterTable === "function") {
      window.renderPartsDbMasterTable();
    }
  }

  function createCompanyUsageMatrixModalHtml() {
    if (document.getElementById("companyUsageMatrixModal")) return;

    const modal = document.createElement("div");
    modal.id = "companyUsageMatrixModal";
    modal.style.cssText = `
      display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px);
      z-index: 10002; justify-content: center; align-items: center;
    `;

    const companies = getCompanyList();
    const thCompanies = companies.map(c => `
      <th width="100" style="text-align: center; background: #0f172a; color: #ffffff; border-bottom: 2px solid ${c.color}; padding: 8px 4px;">
        <div style="font-size: 12px; font-weight: 800;">${c.name}</div>
        <div style="display: flex; justify-content: center; gap: 4px; margin-top: 4px;">
          <button type="button" onclick="window.CompanyAuth.setAllMatrixForCompany('${c.id}', true)" title="모두 사용" style="font-size: 9.5px; padding: 1px 4px; border: none; border-radius: 3px; background: #16a34a; color: #fff; cursor: pointer;">All O</button>
          <button type="button" onclick="window.CompanyAuth.setAllMatrixForCompany('${c.id}', false)" title="모두 미사용" style="font-size: 9.5px; padding: 1px 4px; border: none; border-radius: 3px; background: #dc2626; color: #fff; cursor: pointer;">All X</button>
        </div>
      </th>
    `).join("");

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 12px; width: 95%; max-width: 1000px; height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden; border: 1.5px solid #cbd5e1;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; flex-shrink: 0;">
          <div>
            <h3 style="margin: 0; color: #f8fafc; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-table-list" style="color: #2dd4bf;"></i> 5개사 부품 사용여부 통합 매트릭스 관리 (Company Part Usage Matrix)
            </h3>
            <div style="font-size: 11.5px; color: #94a3b8; margin-top: 3px;">
              관리자가 각 업체별로 부품 사용 가능 여부를 일괄 활성화/비활성화할 수 있습니다.
            </div>
          </div>
          <button type="button" onclick="window.CompanyAuth.closeCompanyUsageMatrixModal()" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Filter Bar -->
        <div style="padding: 10px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; gap: 12px; align-items: center; flex-shrink: 0;">
          <input type="text" id="usageMatrixSearch" placeholder="품번, 품명, 규격 검색..." 
            oninput="window.CompanyAuth.renderMatrixRows()"
            style="width: 250px; height: 34px; padding: 0 10px; border-radius: 6px; border: 1.5px solid #cbd5e1; font-size: 12.5px; outline: none;" />
          <select id="usageMatrixCatFilter" onchange="window.CompanyAuth.renderMatrixRows()" style="height: 34px; padding: 0 10px; border-radius: 6px; border: 1.5px solid #cbd5e1; font-size: 12.5px; font-weight: 700; color: #0284c7; outline: none; background: #fff;">
            <option value="">모든 카테고리 (All Categories)</option>
            <option value="PANEL">PANEL</option>
            <option value="REINFORCING">REINFORCING</option>
            <option value="TIE_ROD">TIE_ROD</option>
            <option value="BOLT_NUT">BOLT_NUT</option>
            <option value="STEEL_SKID">STEEL_SKID</option>
            <option value="OTHER">OTHER</option>
          </select>
          <div style="margin-left: auto; font-size: 12px; color: #64748b;">
            * 체크박스 변경 시 즉시 메모리 및 저장소에 실시간 반영됩니다.
          </div>
        </div>

        <!-- Matrix Table Body -->
        <div style="flex: 1; overflow-y: auto; padding: 0;">
          <table class="bom-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead style="position: sticky; top: 0; z-index: 5;">
              <tr>
                <th width="150" style="text-align: left; background: #0f172a; color: #fff; padding: 10px;">Part No.</th>
                <th style="text-align: left; background: #0f172a; color: #fff; padding: 10px;">Part Name</th>
                <th width="110" style="text-align: left; background: #0f172a; color: #fff; padding: 10px;">Category</th>
                ${thCompanies}
              </tr>
            </thead>
            <tbody id="tbodyUsageMatrixList">
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div style="padding: 12px 20px; background: #f8fafc; border-top: 1.5px solid #e2e8f0; display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-shrink: 0;">
          <button type="button" onclick="window.CompanyAuth.closeCompanyUsageMatrixModal()" 
            style="padding: 8px 20px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer;">
            닫기
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --- CORE AUTH & SETTINGS LOGIC ---

  function getCompany(id) {
    const base = DEFAULT_COMPANIES[id] || DEFAULT_COMPANIES.ysacc;
    const custom = authSettings[id] || {};
    return Object.assign({}, base, custom, { id: base.id, role: base.role });
  }

  function getCurrentCompany() {
    return getCompany(currentCompanyId);
  }

  function getCurrentCompanyId() {
    return currentCompanyId;
  }

  function getCompanyList() {
    return Object.keys(DEFAULT_COMPANIES).map(id => getCompany(id));
  }

  function saveCurrentCompanyPrice(partNo, price) {
    if (!partNo) return;
    const pKey = String(partNo).trim().toUpperCase();
    const pNum = parseFloat(price) || 0;
    if (!priceOverlays[currentCompanyId]) priceOverlays[currentCompanyId] = {};
    priceOverlays[currentCompanyId][pKey] = pNum;
    persistPriceOverlay(currentCompanyId);
  }

  function getCompanyPriceOverlay(companyId) {
    const cid = companyId || currentCompanyId;
    return priceOverlays[cid] || {};
  }

  function captureBaselineDbIfNeeded() {
    if (!baselineDbCatalog && Array.isArray(window.partsDb) && window.partsDb.length > 0) {
      baselineDbCatalog = JSON.parse(JSON.stringify(window.partsDb));
    }
  }

  function applyCompanyPricesToDb(companyId) {
    const cid = companyId || currentCompanyId;
    captureBaselineDbIfNeeded();

    if (!Array.isArray(window.partsDb)) return;

    const overlay = priceOverlays[cid] || {};

    window.partsDb.forEach(item => {
      if (!item || !item.partNo) return;
      const pKey = item.partNo.trim().toUpperCase();
      if (overlay[pKey] !== undefined) {
        item.price = Number(overlay[pKey]);
      } else if (baselineDbCatalog) {
        const baseMatch = baselineDbCatalog.find(b => b && b.partNo && b.partNo.trim().toUpperCase() === pKey);
        if (baseMatch && baseMatch.price !== undefined) {
          item.price = Number(baseMatch.price);
        }
      }
    });

    try {
      localStorage.setItem('custom_parts_db', JSON.stringify(window.partsDb));
      localStorage.setItem('parts_db', JSON.stringify(window.partsDb));
    } catch (e) {}

    if (typeof window.renderPartsDbMasterTable === "function") {
      try { window.renderPartsDbMasterTable(); } catch (e) {}
    }
  }

  function applyCompanySettings(companyId, options = {}) {
    const comp = getCompany(companyId);
    if (!comp) return;

    currentCompanyId = comp.id;
    persistSession();

    // 1. Synchronize Preset ID
    if (comp.presetId) {
      window.selectedCustomerPresetId = comp.presetId;
      window.activeBOMCustomerPresetId = comp.presetId;
      try {
        localStorage.setItem('water_tank_selected_customer_preset_id', comp.presetId);
        localStorage.setItem('water_tank_active_bom_customer_preset_id', comp.presetId);
      } catch (e) {}

      if (typeof window.syncCustomerPresetUI === 'function') {
        try { window.syncCustomerPresetUI(); } catch (e) {}
      }
    }

    // 2. Synchronize Currency
    if (comp.currency) {
      try {
        localStorage.setItem("water_tank_system_currency", comp.currency);
      } catch (e) {}
      if (typeof window.updateSystemCurrencyUI === 'function') {
        try { window.updateSystemCurrencyUI(); } catch (e) {}
      }
    }

    // 3. Synchronize Part Naming
    if (window.PartNaming && typeof window.PartNaming.setActiveParty === 'function') {
      try {
        window.PartNaming.setActiveParty(comp.partyName);
      } catch (e) {}
    }

    // 4. Synchronize Bolt Logic Party
    if (typeof window.selectBoltCompanyParty === 'function') {
      try {
        window.selectBoltCompanyParty(comp.partyName, false);
      } catch (e) {}
    }
    if (typeof window.updateBoltSettingWidget === 'function') {
      try { window.updateBoltSettingWidget(); } catch (e) {}
    }

    // 5. Synchronize Mold Group Manager
    if (window.MoldGroupManager && typeof window.MoldGroupManager.setActiveParty === 'function') {
      try {
        window.MoldGroupManager.setActiveParty(comp.presetId);
      } catch (e) {}
    }

    // 6. Synchronize Insulation Naming
    if (window.InsulationNamingMap && typeof window.InsulationNamingMap.setActiveParty === 'function') {
      try {
        window.InsulationNamingMap.setActiveParty(comp.presetId);
      } catch (e) {}
    }

    // 7. Synchronize Panel Hole Spec
    if (window.PanelHoleSpec && typeof window.PanelHoleSpec.setActiveParty === 'function') {
      try {
        window.PanelHoleSpec.setActiveParty(comp.presetId);
      } catch (e) {}
    }

    // 8. Synchronize Costing Module
    if (typeof window.setActiveCostingPartyId === 'function') {
      try {
        window.setActiveCostingPartyId(comp.presetId);
      } catch (e) {}
    }

    // 8b. Synchronize Steel Skid Company Party Preset
    if (window.RuleEditorUI && typeof window.RuleEditorUI.setActiveSkidCompanyParty === 'function') {
      try {
        window.RuleEditorUI.setActiveSkidCompanyParty(comp.partyName, false);
      } catch (e) {}
    }

    // 9. Apply Company Master DB Prices
    applyCompanyPricesToDb(comp.id);

    // 10. Update Header UI & Branding
    renderHeaderWidget();
    updateHeaderBranding(comp);

    // 11. Recalculate BOM & views if not suppressed
    if (!options.silent) {
      if (typeof window.renderAll === 'function') {
        try { window.renderAll(); } catch (e) {}
      }
      if (typeof window.renderCostingPanelTable === 'function') {
        try { window.renderCostingPanelTable(); } catch (e) {}
      }
    }

    // Notify external listeners
    changeListeners.forEach(fn => {
      try { fn(comp); } catch (e) {}
    });
  }

  function updateHeaderBranding(comp) {
    const nameEl = document.getElementById("headerCompanyNameText");
    if (nameEl) {
      nameEl.textContent = comp.name || "YSACC";
    }
  }

  function login(companyId, password, remember = false) {
    const comp = getCompany(companyId);
    if (!comp) {
      return { success: false, message: "존재하지 않는 업체입니다." };
    }

    const savedPass = (authSettings[companyId] && authSettings[companyId].password) || comp.defaultPassword;
    if (password !== savedPass) {
      return { success: false, message: "비밀번호가 일치하지 않습니다." };
    }

    sessionStorage.setItem(SESSION_LOGGED_IN_KEY, "true");
    sessionStorage.setItem("water_tank_active_company_id", companyId);
    if (remember) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, "true");
    } else {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }

    applyCompanySettings(companyId);
    return { success: true, company: comp };
  }

  function switchCompany(companyId, skipPasswordCheck = false) {
    const cur = getCurrentCompany();
    if (cur.role === "admin" || skipPasswordCheck) {
      sessionStorage.setItem(SESSION_LOGGED_IN_KEY, "true");
      sessionStorage.setItem("water_tank_active_company_id", companyId);
      applyCompanySettings(companyId);
      return { success: true, company: getCompany(companyId) };
    }
    openLoginModal(companyId);
    return { success: false, requiresPassword: true };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_LOGGED_IN_KEY);
    sessionStorage.removeItem("water_tank_active_company_id");
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
    applyCompanySettings("ysacc");
    openLoginModal("ysacc", { isStartup: true });
  }

  function changePassword(companyId, currentPassword, newPassword) {
    const comp = getCompany(companyId);
    if (!comp) return { success: false, message: "업체를 찾을 수 없습니다." };
    const savedPass = (authSettings[companyId] && authSettings[companyId].password) || comp.defaultPassword;
    if (currentPassword !== savedPass) {
      return { success: false, message: "현재 비밀번호가 올바르지 않습니다." };
    }
    if (!newPassword || newPassword.trim().length < 2) {
      return { success: false, message: "새 비밀번호는 2자리 이상이어야 합니다." };
    }

    if (!authSettings[companyId]) authSettings[companyId] = {};
    authSettings[companyId].password = newPassword.trim();
    persistSettings();
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
  }

  function updateCompanyProfile(companyId, updates) {
    if (!authSettings[companyId]) authSettings[companyId] = {};
    Object.assign(authSettings[companyId], updates);
    persistSettings();
    if (companyId === currentCompanyId) {
      applyCompanySettings(companyId);
    }
    return { success: true, company: getCompany(companyId) };
  }

  function onCompanyChanged(fn) {
    if (typeof fn === "function") changeListeners.push(fn);
  }

  // --- UI RENDERING & MODALS ---

  function renderHeaderWidget() {
    const container = document.getElementById("companyAuthHeaderWidget");
    if (!container) return;

    const comp = getCurrentCompany();
    const isAdmin = comp.role === "admin";
    const isLoggedIn = sessionStorage.getItem(SESSION_LOGGED_IN_KEY) === "true" || localStorage.getItem(REMEMBER_LOGIN_KEY) === "true";

    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.7); padding: 4px 10px; border-radius: 8px; border: 1.5px solid ${comp.color}; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: ${comp.color}; color: #ffffff; font-size: 12px; box-shadow: 0 0 10px ${comp.color}88;">
          <i class="fa-solid ${comp.icon}"></i>
        </span>
        <div style="display: flex; flex-direction: column; line-height: 1.15;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="font-size: 12.5px; font-weight: 800; color: #f8fafc; letter-spacing: 0.5px;">
              ${escapeHtml(comp.name)}
            </span>
            ${isAdmin ? '<span style="font-size: 9.5px; background: #e11d48; color: #fff; padding: 1px 5px; border-radius: 4px; font-weight: 800;">ADMIN</span>' : '<span style="font-size: 9.5px; background: #0284c7; color: #fff; padding: 1px 5px; border-radius: 4px; font-weight: 700;">COMPANY</span>'}
          </div>
          <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">
            ${comp.currency} | ${comp.presetId}
          </span>
        </div>
        <button type="button" onclick="window.CompanyAuth.openLoginModal()" 
          title="업체 로그인 / 전환" 
          style="background: #1e293b; color: #38bdf8; border: 1px solid #475569; border-radius: 6px; padding: 5px 9px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; margin-left: 6px; transition: all 0.2s ease;">
          <i class="fa-solid fa-right-left"></i>
          <span>업체 전환</span>
        </button>
        <button type="button" onclick="window.CompanyAuth.logout()" 
          title="로그아웃 및 로그인 화면으로 이동" 
          style="background: #334155; color: #f87171; border: 1px solid #64748b; border-radius: 6px; padding: 5px 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s ease;">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
          <span>로그아웃</span>
        </button>
      </div>
    `;
  }

  function openLoginModal(targetCompanyId, options = {}) {
    let modal = document.getElementById("companyLoginModal");
    if (!modal) {
      createLoginModalHtml();
      modal = document.getElementById("companyLoginModal");
    }
    if (!modal) return;

    const targetCid = targetCompanyId || currentCompanyId || "ysacc";
    const select = document.getElementById("companyLoginSelect");
    if (select) {
      select.value = targetCid;
    }
    selectCompanyCard(targetCid);

    const passInput = document.getElementById("companyLoginPassword");
    if (passInput) {
      passInput.value = "";
      setTimeout(() => { passInput.focus(); }, 100);
    }
    const errorEl = document.getElementById("companyLoginError");
    if (errorEl) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    }

    const rememberChk = document.getElementById("companyLoginRememberChk");
    if (rememberChk) {
      rememberChk.checked = localStorage.getItem(REMEMBER_LOGIN_KEY) === "true";
    }

    modal.style.display = "flex";
  }

  function closeLoginModal() {
    const modal = document.getElementById("companyLoginModal");
    if (modal) modal.style.display = "none";
  }

  function selectCompanyCard(companyId) {
    const select = document.getElementById("companyLoginSelect");
    if (select && select.value !== companyId) {
      select.value = companyId;
    }

    const cards = document.querySelectorAll(".comp-login-card");
    cards.forEach(card => {
      const cid = card.getAttribute("data-cid");
      const comp = DEFAULT_COMPANIES[cid];
      if (cid === companyId) {
        card.style.borderColor = comp ? comp.color : "#0284c7";
        card.style.background = "#f0f9ff";
        card.style.boxShadow = `0 0 0 2px ${comp ? comp.color : '#0284c7'}44, 0 4px 10px rgba(0,0,0,0.08)`;
      } else {
        card.style.borderColor = "#e2e8f0";
        card.style.background = "#ffffff";
        card.style.boxShadow = "none";
      }
    });

    updateLoginCompanyPreview();

    const passInput = document.getElementById("companyLoginPassword");
    if (passInput) {
      passInput.focus();
    }
  }

  function onLoginSelectChange(val) {
    selectCompanyCard(val);
  }

  function fillDefaultPassword() {
    const select = document.getElementById("companyLoginSelect");
    const passInput = document.getElementById("companyLoginPassword");
    if (!select || !passInput) return;
    const cid = select.value;
    const comp = DEFAULT_COMPANIES[cid];
    if (comp) {
      passInput.value = comp.defaultPassword || cid;
      passInput.focus();
    }
  }

  function togglePasswordVisibility() {
    const passInput = document.getElementById("companyLoginPassword");
    const eyeIcon = document.getElementById("loginPwEyeIcon");
    if (!passInput) return;
    if (passInput.type === "password") {
      passInput.type = "text";
      if (eyeIcon) eyeIcon.className = "fa-solid fa-eye-slash";
    } else {
      passInput.type = "password";
      if (eyeIcon) eyeIcon.className = "fa-solid fa-eye";
    }
  }

  function updateLoginCompanyPreview() {
    const select = document.getElementById("companyLoginSelect");
    if (!select) return;
    const cid = select.value;
    const comp = getCompany(cid);
    const previewEl = document.getElementById("companyLoginPreview");
    if (previewEl && comp) {
      const isAdmin = comp.role === "admin";
      previewEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1.5px solid ${comp.color};">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: ${comp.color}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 6px ${comp.color}66;">
            <i class="fa-solid ${comp.icon}"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${escapeHtml(comp.fullName)}</span>
              <span style="font-size: 11px; font-weight: 700; color: #64748b;">(${comp.name})</span>
              ${isAdmin ? '<span style="font-size: 9.5px; background: #e11d48; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 800;">ADMIN</span>' : '<span style="font-size: 9.5px; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 700;">COMPANY</span>'}
            </div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap;">
              <span>통화: <b style="color: #0f172a;">${comp.currency}</b></span>
              <span>스펙 프리셋: <b style="color: #0284c7;">${comp.presetId}</b></span>
              <span>당사 규격명: <b style="color: #0f172a;">${comp.partyName}</b></span>
            </div>
          </div>
        </div>
      `;
    }
  }

  function submitLoginModal() {
    const select = document.getElementById("companyLoginSelect");
    const passInput = document.getElementById("companyLoginPassword");
    const errorEl = document.getElementById("companyLoginError");
    const rememberChk = document.getElementById("companyLoginRememberChk");

    if (!select || !passInput) return;
    const cid = select.value;
    const pass = passInput.value;
    const remember = rememberChk ? rememberChk.checked : false;

    const cur = getCurrentCompany();
    // If currently logged in as YSACC admin, allow immediate switch without re-typing password
    if (cur.role === "admin" && (!pass || pass.trim() === "")) {
      sessionStorage.setItem(SESSION_LOGGED_IN_KEY, "true");
      sessionStorage.setItem("water_tank_active_company_id", cid);
      if (remember) localStorage.setItem(REMEMBER_LOGIN_KEY, "true");
      else localStorage.removeItem(REMEMBER_LOGIN_KEY);
      applyCompanySettings(cid);
      closeLoginModal();
      return;
    }

    const res = login(cid, pass, remember);
    if (res.success) {
      closeLoginModal();
      if (typeof window.showToast === "function") {
        window.showToast(`[${res.company.name}] 작업공간으로 로그인되었습니다.`);
      }
    } else {
      if (errorEl) {
        errorEl.textContent = res.message || "로그인 실패: 비밀번호를 확인해주세요.";
        errorEl.style.display = "block";
      }
    }
  }

  function createLoginModalHtml() {
    if (document.getElementById("companyLoginModal")) return;

    const modal = document.createElement("div");
    modal.id = "companyLoginModal";
    modal.style.cssText = `
      display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.82); backdrop-filter: blur(6px);
      z-index: 10000; justify-content: center; align-items: center;
    `;

    const companies = getCompanyList();
    const optionsHtml = companies.map(c => `
      <option value="${c.id}">${c.name} - ${c.fullName} (${c.currency} / ${c.presetId})</option>
    `).join("");

    const cardsHtml = companies.map(c => `
      <div class="comp-login-card" data-cid="${c.id}" onclick="window.CompanyAuth.selectCompanyCard('${c.id}')"
        style="padding: 10px 6px; border: 1.5px solid #e2e8f0; border-radius: 8px; background: #ffffff; cursor: pointer; text-align: center; transition: all 0.2s ease;">
        <div style="width: 28px; height: 28px; border-radius: 6px; background: ${c.color}; color: #ffffff; margin: 0 auto 5px; display: flex; align-items: center; justify-content: center; font-size: 13px;">
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div style="font-size: 11.5px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</div>
        <div style="font-size: 10px; color: #64748b; font-family: monospace;">${c.currency}</div>
      </div>
    `).join("");

    modal.innerHTML = `
      <div style="background: #ffffff; border-radius: 14px; width: 92%; max-width: 540px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden; border: 1.5px solid #cbd5e1; animation: modalFadeIn 0.2s ease;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; background: rgba(56, 189, 248, 0.15); border: 1.5px solid #38bdf8; color: #38bdf8; font-size: 18px;">
              <i class="fa-solid fa-water"></i>
            </span>
            <div>
              <h3 style="margin: 0; color: #f8fafc; font-size: 16px; font-weight: 800; letter-spacing: 0.3px;">
                GRP WATER TANK BOM SYSTEM
              </h3>
              <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-shield-halved" style="color: #38bdf8;"></i>
                <span>업체 로그인 & 전용 작업공간 (Company Login)</span>
              </div>
            </div>
          </div>
          <button type="button" onclick="window.CompanyAuth.closeLoginModal()" title="닫기" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; background: #ffffff;">
          <!-- Quick Selection Cards -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 7px;">
              <i class="fa-solid fa-building-circle-check" style="color: #0284c7;"></i> 대상 업체 선택 (Click):
            </label>
            <div id="companyLoginCardGrid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
              ${cardsHtml}
            </div>
          </div>

          <!-- Synced Dropdown -->
          <div>
            <select id="companyLoginSelect" onchange="window.CompanyAuth.onLoginSelectChange(this.value)" style="width: 100%; height: 38px; border-radius: 6px; border: 1.5px solid #cbd5e1; padding: 0 10px; font-size: 13px; font-weight: 700; color: #0f172a; outline: none; background: #f8fafc;">
              ${optionsHtml}
            </select>
          </div>

          <!-- Company Details Preview -->
          <div id="companyLoginPreview"></div>

          <!-- Password Field -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
              <label style="font-size: 12px; font-weight: 800; color: #334155;">
                <i class="fa-solid fa-key" style="color: #64748b;"></i> 비밀번호 입력:
              </label>
              <button type="button" onclick="window.CompanyAuth.fillDefaultPassword()" style="background: none; border: none; font-size: 11px; font-weight: 700; color: #0284c7; cursor: pointer; text-decoration: underline;">
                초기 PW 자동입력
              </button>
            </div>
            <div style="position: relative;">
              <input type="password" id="companyLoginPassword" placeholder="업체 비밀번호 입력" 
                onkeydown="if(event.key === 'Enter') window.CompanyAuth.submitLoginModal()"
                style="width: 100%; height: 40px; border-radius: 6px; border: 1.5px solid #cbd5e1; padding: 0 40px 0 12px; font-size: 13.5px; outline: none; box-sizing: border-box;" />
              <button type="button" onclick="window.CompanyAuth.togglePasswordVisibility()" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px;">
                <i id="loginPwEyeIcon" class="fa-solid fa-eye"></i>
              </button>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-circle-info" style="color: #0284c7;"></i>
              <span>초기 비밀번호: <code>ysacc</code>, <code>mnt</code>, <code>almuftah</code>, <code>hayoung</code>, <code>alhilal</code></span>
            </div>
          </div>

          <!-- Options: Remember Login -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; cursor: pointer; user-select: none;">
              <input type="checkbox" id="companyLoginRememberChk" style="width: 16px; height: 16px; accent-color: #0284c7; cursor: pointer;" />
              <span>로그인 상태 유지 (Remember Login)</span>
            </label>
          </div>

          <!-- Error Message Display -->
          <div id="companyLoginError" style="display: none; padding: 8px 12px; background: #fee2e2; border: 1px solid #f87171; border-radius: 6px; color: #b91c1c; font-size: 12px; font-weight: 700;"></div>

          <!-- Actions -->
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            <button type="button" onclick="window.CompanyAuth.closeLoginModal()" 
              style="padding: 9px 18px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-size: 12.5px; font-weight: 700; cursor: pointer;">
              닫기
            </button>
            <button type="button" onclick="window.CompanyAuth.submitLoginModal()" 
              style="padding: 9px 24px; border-radius: 6px; border: none; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; font-size: 13px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 7px; box-shadow: 0 4px 10px rgba(2, 132, 199, 0.3);">
              <i class="fa-solid fa-right-to-bracket"></i> 로그인 및 작업공간 입장
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function renderCompanySettingsTab() {
    const tabEl = document.getElementById("tab-company-settings");
    if (!tabEl) return;

    const cur = getCurrentCompany();
    const companies = getCompanyList();

    let compCardsHtml = companies.map(c => {
      const isCur = c.id === cur.id;
      return `
        <div style="background: ${isCur ? '#f0f9ff' : '#ffffff'}; border: 1.5px solid ${isCur ? c.color : '#e2e8f0'}; border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: ${c.color}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px;">
              <i class="fa-solid ${c.icon}"></i>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${escapeHtml(c.name)}</span>
                <span style="font-size: 12px; color: #64748b;">(${escapeHtml(c.fullName)})</span>
                ${c.role === 'admin' ? '<span style="font-size: 10px; background: #e11d48; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 800;">ADMIN</span>' : ''}
                ${isCur ? '<span style="font-size: 10px; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 800;">CURRENT</span>' : ''}
              </div>
              <div style="font-size: 11.5px; color: #475569; margin-top: 3px;">
                Currency: <b>${c.currency}</b> | Preset: <b>${c.presetId}</b> | Party: <b>${c.partyName}</b>
              </div>
            </div>
          </div>
          <div>
            ${isCur ? `
              <span style="font-size: 12px; font-weight: 700; color: #0284c7;"><i class="fa-solid fa-circle-check"></i> 접속 중</span>
            ` : `
              <button type="button" onclick="window.CompanyAuth.switchCompany('${c.id}')" 
                style="padding: 6px 12px; font-size: 12px; font-weight: 700; background: #ffffff; border: 1.5px solid ${c.color}; color: ${c.color}; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-arrow-right-to-bracket"></i> 이 업체로 전환
              </button>
            `}
          </div>
        </div>
      `;
    }).join("");

    tabEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px; padding:20px;">
        <!-- Header Banner -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-bottom:2px solid #0284c7; padding:16px 20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:800; color:#f8fafc; display:flex; align-items:center; gap:10px;">
              <i class="fa-solid fa-building-user" style="color:#38bdf8;"></i> COMPANY & MULTI-TENANT WORKSPACE SETTINGS
            </h3>
            <div style="font-size:12px; color:#94a3b8; margin-top:4px;">
              업체별 로그인, 독립된 부품 Master DB 가격, 원가/단가, 부품 사용여부, Preset 및 System Settings 격리 관리
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" onclick="window.CompanyAuth.openCompanyUsageMatrixModal()" 
              style="padding:8px 14px; background:#0d9488; color:#fff; border:none; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-table-list"></i> 부품 사용여부 매트릭스
            </button>
            <button type="button" onclick="window.CompanyAuth.openLoginModal()" 
              style="padding:8px 16px; background:#0284c7; color:#fff; border:none; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-right-left"></i> 업체 로그인 / 전환
            </button>
          </div>
        </div>

        <!-- 5 Company Cards Grid -->
        <div style="display:flex; flex-direction:column; gap:10px;">
          <h4 style="margin:0; font-size:14px; font-weight:800; color:#1e293b;">
            <i class="fa-solid fa-list-check" style="color:#0284c7;"></i> 등록된 업체 목록 (5개 사)
          </h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${compCardsHtml}
          </div>
        </div>

        <!-- Current Company Profile & Password Change Form -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <!-- Left: Current Company Profile -->
          <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px;">
            <h4 style="margin:0; font-size:13.5px; font-weight:800; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
              <i class="fa-solid fa-id-card" style="color:#0284c7;"></i> [${escapeHtml(cur.name)}] 업체 프로필 및 통화 설정
            </h4>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">업체 표시명:</label>
              <input type="text" id="compSettingName" value="${escapeHtml(cur.name)}" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; font-weight:700; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">업체 정식 명칭:</label>
              <input type="text" id="compSettingFullName" value="${escapeHtml(cur.fullName)}" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">기본 사용 통화 (Currency):</label>
              <select id="compSettingCurrency" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; font-weight:700; box-sizing:border-box; background:#fff;">
                <option value="USD" ${cur.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="QAR" ${cur.currency === 'QAR' ? 'selected' : ''}>QAR (QR)</option>
                <option value="KRW" ${cur.currency === 'KRW' ? 'selected' : ''}>KRW (₩)</option>
                <option value="SAR" ${cur.currency === 'SAR' ? 'selected' : ''}>SAR (SR)</option>
                <option value="EUR" ${cur.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                <option value="AED" ${cur.currency === 'AED' ? 'selected' : ''}>AED (AED)</option>
                <option value="KWD" ${cur.currency === 'KWD' ? 'selected' : ''}>KWD (KD)</option>
              </select>
            </div>
            <div style="margin-top:auto; padding-top:10px;">
              <button type="button" onclick="window.CompanyAuth.handleSaveProfile()" 
                style="width:100%; padding:9px; background:#0284c7; color:#fff; border:none; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer;">
                <i class="fa-solid fa-floppy-disk"></i> 프로필 및 통화 저장
              </button>
            </div>
          </div>

          <!-- Right: Password Management -->
          <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px;">
            <h4 style="margin:0; font-size:13.5px; font-weight:800; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
              <i class="fa-solid fa-key" style="color:#d97706;"></i> [${escapeHtml(cur.name)}] 비밀번호 변경
            </h4>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">현재 비밀번호:</label>
              <input type="password" id="compPassCurrent" placeholder="현재 비밀번호 입력" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">새 비밀번호:</label>
              <input type="password" id="compPassNew" placeholder="새 비밀번호 입력" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block; font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">새 비밀번호 확인:</label>
              <input type="password" id="compPassConfirm" placeholder="새 비밀번호 다시 입력" style="width:100%; height:34px; border-radius:6px; border:1.5px solid #cbd5e1; padding:0 10px; font-size:13px; box-sizing:border-box;" />
            </div>
            <div style="margin-top:auto; padding-top:10px;">
              <button type="button" onclick="window.CompanyAuth.handleChangePasswordSubmit()" 
                style="width:100%; padding:9px; background:#d97706; color:#fff; border:none; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer;">
                <i class="fa-solid fa-lock"></i> 비밀번호 변경하기
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function handleSaveProfile() {
    const cur = getCurrentCompany();
    const name = document.getElementById("compSettingName")?.value?.trim();
    const fullName = document.getElementById("compSettingFullName")?.value?.trim();
    const currency = document.getElementById("compSettingCurrency")?.value;

    if (!name) {
      alert("업체명을 입력해주세요.");
      return;
    }

    updateCompanyProfile(cur.id, {
      name: name,
      fullName: fullName || name,
      currency: currency || "USD"
    });

    renderHeaderWidget();
    renderCompanySettingsTab();
    alert(`[${name}] 업체 정보가 성공적으로 저장되었습니다!`);
  }

  function handleChangePasswordSubmit() {
    const cur = getCurrentCompany();
    const curPass = document.getElementById("compPassCurrent")?.value;
    const newPass = document.getElementById("compPassNew")?.value;
    const confirmPass = document.getElementById("compPassConfirm")?.value;

    if (!newPass) {
      alert("새 비밀번호를 입력해주세요.");
      return;
    }
    if (newPass !== confirmPass) {
      alert("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const res = changePassword(cur.id, curPass, newPass);
    if (res.success) {
      alert(res.message);
      document.getElementById("compPassCurrent").value = "";
      document.getElementById("compPassNew").value = "";
      document.getElementById("compPassConfirm").value = "";
    } else {
      alert(res.message);
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function init(db) {
    loadLocalSettings();
    if (db) {
      firestoreDb = db;
      // Fetch Firestore auth doc
      db.collection("settings").doc(FIRESTORE_SETTINGS_DOC).get()
        .then(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data && data.authSettings && typeof data.authSettings === "object") {
              authSettings = Object.assign({}, authSettings, data.authSettings);
              localStorage.setItem(AUTH_SETTINGS_KEY, JSON.stringify(authSettings));
              renderHeaderWidget();
              renderCompanySettingsTab();
            }
          }
        })
        .catch(err => console.warn("[CompanyAuth] Firestore fetch warning:", err));

      // Fetch Firestore part usage doc
      db.collection("settings").doc(FIRESTORE_PART_USAGE_DOC).get()
        .then(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data && data.disabledPartsByCompany && typeof data.disabledPartsByCompany === "object") {
              disabledPartsByCompany = Object.assign({}, disabledPartsByCompany, data.disabledPartsByCompany);
              persistPartUsage();
              if (typeof window.renderPartsDbMasterTable === "function") {
                window.renderPartsDbMasterTable();
              }
            }
          }
        })
        .catch(err => console.warn("[CompanyAuth] Firestore part usage fetch error:", err));

      // Fetch price overlays for all 5 companies
      Object.keys(DEFAULT_COMPANIES).forEach(cid => {
        db.collection("settings").doc(`companyPrices_${cid}`).get()
          .then(doc => {
            if (doc.exists) {
              const data = doc.data();
              if (data && data.prices && typeof data.prices === "object") {
                priceOverlays[cid] = Object.assign({}, priceOverlays[cid], data.prices);
                localStorage.setItem(`water_tank_company_prices_${cid}`, JSON.stringify(priceOverlays[cid]));
                if (cid === currentCompanyId) {
                  applyCompanyPricesToDb(cid);
                }
              }
            }
          })
          .catch(() => {});
      });
    }

    // Initial silent application of current company settings
    setTimeout(() => {
      applyCompanySettings(currentCompanyId, { silent: true });
      renderHeaderWidget();
      renderCompanySettingsTab();
    }, 150);
  }

  function checkStartupLogin() {
    createLoginModalHtml();
    const isSessionLoggedIn = sessionStorage.getItem(SESSION_LOGGED_IN_KEY) === "true";
    const isRemembered = localStorage.getItem(REMEMBER_LOGIN_KEY) === "true";
    if (!isSessionLoggedIn && !isRemembered) {
      openLoginModal(currentCompanyId, { isStartup: true });
    }
  }

  // Export to Global
  global.CompanyAuth = {
    init: init,
    checkStartupLogin: checkStartupLogin,
    getCurrentCompany: getCurrentCompany,
    getCurrentCompanyId: getCurrentCompanyId,
    getCompany: getCompany,
    getCompanyList: getCompanyList,
    login: login,
    logout: logout,
    switchCompany: switchCompany,
    changePassword: changePassword,
    updateCompanyProfile: updateCompanyProfile,
    saveCurrentCompanyPrice: saveCurrentCompanyPrice,
    getCompanyPriceOverlay: getCompanyPriceOverlay,
    applyCompanyPricesToDb: applyCompanyPricesToDb,
    applyCompanySettings: applyCompanySettings,
    onCompanyChanged: onCompanyChanged,
    isPartEnabled: isPartEnabled,
    setPartStatus: setPartStatus,
    togglePartStatus: togglePartStatus,
    getPartCompanyStatus: getPartCompanyStatus,
    setPartCompanyStatus: setPartCompanyStatus,
    openPartCompanyUsageModal: openPartCompanyUsageModal,
    closePartCompanyUsageModal: closePartCompanyUsageModal,
    savePartCompanyUsageModal: savePartCompanyUsageModal,
    openCompanyUsageMatrixModal: openCompanyUsageMatrixModal,
    closeCompanyUsageMatrixModal: closeCompanyUsageMatrixModal,
    renderMatrixRows: renderMatrixRows,
    onMatrixCheckboxChange: onMatrixCheckboxChange,
    setAllMatrixForCompany: setAllMatrixForCompany,
    openLoginModal: openLoginModal,
    closeLoginModal: closeLoginModal,
    selectCompanyCard: selectCompanyCard,
    onLoginSelectChange: onLoginSelectChange,
    fillDefaultPassword: fillDefaultPassword,
    togglePasswordVisibility: togglePasswordVisibility,
    updateLoginCompanyPreview: updateLoginCompanyPreview,
    submitLoginModal: submitLoginModal,
    renderHeaderWidget: renderHeaderWidget,
    renderCompanySettingsTab: renderCompanySettingsTab,
    handleSaveProfile: handleSaveProfile,
    handleChangePasswordSubmit: handleChangePasswordSubmit
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(checkStartupLogin, 60);
      });
    } else {
      setTimeout(checkStartupLogin, 60);
    }
  }

})(typeof window !== "undefined" ? window : global);
