/**
 * client_installer_db.js - Client DB & Installer DB Management Module
 */

(function() {
  const CLIENTS_STORAGE_KEY = 'YSACC_CLIENTS_DB_V1';
  const INSTALLERS_STORAGE_KEY = 'YSACC_INSTALLERS_DB_V1';

  const DEFAULT_CLIENTS = [
    { id: 'CLI-001', name: 'MEP', tel: '+966-11-234-5678', email: 'info@meptrading.com', contact: 'Mohammed Ali', address: 'Riyadh, KSA', notes: 'Primary Client' },
    { id: 'CLI-002', name: 'Al-Muhaidib National Tanks', tel: '+966-12-654-3210', email: 'contact@muhaidib.com', contact: 'Ahmed Al-Harbi', address: 'Jeddah, KSA', notes: 'VIP Client' }
  ];

  const DEFAULT_INSTALLERS = [
    { id: 'INS-001', name: 'YSACC Contracting', mob: '+966-50-123-4567', deliveredTo: 'A Location', recipient: 'Eng. Tariq', address: 'Riyadh Site 1', notes: 'Main Installer' },
    { id: 'INS-002', name: 'Gulf Tank Installation', mob: '+966-55-987-6543', deliveredTo: 'Dammam Port Site', recipient: 'Eng. Hassan', address: 'Dammam Site 2', notes: 'Subcontractor' }
  ];

  // Helper getters & setters
  window.getClientDB = function() {
    try {
      const stored = localStorage.getItem(CLIENTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_CLIENTS;
    } catch (e) {
      return DEFAULT_CLIENTS;
    }
  };

  window.saveClientDB = function(data) {
    try {
      localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(data));
      window.updateClientDatalist();
    } catch (e) {
      console.error("Error saving Client DB:", e);
    }
  };

  window.getInstallerDB = function() {
    try {
      const stored = localStorage.getItem(INSTALLERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_INSTALLERS;
    } catch (e) {
      return DEFAULT_INSTALLERS;
    }
  };

  window.saveInstallerDB = function(data) {
    try {
      localStorage.setItem(INSTALLERS_STORAGE_KEY, JSON.stringify(data));
      window.updateInstallerDatalist();
    } catch (e) {
      console.error("Error saving Installer DB:", e);
    }
  };

  // Update HTML datalists for auto-suggest
  window.updateClientDatalist = function() {
    const listEl = document.getElementById('clientDatalist');
    if (!listEl) return;
    const clients = window.getClientDB();
    listEl.innerHTML = clients.map(c => `<option value="${escapeHtml(c.name)}">${c.tel ? '(' + escapeHtml(c.tel) + ')' : ''}</option>`).join('');
  };

  window.updateInstallerDatalist = function() {
    const listEl = document.getElementById('installerDatalist');
    if (!listEl) return;
    const installers = window.getInstallerDB();
    listEl.innerHTML = installers.map(i => `<option value="${escapeHtml(i.name)}">${i.deliveredTo ? '[' + escapeHtml(i.deliveredTo) + ']' : ''}</option>`).join('');
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Client Modal Management ---
  window.openClientDbModal = function() {
    const modal = document.getElementById('clientDbModal');
    if (modal) {
      modal.style.display = 'block';
      window.renderClientTable();
    }
  };

  window.closeClientDbModal = function() {
    const modal = document.getElementById('clientDbModal');
    if (modal) modal.style.display = 'none';
  };

  window.renderClientTable = function(filterTxt = '') {
    const tbody = document.getElementById('clientTableBody');
    if (!tbody) return;

    let clients = window.getClientDB();
    if (filterTxt) {
      const q = filterTxt.toLowerCase();
      clients = clients.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.tel && c.tel.toLowerCase().includes(q)) ||
        (c.contact && c.contact.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    }

    if (clients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">No Clients Registered. Click "Add Client" to create one.</td></tr>`;
      return;
    }

    tbody.innerHTML = clients.map(c => `
      <tr>
        <td style="font-weight: 700; color: #0284c7;">${escapeHtml(c.id)}</td>
        <td style="font-weight: 700; color: #1e293b;">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.contact || '-')}</td>
        <td>${escapeHtml(c.tel || '-')}</td>
        <td>${escapeHtml(c.email || '-')}</td>
        <td>${escapeHtml(c.address || '-')}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-sm" onclick="selectClientToForm('${escapeHtml(c.id)}')" style="background: #0284c7; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px; margin-right: 4px;">Select</button>
          <button type="button" class="btn btn-sm" onclick="editClient('${escapeHtml(c.id)}')" style="background: #eab308; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px; margin-right: 4px;">Edit</button>
          <button type="button" class="btn btn-sm" onclick="deleteClient('${escapeHtml(c.id)}')" style="background: #ef4444; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px;">Delete</button>
        </td>
      </tr>
    `).join('');
  };

  window.selectClientToForm = function(id) {
    const clients = window.getClientDB();
    const c = clients.find(item => item.id === id);
    if (!c) return;

    const customerInput = document.getElementById('customerName');
    const telInput = document.getElementById('clientTel');

    if (customerInput) customerInput.value = c.name || '';
    if (telInput) telInput.value = c.tel || '';

    if (typeof saveCurrentState === 'function') saveCurrentState();
    window.closeClientDbModal();
  };

  window.saveClientForm = function() {
    const idInput = document.getElementById('clientFormId');
    const nameInput = document.getElementById('clientFormName');
    const telInput = document.getElementById('clientFormTel');
    const emailInput = document.getElementById('clientFormEmail');
    const contactInput = document.getElementById('clientFormContact');
    const addressInput = document.getElementById('clientFormAddress');
    const notesInput = document.getElementById('clientFormNotes');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      alert("Client Name is required.");
      return;
    }

    const clients = window.getClientDB();
    let id = idInput ? idInput.value : '';

    if (id) {
      // Edit existing
      const idx = clients.findIndex(c => c.id === id);
      if (idx !== -1) {
        clients[idx] = {
          id,
          name,
          tel: telInput ? telInput.value.trim() : '',
          email: emailInput ? emailInput.value.trim() : '',
          contact: contactInput ? contactInput.value.trim() : '',
          address: addressInput ? addressInput.value.trim() : '',
          notes: notesInput ? notesInput.value.trim() : ''
        };
      }
    } else {
      // Add new
      id = 'CLI-' + String(Date.now()).slice(-4);
      clients.push({
        id,
        name,
        tel: telInput ? telInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        contact: contactInput ? contactInput.value.trim() : '',
        address: addressInput ? addressInput.value.trim() : '',
        notes: notesInput ? notesInput.value.trim() : ''
      });
    }

    window.saveClientDB(clients);
    window.resetClientForm();
    window.renderClientTable();
  };

  window.editClient = function(id) {
    const clients = window.getClientDB();
    const c = clients.find(item => item.id === id);
    if (!c) return;

    if (document.getElementById('clientFormId')) document.getElementById('clientFormId').value = c.id;
    if (document.getElementById('clientFormName')) document.getElementById('clientFormName').value = c.name || '';
    if (document.getElementById('clientFormTel')) document.getElementById('clientFormTel').value = c.tel || '';
    if (document.getElementById('clientFormEmail')) document.getElementById('clientFormEmail').value = c.email || '';
    if (document.getElementById('clientFormContact')) document.getElementById('clientFormContact').value = c.contact || '';
    if (document.getElementById('clientFormAddress')) document.getElementById('clientFormAddress').value = c.address || '';
    if (document.getElementById('clientFormNotes')) document.getElementById('clientFormNotes').value = c.notes || '';

    const btnSubmit = document.getElementById('btnSaveClient');
    if (btnSubmit) btnSubmit.textContent = 'Update Client';
  };

  window.deleteClient = function(id) {
    if (!confirm("Are you sure you want to delete this Client?")) return;
    let clients = window.getClientDB();
    clients = clients.filter(c => c.id !== id);
    window.saveClientDB(clients);
    window.renderClientTable();
  };

  window.resetClientForm = function() {
    if (document.getElementById('clientFormId')) document.getElementById('clientFormId').value = '';
    if (document.getElementById('clientFormName')) document.getElementById('clientFormName').value = '';
    if (document.getElementById('clientFormTel')) document.getElementById('clientFormTel').value = '';
    if (document.getElementById('clientFormEmail')) document.getElementById('clientFormEmail').value = '';
    if (document.getElementById('clientFormContact')) document.getElementById('clientFormContact').value = '';
    if (document.getElementById('clientFormAddress')) document.getElementById('clientFormAddress').value = '';
    if (document.getElementById('clientFormNotes')) document.getElementById('clientFormNotes').value = '';

    const btnSubmit = document.getElementById('btnSaveClient');
    if (btnSubmit) btnSubmit.textContent = 'Save Client';
  };


  // --- Installer Modal Management ---
  window.openInstallerDbModal = function() {
    const modal = document.getElementById('installerDbModal');
    if (modal) {
      modal.style.display = 'block';
      window.renderInstallerTable();
    }
  };

  window.closeInstallerDbModal = function() {
    const modal = document.getElementById('installerDbModal');
    if (modal) modal.style.display = 'none';
  };

  window.renderInstallerTable = function(filterTxt = '') {
    const tbody = document.getElementById('installerTableBody');
    if (!tbody) return;

    let installers = window.getInstallerDB();
    if (filterTxt) {
      const q = filterTxt.toLowerCase();
      installers = installers.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.mob && i.mob.toLowerCase().includes(q)) ||
        (i.deliveredTo && i.deliveredTo.toLowerCase().includes(q)) ||
        (i.recipient && i.recipient.toLowerCase().includes(q))
      );
    }

    if (installers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">No Installers Registered. Click "Add Installer" to create one.</td></tr>`;
      return;
    }

    tbody.innerHTML = installers.map(i => `
      <tr>
        <td style="font-weight: 700; color: #0284c7;">${escapeHtml(i.id)}</td>
        <td style="font-weight: 700; color: #1e293b;">${escapeHtml(i.name)}</td>
        <td>${escapeHtml(i.mob || '-')}</td>
        <td>${escapeHtml(i.deliveredTo || '-')}</td>
        <td>${escapeHtml(i.recipient || '-')}</td>
        <td>${escapeHtml(i.address || '-')}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-sm" onclick="selectInstallerToForm('${escapeHtml(i.id)}')" style="background: #0284c7; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px; margin-right: 4px;">Select</button>
          <button type="button" class="btn btn-sm" onclick="editInstaller('${escapeHtml(i.id)}')" style="background: #eab308; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px; margin-right: 4px;">Edit</button>
          <button type="button" class="btn btn-sm" onclick="deleteInstaller('${escapeHtml(i.id)}')" style="background: #ef4444; color: #ffffff; font-weight: 700; padding: 3px 8px; font-size: 11px;">Delete</button>
        </td>
      </tr>
    `).join('');
  };

  window.selectInstallerToForm = function(id) {
    const installers = window.getInstallerDB();
    const i = installers.find(item => item.id === id);
    if (!i) return;

    const delivInput = document.getElementById('deliveredTo');
    const recipientInput = document.getElementById('recipient');
    const mobInput = document.getElementById('installerMob');

    if (delivInput && i.deliveredTo) delivInput.value = i.deliveredTo;
    if (recipientInput && i.recipient) recipientInput.value = i.recipient;
    if (mobInput && i.mob) mobInput.value = i.mob;

    if (typeof saveCurrentState === 'function') saveCurrentState();
    window.closeInstallerDbModal();
  };

  window.saveInstallerForm = function() {
    const idInput = document.getElementById('installerFormId');
    const nameInput = document.getElementById('installerFormName');
    const mobInput = document.getElementById('installerFormMob');
    const delivInput = document.getElementById('installerFormDeliveredTo');
    const recipientInput = document.getElementById('installerFormRecipient');
    const addressInput = document.getElementById('installerFormAddress');
    const notesInput = document.getElementById('installerFormNotes');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      alert("Installer / Company Name is required.");
      return;
    }

    const installers = window.getInstallerDB();
    let id = idInput ? idInput.value : '';

    if (id) {
      // Edit existing
      const idx = installers.findIndex(i => i.id === id);
      if (idx !== -1) {
        installers[idx] = {
          id,
          name,
          mob: mobInput ? mobInput.value.trim() : '',
          deliveredTo: delivInput ? delivInput.value.trim() : '',
          recipient: recipientInput ? recipientInput.value.trim() : '',
          address: addressInput ? addressInput.value.trim() : '',
          notes: notesInput ? notesInput.value.trim() : ''
        };
      }
    } else {
      // Add new
      id = 'INS-' + String(Date.now()).slice(-4);
      installers.push({
        id,
        name,
        mob: mobInput ? mobInput.value.trim() : '',
        deliveredTo: delivInput ? delivInput.value.trim() : '',
        recipient: recipientInput ? recipientInput.value.trim() : '',
        address: addressInput ? addressInput.value.trim() : '',
        notes: notesInput ? notesInput.value.trim() : ''
      });
    }

    window.saveInstallerDB(installers);
    window.resetInstallerForm();
    window.renderInstallerTable();
  };

  window.editInstaller = function(id) {
    const installers = window.getInstallerDB();
    const i = installers.find(item => item.id === id);
    if (!i) return;

    if (document.getElementById('installerFormId')) document.getElementById('installerFormId').value = i.id;
    if (document.getElementById('installerFormName')) document.getElementById('installerFormName').value = i.name || '';
    if (document.getElementById('installerFormMob')) document.getElementById('installerFormMob').value = i.mob || '';
    if (document.getElementById('installerFormDeliveredTo')) document.getElementById('installerFormDeliveredTo').value = i.deliveredTo || '';
    if (document.getElementById('installerFormRecipient')) document.getElementById('installerFormRecipient').value = i.recipient || '';
    if (document.getElementById('installerFormAddress')) document.getElementById('installerFormAddress').value = i.address || '';
    if (document.getElementById('installerFormNotes')) document.getElementById('installerFormNotes').value = i.notes || '';

    const btnSubmit = document.getElementById('btnSaveInstaller');
    if (btnSubmit) btnSubmit.textContent = 'Update Installer';
  };

  window.deleteInstaller = function(id) {
    if (!confirm("Are you sure you want to delete this Installer?")) return;
    let installers = window.getInstallerDB();
    installers = installers.filter(i => i.id !== id);
    window.saveInstallerDB(installers);
    window.renderInstallerTable();
  };

  window.resetInstallerForm = function() {
    if (document.getElementById('installerFormId')) document.getElementById('installerFormId').value = '';
    if (document.getElementById('installerFormName')) document.getElementById('installerFormName').value = '';
    if (document.getElementById('installerFormMob')) document.getElementById('installerFormMob').value = '';
    if (document.getElementById('installerFormDeliveredTo')) document.getElementById('installerFormDeliveredTo').value = '';
    if (document.getElementById('installerFormRecipient')) document.getElementById('installerFormRecipient').value = '';
    if (document.getElementById('installerFormAddress')) document.getElementById('installerFormAddress').value = '';
    if (document.getElementById('installerFormNotes')) document.getElementById('installerFormNotes').value = '';

    const btnSubmit = document.getElementById('btnSaveInstaller');
    if (btnSubmit) btnSubmit.textContent = 'Save Installer';
  };

  // Initialize on load
  document.addEventListener('DOMContentLoaded', () => {
    window.updateClientDatalist();
    window.updateInstallerDatalist();

    // Auto fill on customerName change if matched
    const custInput = document.getElementById('customerName');
    if (custInput) {
      custInput.addEventListener('change', () => {
        const val = custInput.value.trim();
        const clients = window.getClientDB();
        const found = clients.find(c => c.name.toLowerCase() === val.toLowerCase());
        if (found && found.tel) {
          const telInput = document.getElementById('clientTel');
          if (telInput) telInput.value = found.tel;
        }
      });
    }

    // Auto fill on deliveredTo change if matched
    const delivInput = document.getElementById('deliveredTo');
    if (delivInput) {
      delivInput.addEventListener('change', () => {
        const val = delivInput.value.trim();
        const installers = window.getInstallerDB();
        const found = installers.find(i => i.name.toLowerCase() === val.toLowerCase() || (i.deliveredTo && i.deliveredTo.toLowerCase() === val.toLowerCase()));
        if (found) {
          if (found.recipient && document.getElementById('recipient')) document.getElementById('recipient').value = found.recipient;
          if (found.mob && document.getElementById('installerMob')) document.getElementById('installerMob').value = found.mob;
        }
      });
    }
  });

})();
