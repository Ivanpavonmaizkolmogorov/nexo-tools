import { Cliente } from './models/Cliente.js';
import { Nodo } from './models/Nodo.js';
import { Storage } from './storage/Storage.js';

/**
 * NexoApp — Controlador principal.
 * Gestiona vistas, canvas Drawflow, wizard guiado, y PDF.
 */
class NexoApp {
  constructor() {
    this.editor = null;
    this.cliente = null;
    this.auditoria = null;
    this.selectedNodeId = null;
    this.nodoMap = new Map();
    this.costeRevealed = false;
    this.afterMode = false;
    this._wizardMode = false;
    this._wizard = null;
    this._pendingDrop = null;
  }

  init() {
    this.renderHome();
    this.setupDragAndDrop();
  }

  // =========================================
  // VISTAS
  // =========================================
  showHome() {
    document.getElementById('home').style.display = 'flex';
    document.getElementById('canvasView').style.display = 'none';
    this.renderHome();
  }

  showCanvas() {
    document.getElementById('home').style.display = 'none';
    document.getElementById('canvasView').style.display = 'grid';
    this.initDrawflow();
    this._loadGeneralSetup();
  }

  goHome() {
    this.guardar();
    this.showHome();
  }

  // =========================================
  // HOME
  // =========================================
  renderHome() {
    const clientes = Storage.getClientes();
    const list = document.getElementById('clientList');

    if (clientes.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text2);">
          <div style="font-size:48px; margin-bottom:12px;">📋</div>
          <p>Aún no hay clientes.</p>
          <p style="font-size:12px; margin-top:6px;">Crea uno para empezar tu primera auditoría.</p>
        </div>`;
      return;
    }

    list.innerHTML = clientes.map(c => {
      const lastAudit = c.ultimaAuditoria;
      const fecha = lastAudit ? new Date(lastAudit.fecha).toLocaleDateString('es-ES') : '';
      const nAudit = c.totalAuditorias;
      const initial = c.nombre.charAt(0).toUpperCase();
      return `
        <div class="client-card" onclick="app.openClient('${c.id}')">
          <div class="avatar">${initial}</div>
          <div class="info">
            <div class="name">${c.nombre}</div>
            <div class="meta">${c.contacto || 'Sin contacto'} · ${fecha}</div>
          </div>
          <div class="badge">${nAudit} audit${nAudit !== 1 ? 's' : ''}</div>
          <button class="btn danger" style="padding:4px 8px; font-size:11px;" onclick="event.stopPropagation(); app.deleteClient('${c.id}')">🗑️</button>
        </div>`;
    }).join('');
  }

  showNewClientForm() {
    document.getElementById('newClientForm').style.display = 'block';
    document.getElementById('newClientName').focus();
  }

  hideNewClientForm() {
    document.getElementById('newClientForm').style.display = 'none';
    document.getElementById('newClientName').value = '';
    document.getElementById('newClientContact').value = '';
  }

  createClient() {
    const nombre = document.getElementById('newClientName').value.trim();
    if (!nombre) { alert('Pon un nombre'); return; }
    const contacto = document.getElementById('newClientContact').value.trim();
    this.cliente = new Cliente(nombre, contacto);
    this.auditoria = this.cliente.nuevaAuditoria();
    Storage.guardarCliente(this.cliente);
    this.hideNewClientForm();
    this.showCanvas();
  }

  openClient(clienteId) {
    this.cliente = Storage.getClienteById(clienteId);
    if (!this.cliente) return;
    this.auditoria = this.cliente.ultimaAuditoria || this.cliente.nuevaAuditoria();
    this.showCanvas();
  }

  deleteClient(id) {
    if (!confirm('¿Borrar este cliente y todas sus auditorías?')) return;
    Storage.eliminarCliente(id);
    this.renderHome();
  }

  // =========================================
  // DRAWFLOW
  // =========================================
  initDrawflow() {
    const container = document.getElementById('drawflow');
    container.innerHTML = '';

    this.editor = new Drawflow(container);
    this.editor.reroute = true;
    this.editor.curvature = 0.5;
    this.editor.start();

    if (this.auditoria.canvasData) {
      try {
        this.editor.import(this.auditoria.canvasData);
      } catch (e) { console.error('Error restaurando canvas:', e); }
    }

    this.editor.on('nodeSelected', (id) => this.onNodeSelected(id));
    this.editor.on('nodeUnselected', () => this.closePanel());
    this.editor.on('nodeRemoved', (id) => this.onNodeRemoved(id));
    this.editor.on('nodeMoved', () => this.autoSaveCanvas());

    // Fix: tap directo en nodos (Drawflow falla en táctil)
    container.addEventListener('click', (e) => {
      const nodeEl = e.target.closest('.drawflow-node');
      if (!nodeEl) return;
      const nodeId = parseInt(nodeEl.id.replace('node-', ''));
      if (nodeId && this.nodoMap.has(nodeId)) {
        this.onNodeSelected(nodeId);
      }
    });

    document.getElementById('topClientName').value = this.cliente.nombre;

    this.nodoMap = new Map();
    if (this.auditoria.nodos.length > 0 && this.auditoria.canvasData) {
      this.rebuildNodoMap();
    }
    this.updateIndicators();
  }

  rebuildNodoMap() {
    this.nodoMap.clear();
    if (!this.auditoria.canvasData?.drawflow) return;
    const moduleData = this.auditoria.canvasData.drawflow.Home?.data || {};
    for (const [drawflowId, nodeData] of Object.entries(moduleData)) {
      const nodoId = nodeData.data?.nodoId;
      if (nodoId) {
        const nodo = this.auditoria.getNodo(nodoId);
        if (nodo) this.nodoMap.set(parseInt(drawflowId), nodo);
      }
    }
  }

  // =========================================
  // DRAG & DROP (libre, sin wizard)
  // =========================================
  setupDragAndDrop() {
    document.addEventListener('dragstart', (e) => {
      const dn = e.target.closest('.drag-node');
      if (dn) e.dataTransfer.setData('nodeType', dn.dataset.type);
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('nodeType');
      if (!type || !this.editor) return;
      const rect = document.getElementById('drawflow').getBoundingClientRect();
      const x = (e.clientX - rect.left) / (this.editor.zoom || 1);
      const y = (e.clientY - rect.top) / (this.editor.zoom || 1);
      this.addNodeAtPosition(type, x, y);
    });

    document.addEventListener('dragover', (e) => {
      if (e.target.closest('.canvas-area')) e.preventDefault();
    });

    // Touch
    let touchType = null;
    document.addEventListener('touchstart', (e) => {
      const dn = e.target.closest('.drag-node');
      if (dn) touchType = dn.dataset.type;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!touchType || !this.editor) return;
      const touch = e.changedTouches[0];
      const rect = document.getElementById('drawflow').getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        const x = (touch.clientX - rect.left) / (this.editor.zoom || 1);
        const y = (touch.clientY - rect.top) / (this.editor.zoom || 1);
        this.addNodeAtPosition(touchType, x, y);
      }
      touchType = null;
    }, { passive: true });
  }

  addNodeAtPosition(type, x, y) {
    if (type === 'manual') {
      const id = this._createNode(type, x, y, '🔴', 'Paso Manual');
      this.onNodeSelected(id);
      return;
    }
    this._pendingDrop = { type, x, y };
    this.showNodeSelector(type);
  }

  // =========================================
  // SELECTOR DE NODO (modal con iconos)
  // =========================================
  showNodeSelector(type) {
    const presets = type === 'trigger' ? [
      { icon: '📧', label: 'Llega email' },
      { icon: '📞', label: 'Llamada / Pedido' },
      { icon: '📅', label: 'Cada día/semana/mes' },
      { icon: '🧾', label: 'Llega factura' },
      { icon: '📦', label: 'Llega mercancía' },
      { icon: '🛒', label: 'Venta en tienda' },
      { icon: '📋', label: 'Nuevo alta / registro' },
      { icon: '📄', label: 'Llega albarán' },
      { icon: '🔔', label: 'Notificación del banco' },
      { icon: '📲', label: 'Mensaje de WhatsApp' },
      { icon: '🗓️', label: 'Fin de mes / trimestre' },
      { icon: '🚚', label: 'Entrega realizada' },
      { icon: '🧑‍💼', label: 'Solicitud del cliente' },
      { icon: '📥', label: 'Documento recibido' },
    ] : [
      { icon: '📧', label: 'Gmail / Email' },
      { icon: '📊', label: 'Excel' },
      { icon: '💬', label: 'WhatsApp' },
      { icon: '🧾', label: 'Factusol' },
      { icon: '💳', label: 'TPV / Datáfono' },
      { icon: '🏦', label: 'Banco online' },
      { icon: '📁', label: 'Google Drive' },
      { icon: '📝', label: 'Word / Docs' },
      { icon: '🖥️', label: 'Programa propio' },
      { icon: '📑', label: 'A3 / Sage' },
      { icon: '🗂️', label: 'CRM' },
      { icon: '📒', label: 'Libreta / Papel' },
      { icon: '🖨️', label: 'Impresora / Escáner' },
      { icon: '📱', label: 'App móvil' },
      { icon: '🌐', label: 'Página web' },
      { icon: '🛒', label: 'Tienda online' },
      { icon: '📦', label: 'Almacén / Stock' },
      { icon: '👥', label: 'Gestoría' },
      { icon: '🏢', label: 'ERP' },
      { icon: '📐', label: 'Presupuestos' },
      { icon: '🗄️', label: 'Archivo físico' },
      { icon: '💻', label: 'Portal del proveedor' },
      { icon: '📊', label: 'Power BI / Informes' },
      { icon: '🔗', label: 'Plataforma pública' },
    ];

    this._currentPresets = presets;

    const modal = document.getElementById('nodeSelector');
    const grid = document.getElementById('nodeSelectorGrid');
    const search = document.getElementById('nodeSelectorSearch');
    document.getElementById('nodeSelectorTitle').textContent =
      type === 'trigger' ? '¿Qué inicia el proceso?' : '¿Qué herramienta usan?';

    search.value = '';
    this._renderPresetGrid(presets);

    document.getElementById('customNodeInput').style.display = 'none';
    document.getElementById('customNodeName').value = '';
    modal.style.display = 'flex';
    search.focus();

    search.oninput = () => {
      const q = search.value.toLowerCase();
      const filtered = presets.filter(p => p.label.toLowerCase().includes(q));
      this._renderPresetGrid(filtered);
    };

    grid.onclick = (e) => {
      const btn = e.target.closest('.preset-btn');
      if (!btn) return;
      if (btn.id === 'presetCustomBtn') {
        document.getElementById('customNodeInput').style.display = 'flex';
        document.getElementById('customNodeName').focus();
        return;
      }
      this.confirmNodeSelection(btn.dataset.icon, btn.dataset.label);
    };
  }

  _renderPresetGrid(presets) {
    const grid = document.getElementById('nodeSelectorGrid');
    grid.innerHTML = presets.map(p =>
      `<div class="preset-btn" data-icon="${p.icon}" data-label="${p.label}">
        <span class="preset-icon">${p.icon}</span>
        <span class="preset-label">${p.label}</span>
      </div>`
    ).join('') + `
      <div class="preset-btn preset-custom" id="presetCustomBtn">
        <span class="preset-icon">✏️</span>
        <span class="preset-label">Otro...</span>
      </div>`;
  }

  confirmNodeSelection(icon, label) {
    document.getElementById('nodeSelector').style.display = 'none';
    if (!this._pendingDrop) return;
    const { type, x, y } = this._pendingDrop;
    this._pendingDrop = null;
    const drawflowId = this._createNode(type, x, y, icon, label);

    if (this._wizardMode && this._wizard) {
      this._wizCrumb(icon + ' ' + label);
      this._wizardAfterNodeCreated(drawflowId, type);
    }
  }

  confirmCustomNode() {
    const name = document.getElementById('customNodeName').value.trim();
    if (!name) return;
    this.confirmNodeSelection('📌', name);
  }

  cancelNodeSelector() {
    document.getElementById('nodeSelector').style.display = 'none';
    this._pendingDrop = null;
    if (this._wizardMode) {
      this._wizardMode = false;
      this._wizard = null;
    }
  }

  _createNode(type, x, y, icon, nombre) {
    const nodo = new Nodo(type, nombre);
    this.auditoria.addNodo(nodo);

    const cssClasses = { trigger: 'trigger-node', app: 'app-node', manual: 'manual-node', digital: 'digital-node' };
    const html = `
      <div class="drawflow_content_node">
        <div class="node-icon">${icon}</div>
        <div>
          <div class="node-label" data-nodo-id="${nodo.id}">${nombre}</div>
          <div class="node-sub" data-nodo-sub="${nodo.id}"></div>
        </div>
        <button class="node-delete" onclick="event.stopPropagation(); app.deleteNode('${nodo.id}')" title="Eliminar">&times;</button>
      </div>`;

    const drawflowId = this.editor.addNode(
      type, 2, 2, x, y, cssClasses[type], { nodoId: nodo.id }, html
    );

    this.nodoMap.set(drawflowId, nodo);
    this.updateIndicators();
    return drawflowId;
  }

  // =========================================
  // WIZARD — Flujo guiado (canal → sub-flow → bridge)
  // =========================================
  startWizard() {
    let startX = 300;
    if (this.editor) {
      const exported = this.editor.export();
      const nodes = exported?.drawflow?.Home?.data || {};
      for (const n of Object.values(nodes)) {
        const right = (n.pos_x || 0) + 200;
        if (right > startX) startX = right;
      }
      if (Object.keys(nodes).length > 0) startX += 100;
    }
    this._wizard = { lastDrawflowId: null, nodeX: startX, nodeY: 60, state: null, crumbs: [] };
    this._wizardMode = true;
    this._wizardHistory = [];
    this._pendingDrop = { type: 'trigger', x: startX, y: 60 };
    this.showNodeSelector('trigger');
  }

  _wizPush(reshowFn) {
    if (this._skipPush) { this._skipPush = false; return; }
    this._wizardHistory.push({
      lastDrawflowId: this._wizard.lastDrawflowId,
      nodeX: this._wizard.nodeX,
      nodeY: this._wizard.nodeY,
      state: this._wizard.state,
      crumbs: [...this._wizard.crumbs],
      existingNodeIds: new Set(this.nodoMap.keys()),
      reshowFn
    });
  }

  wizardBack() {
    document.getElementById('wizardPrompt').style.display = 'none';
    if (!this._wizardHistory?.length) return;
    const prev = this._wizardHistory.pop();
    for (const [id, nodo] of [...this.nodoMap]) {
      if (!prev.existingNodeIds.has(id)) {
        try { this.editor.removeNodeId('node-' + id); } catch(e) {}
        this.auditoria.removeNodo(nodo.id);
        this.nodoMap.delete(id);
      }
    }
    this._wizard = { lastDrawflowId: prev.lastDrawflowId, nodeX: prev.nodeX, nodeY: prev.nodeY, state: prev.state, crumbs: prev.crumbs || [] };
    this.updateIndicators();
    this._skipPush = true;
    if (prev.reshowFn) prev.reshowFn();
  }

  _backBtn() {
    return this._wizardHistory?.length
      ? `<button class="btn" style="padding:8px 16px; font-size:12px; margin-top:10px; width:100%;" onclick="app.wizardBack()">← Atrás</button>`
      : '';
  }

  _wizConnect(id) {
    if (this._wizard.lastDrawflowId !== null) {
      const outPort = this._wizard.useRightPort ? 'output_2' : 'output_1';
      const inPort = this._wizard.useRightPort ? 'input_2' : 'input_1';
      try { this.editor.addConnection(this._wizard.lastDrawflowId, id, outPort, inPort); } catch(e) {}
      this._wizard.useRightPort = false;
    }
  }

  _wizAdd(type, icon, label) {
    const wiz = this._wizard;
    const id = this._createNode(type, wiz.nodeX, wiz.nodeY, icon, label);
    this._wizConnect(id);
    wiz.lastDrawflowId = id;
    wiz.nodeY += 140;
    this._wizScrollTo(id);
    return id;
  }

  _wizScrollTo(drawflowId) {
    const el = document.getElementById('node-' + drawflowId);
    if (el) {
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.6)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1500);
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  _wizCrumb(label) {
    if (this._wizard?.crumbs) this._wizard.crumbs.push(label);
  }

  _wizPrompt(icon, question, btnsHtml) {
    const bc = this._wizard?.crumbs || [];
    document.getElementById('wizardBreadcrumb').innerHTML = bc.length
      ? bc.map(c => `<span style="color:var(--accent2);">${c}</span>`).join(' <span style="opacity:0.4;">→</span> ')
      : '';
    document.getElementById('wizardIcon').textContent = icon;
    document.getElementById('wizardQuestion').textContent = question;
    document.getElementById('wizardBtns').innerHTML = btnsHtml + this._backBtn();
    document.getElementById('wizardPrompt').style.display = 'flex';
  }

  _wizYesNo(icon, question, state) {
    this._wizard.state = state;
    this._wizPrompt(icon, question, `
      <button class="btn success" style="padding:12px 28px; font-size:14px;" onclick="app.wizardAnswer(true)">✅ Sí</button>
      <button class="btn" style="padding:12px 28px; font-size:14px;" onclick="app.wizardAnswer(false)">❌ No</button>`);
  }

  _wizardAfterNodeCreated(drawflowId, type) {
    const wiz = this._wizard;
    this._wizConnect(drawflowId);
    wiz.lastDrawflowId = drawflowId;
    wiz.nodeY += 140;
    if (type === 'trigger') {
      // El trigger YA define el canal → ir directo a "¿en qué app?"
      this._wizCrumb('🟢 ' + (this.nodoMap.get(drawflowId)?.nombre || 'Inicio'));
      this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
      this.showNodeSelector('app');
    } else if (type === 'app') {
      this._askBridge();
    }
  }

  // ===== PASO 1: ¿Por qué canal? =====
  _askChannel() {
    this._wizPush(() => this._askChannel());
    this._wizard.state = 'CHANNEL';
    this._wizPrompt('📨', '¿Por qué canal llega la info?', `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%;">
        <div class="preset-btn" onclick="app.wizChannel('email')"><span class="preset-icon">📧</span><span class="preset-label">Email</span></div>
        <div class="preset-btn" onclick="app.wizChannel('mensaje')"><span class="preset-icon">💬</span><span class="preset-label">Mensaje / Chat</span></div>
        <div class="preset-btn" onclick="app.wizChannel('llamada')"><span class="preset-icon">📞</span><span class="preset-label">Llamada / Voz</span></div>
        <div class="preset-btn" onclick="app.wizChannel('papel')"><span class="preset-icon">📄</span><span class="preset-label">Papel</span></div>
        <div class="preset-btn" onclick="app.wizChannel('web')"><span class="preset-icon">🌐</span><span class="preset-label">Web / Formulario</span></div>
        <div class="preset-btn" onclick="app.wizChannel('pica')"><span class="preset-icon">✍️</span><span class="preset-label">Se pica a mano</span></div>
      </div>`);
  }

  wizChannel(canal) {
    document.getElementById('wizardPrompt').style.display = 'none';
    const wiz = this._wizard;
    const icons = { email: '📧', mensaje: '💬', web: '🌐', llamada: '📞', pica: '✍️' };
    const labels = { email: 'Email', mensaje: 'Mensaje / Chat', web: 'Formulario web', llamada: 'Llamada / Voz', pica: 'Entrada manual' };
    this._wizCrumb(icons[canal] + ' ' + labels[canal]);

    if (['email', 'mensaje', 'web'].includes(canal)) {
      this._wizAdd('digital', icons[canal], labels[canal]);
      this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
      this.showNodeSelector('app');
    } else if (canal === 'llamada') {
      this._wizAdd('digital', '📞', 'Llamada / Voz');
      this._askNotes();
    } else if (canal === 'papel') {
      this._askPaperType();
    } else if (canal === 'pica') {
      this._wizAdd('digital', '✍️', 'Entrada manual');
      this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
      this.showNodeSelector('app');
    }
  }

  // ===== SUB: Llamada =====
  _askNotes() {
    this._wizPush(() => this._askNotes());
    this._wizYesNo('📝', '¿Alguien apunta o registra lo que le dicen?', 'NOTES');
  }

  // ===== SUB: Papel =====
  _askPaperType() {
    this._wizPush(() => this._askPaperType());
    this._wizard.state = 'PAPER';
    this._wizPrompt('📄', '¿Qué tipo de texto tiene?', `
      <button class="btn" style="padding:14px 20px; font-size:13px; flex:1;" onclick="app.wizPaper('manuscrito')">
        ✍️ Manuscrito<br><span style="font-size:10px; opacity:0.7;">Letra a mano</span>
      </button>
      <button class="btn success" style="padding:14px 20px; font-size:13px; flex:1;" onclick="app.wizPaper('impreso')">
        🖨️ Impreso<br><span style="font-size:10px; opacity:0.7;">Factura, albarán...</span>
      </button>`);
  }

  wizPaper(tipo) {
    document.getElementById('wizardPrompt').style.display = 'none';
    const wiz = this._wizard;
    this._wizCrumb(tipo === 'impreso' ? '🖨️ Impreso' : '✍️ Manuscrito');
    if (tipo === 'impreso') {
      this._wizAdd('digital', '💡', 'Papel impreso → proponer email');
      this._wizAdd('manual', '🔴', 'Picar datos');
      this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
      this.showNodeSelector('app');
    } else {
      this._wizAdd('digital', '✍️', 'Manuscrito');
      this._askDigitize();
    }
  }

  _askDigitize() {
    this._wizPush(() => this._askDigitize());
    this._wizYesNo('🖥️', '¿Alguien lo pasa a ordenador?', 'DIGITIZE');
  }

  // ===== Bridge =====
  _askBridge() {
    this._wizPush(() => this._askBridge());
    this._wizYesNo('🔀', '¿Esta info tiene que pasar a otra app?', 'BRIDGE');
  }

  // ===== Respuestas =====
  wizardAnswer(yes) {
    document.getElementById('wizardPrompt').style.display = 'none';
    const wiz = this._wizard;

    switch (wiz.state) {
      case 'NOTES':
        this._wizCrumb(yes ? '📝 Sí apunta' : '🚫 No apunta');
        if (yes) {
          this._wizAdd('manual', '🔴', 'Apuntar / Registrar');
          this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
          this.showNodeSelector('app');
        } else {
          this._wizAdd('digital', '⚪', 'Info verbal (no registrada)');
          this._askBridge();
        }
        break;

      case 'DIGITIZE':
        this._wizCrumb(yes ? '💻 Sí digitaliza' : '🚫 No digitaliza');
        if (yes) {
          this._wizAdd('digital', '💡', 'Proponer cambio a digital');
          this._wizAdd('manual', '🔴', 'Picar datos manuscritos');
          this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
          this.showNodeSelector('app');
        } else {
          this._askBridge();
        }
        break;

      case 'BRIDGE':
        this._wizCrumb(yes ? '🔀 Sí, otra app' : '✅ Fin');
        if (yes) {
          this._wizAdd('manual', '🔴', 'Tarea manual');
          this._pendingDrop = { type: 'app', x: wiz.nodeX, y: wiz.nodeY };
          this.showNodeSelector('app');
        } else {
          this._wizardEnd();
        }
        break;
    }
  }

  _wizardEnd() {
    const pendingReds = [];
    for (const [dfId, nodo] of this.nodoMap) {
      if (nodo.esManual && nodo.horas === 0) pendingReds.push(dfId);
    }
    this._wizardMode = false;
    const lastId = this._wizard?.lastDrawflowId;
    this._wizard = null;
    this.guardar();
    if (lastId) this._wizScrollTo(lastId);
    if (pendingReds.length > 0) this.onNodeSelected(pendingReds[0]);
  }

  wizardContinue() {
    document.getElementById('wizardContinueBtn').style.display = 'none';
    this._askBridge();
  }

  continueFromSelected() {
    if (this.selectedNodeId === null) return;
    const drawflowId = this.selectedNodeId;
    const nodeData = this.editor.getNodeFromId(drawflowId);
    const nodo = this.nodoMap.get(drawflowId);
    document.getElementById('wizardContinueBtn').style.display = 'none';
    this.closePanel();

    // Calcular X libre: a la derecha del nodo origen
    const baseX = (nodeData?.pos_x || 300) + 250;
    const baseY = nodeData?.pos_y || 200;

    this._wizard = {
      lastDrawflowId: drawflowId,
      nodeX: baseX,
      nodeY: baseY,
      state: null,
      crumbs: nodo ? ['📍 ' + nodo.nombre] : [],
      useRightPort: true
    };
    this._wizardMode = true;
    this._wizardHistory = [];
    this._askBridge();
  }

  cancelNodeSelector() {
    document.getElementById('nodeSelector').style.display = 'none';
    this._pendingDrop = null;
    if (this._wizardMode) { this._wizardMode = false; this._wizard = null; }
  }

  // =========================================
  // NODO — Selección y edición
  // =========================================
  onNodeSelected(drawflowId) {
    this.selectedNodeId = drawflowId;
    const nodo = this.nodoMap.get(drawflowId);
    if (!nodo) return;

    document.getElementById('nodeName').value = nodo.nombre;
    document.getElementById('panelTitle').textContent =
      nodo.tipo === 'manual' ? '🔴 Paso Manual' :
      nodo.tipo === 'app' ? '🔵 App' : '🟢 Disparador';

    // Siempre mostrar botón de continuar proceso
    document.getElementById('wizardContinueBtn').style.display = 'block';

    document.getElementById('manualFields').style.display = nodo.esManual ? 'block' : 'none';

    if (nodo.esManual) {
      document.getElementById('nodeDesc').value = nodo.descripcion;
      document.getElementById('nodeHours').value = nodo.horas;
      document.getElementById('nodeCost').value = nodo.costePorHora;
      document.getElementById('nodeFreq').value = nodo.frecuencia;
      this.renderSolucion(nodo.solucion || 'directo');
      document.getElementById('nodeSugerencia').value = nodo.sugerencia || '';
      const esCambio = nodo.solucion === 'conCambio';
      document.getElementById('sugerenciaWrap').style.display = esCambio ? 'block' : 'none';
      document.getElementById('quienWrap').style.display = esCambio ? 'block' : 'none';
      const esYo = nodo.setupQuien === 'yo';
      document.getElementById('setupWrap').style.display = (esCambio && esYo) ? 'block' : 'none';
      if (esCambio) {
        this.renderQuien(nodo.setupQuien || 'cliente');
        if (esYo) {
          document.getElementById('setupHoras').value = nodo.setupHoras || 0;
          document.getElementById('setupRate').value = nodo.setupCostePorHora || 30;
          document.getElementById('setupPrecio').value = nodo.setupPrecio !== null && nodo.setupPrecio !== undefined ? nodo.setupPrecio : '';
          this._renderSetupResumen(nodo);
        }
      }
    }

    document.getElementById('canvasView').classList.add('panel-open');
  }

  onNodeRemoved(drawflowId) {
    const nodo = this.nodoMap.get(drawflowId);
    if (nodo) {
      this.auditoria.removeNodo(nodo.id);
      this.nodoMap.delete(drawflowId);
    }
    this.closePanel();
    this.updateIndicators();
  }

  deleteNode(nodoId) {
    // Buscar drawflowId por nodoId
    let dfId = null;
    for (const [id, nodo] of this.nodoMap) {
      if (nodo.id === nodoId) { dfId = id; break; }
    }
    if (dfId === null) return;
    try { this.editor.removeNodeId('node-' + dfId); } catch(e) {}
    // onNodeRemoved se llama automáticamente
  }

  closePanel() {
    document.getElementById('canvasView').classList.remove('panel-open');
    this.selectedNodeId = null;
  }

  updateNodeData() {
    if (this.selectedNodeId === null) return;
    const nodo = this.nodoMap.get(this.selectedNodeId);
    if (!nodo) return;

    nodo.nombre = document.getElementById('nodeName').value;

    if (nodo.esManual) {
      nodo.descripcion = document.getElementById('nodeDesc').value;
      nodo.horas = parseFloat(document.getElementById('nodeHours').value) || 0;
      nodo.costePorHora = parseFloat(document.getElementById('nodeCost').value) || 14;
      nodo.frecuencia = document.getElementById('nodeFreq').value;
      nodo.sugerencia = document.getElementById('nodeSugerencia').value;
    }

    const labelEl = document.querySelector(`[data-nodo-id="${nodo.id}"]`);
    if (labelEl) labelEl.textContent = nodo.nombre || 'Paso Manual';

    const subEl = document.querySelector(`[data-nodo-sub="${nodo.id}"]`);
    if (subEl && nodo.esManual && nodo.horas > 0) {
      subEl.textContent = `${Math.round(nodo.horasMes)}h/mes · ${Math.round(nodo.costeMes)}€`;
    }

    this.updateIndicators();
  }

  spinValue(inputId, delta) {
    const input = document.getElementById(inputId);
    let val = parseFloat(input.value) || 0;
    input.value = Math.max(0, val + delta);
    if (inputId === 'setupHoras' || inputId === 'setupRate') {
      this.updateSetup();
    } else {
      this.updateNodeData();
    }
  }

  setSolucion(solucion) {
    if (this.selectedNodeId === null) return;
    const nodo = this.nodoMap.get(this.selectedNodeId);
    if (!nodo) return;
    nodo.solucion = solucion;
    this.renderSolucion(solucion);
    const esCambio = solucion === 'conCambio';
    document.getElementById('sugerenciaWrap').style.display = esCambio ? 'block' : 'none';
    document.getElementById('quienWrap').style.display = esCambio ? 'block' : 'none';
    document.getElementById('setupWrap').style.display = (esCambio && nodo.setupQuien === 'yo') ? 'block' : 'none';
    if (esCambio) {
      this.renderQuien(nodo.setupQuien || 'cliente');
    }
    if (!esCambio) {
      nodo.sugerencia = '';
      nodo.setupHoras = 0;
      nodo.setupPrecio = null;
      nodo.setupQuien = 'cliente';
      document.getElementById('nodeSugerencia').value = '';
    }
    // Clase naranja en el nodo del canvas
    const nodeEl = document.getElementById('node-' + this.selectedNodeId);
    if (nodeEl) {
      nodeEl.classList.toggle('con-cambio', esCambio);
    }
    this.autoSaveCanvas();
  }

  setQuien(quien) {
    if (this.selectedNodeId === null) return;
    const nodo = this.nodoMap.get(this.selectedNodeId);
    if (!nodo) return;
    nodo.setupQuien = quien;
    this.renderQuien(quien);
    const esYo = quien === 'yo';
    document.getElementById('setupWrap').style.display = esYo ? 'block' : 'none';
    if (!esYo) {
      nodo.setupHoras = 0;
      nodo.setupPrecio = null;
    }
    this.autoSaveCanvas();
  }

  renderQuien(quien) {
    document.querySelectorAll('[data-quien]').forEach(btn => {
      btn.className = 'estado-btn' + (btn.dataset.quien === quien ? ' active' : '');
    });
  }

  updateSetup() {
    if (this.selectedNodeId === null) return;
    const nodo = this.nodoMap.get(this.selectedNodeId);
    if (!nodo) return;
    nodo.setupHoras = parseFloat(document.getElementById('setupHoras').value) || 0;
    nodo.setupCostePorHora = parseFloat(document.getElementById('setupRate').value) || 30;
    const precioInput = document.getElementById('setupPrecio').value;
    nodo.setupPrecio = precioInput === '' ? null : parseFloat(precioInput);
    this._renderSetupResumen(nodo);
    this.autoSaveCanvas();
  }

  _renderSetupResumen(obj, elId = 'setupResumen') {
    const el = document.getElementById(elId);
    if (!el) return;
    const calc = obj.setupCosteCalculado;
    const final = obj.setupCosteFinal;
    const desc = obj.setupDescuento;
    if (calc === 0 && final === 0) {
      el.textContent = 'Sin coste de instalaci\u00f3n';
    } else if (desc > 0) {
      el.innerHTML = '<span style="text-decoration:line-through;">' + calc + '\u20ac</span> \u2192 <strong style="color:#22c55e;">' + final + '\u20ac</strong> <span style="color:#f59e0b;">(' + desc + '% dto)</span>';
    } else {
      el.textContent = 'Instalaci\u00f3n: ' + final + '\u20ac';
    }
  }

  updateGeneralSetup() {
    if (!this.auditoria) return;
    this.auditoria.setupHoras = parseFloat(document.getElementById('gSetupHoras').value) || 0;
    this.auditoria.setupCostePorHora = parseFloat(document.getElementById('gSetupRate').value) || 30;
    const p = document.getElementById('gSetupPrecio').value;
    this.auditoria.setupPrecio = p === '' ? null : parseFloat(p);
    this._renderSetupResumen(this.auditoria, 'gSetupResumen');
    this.autoSaveCanvas();
  }

  spinGeneralSetup(inputId, delta) {
    const input = document.getElementById(inputId);
    let val = parseFloat(input.value) || 0;
    input.value = Math.max(0, val + delta);
    this.updateGeneralSetup();
  }

  _loadGeneralSetup() {
    if (!this.auditoria) return;
    document.getElementById('gSetupHoras').value = this.auditoria.setupHoras || 0;
    document.getElementById('gSetupRate').value = this.auditoria.setupCostePorHora || 30;
    document.getElementById('gSetupPrecio').value = this.auditoria.setupPrecio !== null && this.auditoria.setupPrecio !== undefined ? this.auditoria.setupPrecio : '';
    this._renderSetupResumen(this.auditoria, 'gSetupResumen');
  }

  renderSolucion(solucion) {
    document.querySelectorAll('.estado-btn').forEach(btn => {
      btn.className = 'estado-btn';
      const est = btn.dataset.estado;
      if (est === solucion) {
        btn.classList.add(est === 'directo' ? 'active-auto' : 'active-future');
      }
    });
  }

  // =========================================
  // INDICADORES
  // =========================================
  updateIndicators() {
    if (!this.auditoria) return;
    const m = this.auditoria.nodosManules;
    document.getElementById('indNodos').textContent = m.length;
    document.getElementById('indHoras').textContent = Math.round(this.auditoria.totalHorasMes * 10) / 10;
    document.getElementById('indCoste').textContent = Math.round(this.auditoria.totalCosteMes) + '€';

    const cuotaWrap = document.getElementById('indCuotaWrap');
    if (this.costeRevealed && this.auditoria.totalCosteMes > 0) {
      cuotaWrap.style.display = 'flex';
      const el = document.getElementById('indCuota');
      el.textContent = this.auditoria.compensa ? this.auditoria.cuota + '€/mes' : '⛔ <99€';
      el.style.color = this.auditoria.compensa ? 'var(--green)' : 'var(--red)';
    } else {
      cuotaWrap.style.display = 'none';
    }
  }

  toggleCoste() {
    this.costeRevealed = !this.costeRevealed;
    document.querySelector('.coste-toggle').classList.toggle('revealed', this.costeRevealed);
    this.updateIndicators();
  }

  toggleBeforeAfter() {
    this.afterMode = !this.afterMode;
    const canvas = document.getElementById('canvasView');
    canvas.classList.toggle('after-mode', this.afterMode);
    document.getElementById('btnBeforeAfter').textContent = this.afterMode ? '🔄 Volver' : '👁️ Antes/Después';

    if (this.afterMode) {
      this._createBypassConnections();
    } else {
      this._removeBypassConnections();
    }
  }

  _createBypassConnections() {
    this._bypassConnections = [];
    const exported = this.editor.export();
    const homeData = exported.drawflow?.Home?.data || {};

    // Buscar nodos manuales
    const manualDfIds = new Set();
    for (const [dfId, nodo] of this.nodoMap) {
      if (nodo.esManual) manualDfIds.add(String(dfId));
    }

    // Para cada nodo manual, buscar qué entra y qué sale
    for (const manualId of manualDfIds) {
      const nodeInfo = homeData[manualId];
      if (!nodeInfo) continue;

      // Nodos que conectan A este manual
      const inputNodes = [];
      for (const [, inp] of Object.entries(nodeInfo.inputs || {})) {
        for (const conn of (inp.connections || [])) {
          if (!manualDfIds.has(String(conn.node))) inputNodes.push(conn.node);
        }
      }

      // Nodos que salen DE este manual
      const outputNodes = [];
      for (const [, out] of Object.entries(nodeInfo.outputs || {})) {
        for (const conn of (out.connections || [])) {
          if (!manualDfIds.has(String(conn.node))) outputNodes.push(conn.node);
        }
      }

      // Crear conexiones bypass directas
      for (const from of inputNodes) {
        for (const to of outputNodes) {
          try {
            this.editor.addConnection(from, to, 'output_1', 'input_1');
            this._bypassConnections.push({ from, to });
          } catch(e) {}
        }
      }
    }

    // Ocultar conexiones que tocan nodos manuales
    for (const manualId of manualDfIds) {
      document.querySelectorAll(`.connection.node_in_node-${manualId}, .connection.node_out_node-${manualId}`).forEach(el => {
        el.style.display = 'none';
        el.dataset.hiddenByAfter = 'true';
      });
    }
  }

  _removeBypassConnections() {
    if (!this._bypassConnections) return;
    for (const { from, to } of this._bypassConnections) {
      try { this.editor.removeSingleConnection(from, to, 'output_1', 'input_1'); } catch(e) {}
    }
    this._bypassConnections = [];

    // Restaurar conexiones ocultas
    document.querySelectorAll('[data-hidden-by-after]').forEach(el => {
      el.style.display = '';
      delete el.dataset.hiddenByAfter;
    });
  }

  // =========================================
  // GUARDAR
  // =========================================
  guardar() {
    if (!this.editor || !this.auditoria) return;
    this.auditoria.canvasData = this.editor.export();
    Storage.guardarCliente(this.cliente);
  }

  autoSaveCanvas() {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => this.guardar(), 2000);
  }

  // =========================================
  // PDF
  // =========================================
  _buildFlowChain() {
    const exported = this.editor.export();
    const homeData = exported?.drawflow?.Home?.data || {};
    const chain = [];
    const visited = new Set();

    // Encontrar nodos raíz (triggers o nodos sin inputs conectados)
    const roots = [];
    for (const [id, nodeInfo] of Object.entries(homeData)) {
      let hasInput = false;
      for (const [, inp] of Object.entries(nodeInfo.inputs || {})) {
        if (inp.connections && inp.connections.length > 0) hasInput = true;
      }
      if (!hasInput) roots.push(id);
    }

    // Recorrer en orden BFS desde cada raíz
    const queue = [...roots];
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const nodo = this.nodoMap.get(parseInt(id));
      if (nodo) chain.push(nodo);

      const nodeInfo = homeData[id];
      if (!nodeInfo) continue;
      for (const [, out] of Object.entries(nodeInfo.outputs || {})) {
        for (const conn of (out.connections || [])) {
          if (!visited.has(String(conn.node))) queue.push(String(conn.node));
        }
      }
    }
    return chain;
  }

  generarPDF() {
    this.guardar();
    if (!this.auditoria || this.auditoria.totalCosteMes === 0) {
      alert('Añade al menos un paso manual con horas para generar el diagnóstico.');
      return;
    }

    if (!this.auditoria.compensa) {
      alert('El volumen actual no alcanza el mínimo.\nSigue mapeando procesos para encontrar más oportunidades de automatización.');
      return;
    }

    const tareas = this.auditoria.nodosManules.filter(n => n.horas > 0);
    const horas = Math.round(this.auditoria.totalHorasMes);
    const costeMes = Math.round(this.auditoria.totalCosteMes);
    const costeAnual = costeMes * 12;
    const cuota = this.auditoria.cuota;
    const roi = this.auditoria.roi;

    // === Construir flujo ANTES / DESPUÉS ===
    const flowChain = this._buildFlowChain();

    const flowBefore = flowChain.map(n => {
      const esCambio = n.esManual && n.solucion === 'conCambio';
      const bg = esCambio ? '#fff7ed' : n.esManual ? '#fef2f2' : '#f0fdf4';
      const border = esCambio ? '#f59e0b' : n.esManual ? '#ef4444' : '#22c55e';
      const color = esCambio ? '#d97706' : n.esManual ? '#ef4444' : '#16a34a';
      return '<div style="padding:4px 8px; border-radius:5px; border:1.5px solid ' + border + '; background:' + bg + '; color:' + color + '; font-size:10px; font-weight:600; text-align:center;">' + n.nombre + '</div>';
    }).join('<div style="text-align:center; color:#ccc; font-size:10px; line-height:1;">&#8595;</div>');

    const flowAfter = flowChain.filter(n => !n.esManual).map(n => {
      return '<div style="padding:4px 8px; border-radius:5px; border:1.5px solid #22c55e; background:#f0fdf4; color:#16a34a; font-size:10px; font-weight:600; text-align:center;">' + n.nombre + '</div>';
    }).join('<div style="text-align:center; color:#22c55e; font-size:10px; line-height:1;">&#9889;&#8595;</div>');

    const tareasHtml = tareas.map((n, i) => {
      const nombre = n.nombre || ('Tarea ' + (i + 1));
      const desc = n.descripcion ? '<br><span style="color:#888; font-size:10px;">' + n.descripcion + '</span>' : '';
      return '<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:6px 4px;"><strong>' + nombre + '</strong>' + desc + '</td><td style="padding:6px 4px;">' + Math.round(n.horasMes) + 'h</td><td style="padding:6px 4px;">' + Math.round(n.costeMes) + '&#8364;</td></tr>';
    }).join('');

    let flowSection = '';
    if (flowChain.length > 1 && flowChain.length <= 6) {
      flowSection = '<div style="display:flex; gap:12px; margin-bottom:12px;">' +
        '<div style="flex:1; padding:10px; background:#fef9f9; border-radius:8px; border:1px solid #fecaca;">' +
        '<div style="font-size:11px; font-weight:700; color:#ef4444; margin-bottom:8px; text-align:center;">&#128308; ANTES</div>' + flowBefore + '</div>' +
        '<div style="flex:1; padding:10px; background:#f0fdf4; border-radius:8px; border:1px solid #bbf7d0;">' +
        '<div style="font-size:11px; font-weight:700; color:#22c55e; margin-bottom:8px; text-align:center;">&#9889; DESPU&#201;S</div>' + flowAfter + '</div></div>';
    }

    let sugSection = '';
    const sugerencias = this.auditoria.nodosManules.filter(n => n.solucion === 'conCambio' && n.sugerencia);
    if (sugerencias.length > 0) {
      const items = sugerencias.map(n => {
        let detail = '';
        if (n.setupQuien === 'cliente') {
          detail = '<br><span style="font-size:10px; color:#6366f1;">&#9888; Se requiere acci&#243;n de <strong>' + this.cliente.nombre + '</strong>. Hasta que no se realice, no se puede acometer la automatizaci&#243;n de esta tarea.</span>';
        } else {
          if (n.setupCosteFinal > 0) {
            detail = '<br><span style="font-size:10px; color:#888;">&#128295; Instalaci&#243;n: ' + n.setupCosteFinal + '&#8364;</span>';
          } else if (n.setupHoras > 0 && n.setupCosteFinal === 0) {
            detail = '<br><span style="font-size:10px; color:#22c55e; font-weight:600;">&#128295; Instalaci&#243;n incluida</span>';
          }
        }
        return '<div style="font-size:12px; color:#444; margin-bottom:4px;"><strong>' + n.nombre + '</strong> &#8594; <em>' + n.sugerencia + '</em>' + detail + '</div>';
      }).join('');
      sugSection = '<div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:12px;">' +
        '<div style="font-size:13px; font-weight:700; color:#d97706; margin-bottom:6px;">&#128161; Sugerencias de mejora</div>' + items + '</div>';
    }

    const setupTareasCalc = sugerencias.filter(n => n.setupQuien === 'yo').reduce((sum, n) => sum + n.setupCosteCalculado, 0);
    const setupTareasFinal = sugerencias.filter(n => n.setupQuien === 'yo').reduce((sum, n) => sum + n.setupCosteFinal, 0);
    const setupGeneralCalc = this.auditoria.setupCosteCalculado || 0;
    const setupGeneralFinal = this.auditoria.setupCosteFinal || 0;
    const totalSetupCalc = setupTareasCalc + setupGeneralCalc;
    const totalSetup = setupTareasFinal + setupGeneralFinal;
    const setupDto = totalSetupCalc > 0 && totalSetup < totalSetupCalc ? Math.round((1 - totalSetup / totalSetupCalc) * 100) : 0;

    const html = '<h2 style="font-size:20px; margin-bottom:2px; color:#1a1a2e;">' + this.cliente.nombre + '</h2>' +
      '<p style="color:#888; font-size:12px; margin-bottom:16px;">' + (this.cliente.contacto || '') + '</p>' +
      '<div style="background:#fef2f2; border-left:4px solid #ef4444; padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:12px;">' +
      '<div style="font-size:13px; font-weight:700; color:#ef4444; margin-bottom:4px;">&#128269; Lo que encontramos</div>' +
      '<div style="font-size:12px; color:#444; line-height:1.6;">' +
      '&#128308; Est&#225;is dedicando <strong>' + horas + 'h/mes</strong> a tareas repetitivas<br>' +
      '&#128308; Eso supone <strong>' + costeMes + '&#8364;/mes</strong> (' + costeAnual.toLocaleString('es-ES') + '&#8364;/a&#241;o)<br>' +
      '&#128308; Tiempo de empleado haciendo trabajo de robot</div></div>' +
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:13px; font-weight:700; color:#6366f1; margin-bottom:6px;">&#9989; Tareas a automatizar</div>' +
      '<table style="width:100%; border-collapse:collapse; font-size:12px;">' +
      '<tr style="border-bottom:2px solid #e5e7eb; text-align:left;"><th style="padding:5px 4px; color:#666;">Tarea</th><th style="padding:5px 4px; color:#666;">Horas/mes</th><th style="padding:5px 4px; color:#666;">Coste</th></tr>' +
      tareasHtml +
      '<tr style="border-top:2px solid #e5e7eb; font-weight:700;"><td style="padding:6px 4px;">TOTAL</td><td style="padding:6px 4px;">' + horas + 'h</td><td style="padding:6px 4px;">' + costeMes + '&#8364;</td></tr>' +
      '</table></div>' +
      flowSection + sugSection +
      '<div style="background:#f0fdf4; border-left:4px solid #22c55e; padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:12px;">' +
      '<div style="font-size:13px; font-weight:700; color:#16a34a; margin-bottom:4px;">&#127919; Lo que gan&#225;is</div>' +
      '<div style="font-size:12px; color:#444; line-height:1.6;">' +
      '&#128176; Ahorro directo: <strong>' + costeMes + '&#8364;/mes</strong> (' + costeAnual.toLocaleString('es-ES') + '&#8364;/a&#241;o)<br>' +
      '&#9201; Tiempo liberado: <strong>' + horas + 'h/mes</strong> para dedicar a vuestro negocio<br>' +
      '&#129504; Menos errores, menos estr&#233;s, menos "se me olvid&#243; pasar esto"</div></div>' +
      '<div style="background:#f8f8fc; padding:14px; border-radius:10px; margin-bottom:10px; text-align:center;">' +
      '<div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#888; margin-bottom:8px;">Tu inversi&#243;n</div>' +
      '<div><div style="font-size:28px; font-weight:800; color:#6366f1;">' + cuota + '&#8364;<span style="font-size:14px; font-weight:400;">/mes</span></div>' +
      '<div style="font-size:10px; color:#888; margin-top:2px;">Cuota fija &#183; Sin permanencia</div></div>' +
      (function() {
        if (totalSetup === 0 && totalSetupCalc === 0) return '';
        if (totalSetup === 0 && totalSetupCalc > 0) return '<div style="margin-top:6px; font-size:12px; color:#22c55e;">&#9989; Instalaci&#243;n incluida</div>';
        var lines = '';
        var tareasYo = sugerencias.filter(function(n) { return n.setupQuien === 'yo' && n.setupCosteFinal > 0; });
        var hayDesglose = (tareasYo.length > 0 && setupGeneralFinal > 0) || tareasYo.length > 1;
        if (hayDesglose) {
          tareasYo.forEach(function(n) {
            lines += '<div style="font-size:10px; color:#666; margin-top:2px;">&#8226; ' + n.nombre + ': ' + n.setupCosteFinal + '&#8364;</div>';
          });
          if (setupGeneralFinal > 0) {
            lines += '<div style="font-size:10px; color:#666; margin-top:2px;">&#8226; Puesta en marcha general: ' + setupGeneralFinal + '&#8364;</div>';
          }
        }
        return '<div style="margin-top:8px; padding-top:6px; border-top:1px dashed #e5e7eb; text-align:center;">' +
          '<div style="font-size:12px; color:#d97706; font-weight:600;">+ Instalaci&#243;n: ' + totalSetup + '&#8364; &#183; pago &#250;nico</div>' +
          lines + '</div>';
      })() +
      '<div style="margin-top:10px; padding-top:8px; border-top:1px solid #e5e7eb;">' +
      '<span style="font-size:14px; font-weight:600; color:#22c55e;">Recuper&#225;is ' + roi + '&#8364; por cada 1&#8364; invertido</span></div></div>' +
      '<p style="text-align:center; font-size:11px; color:#666; font-style:italic; line-height:1.5; margin-top:12px;">' +
      'Cada mes que pasa, son ' + costeMes + '&#8364; y ' + horas + 'h que podr&#237;ais<br>estar invirtiendo en hacer crecer vuestro negocio.</p>';

    document.getElementById('pdfBody').innerHTML = html;
    document.getElementById('pdfDate').textContent = new Date().toLocaleDateString('es-ES');

    const el = document.getElementById('pdfContent');
    el.style.display = 'block';

    const filename = 'nexo_' + this.cliente.nombre.toLowerCase().replace(/\s+/g, '_') + '.pdf';

    html2pdf().set({
      margin: 6,
      filename: filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => {
      el.style.display = 'none';
    });
  }
}

// Bootstrap
const app = new NexoApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
