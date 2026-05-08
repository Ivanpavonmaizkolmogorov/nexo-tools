import { Cliente } from '../models/Cliente.js';

/**
 * Storage — Persistencia híbrida: API remota + localStorage fallback.
 *
 * Intenta guardar/cargar del servidor Nexo API.
 * Si no hay conexión, usa localStorage como backup.
 */
const STORAGE_KEY = 'nexo_clientes';
const API_BASE = 'http://62.238.19.114:8501/api/auditorias';

export class Storage {

  // ── Cargar todos los clientes ──
  static async getClientes() {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = await res.json();
      // La API devuelve metadatos, cargamos cada uno completo
      const clientes = [];
      for (const item of lista) {
        try {
          const r = await fetch(`${API_BASE}/${item.id}`);
          if (r.ok) {
            const data = await r.json();
            clientes.push(Cliente.fromJSON(data));
          }
        } catch { /* skip broken */ }
      }
      // Sincronizar a localStorage como backup
      this._guardarLocal(clientes);
      return clientes;
    } catch (e) {
      console.warn('API no disponible, usando localStorage:', e.message);
      return this._getLocal();
    }
  }

  // ── Guardar un cliente ──
  static async guardarCliente(cliente) {
    const json = cliente.toJSON();
    try {
      const res = await fetch(`${API_BASE}/${cliente.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('API no disponible, guardando en localStorage:', e.message);
    }
    // Siempre guardar en localStorage como backup
    const clientes = this._getLocal();
    const idx = clientes.findIndex(c => c.id === cliente.id);
    if (idx >= 0) clientes[idx] = cliente;
    else clientes.push(cliente);
    this._guardarLocal(clientes);
  }

  // ── Guardar todos ──
  static async guardar(clientes) {
    for (const c of clientes) {
      await this.guardarCliente(c);
    }
  }

  // ── Obtener cliente por ID ──
  static async getClienteById(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Cliente.fromJSON(data);
    } catch (e) {
      console.warn('API no disponible, buscando en localStorage:', e.message);
      return this._getLocal().find(c => c.id === id) || null;
    }
  }

  // ── Eliminar cliente ──
  static async eliminarCliente(id) {
    try {
      await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('API no disponible:', e.message);
    }
    const clientes = this._getLocal().filter(c => c.id !== id);
    this._guardarLocal(clientes);
  }

  // ── LocalStorage helpers (backup) ──
  static _getLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw).map(c => Cliente.fromJSON(c));
    } catch { return []; }
  }

  static _guardarLocal(clientes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes.map(c => c.toJSON())));
    } catch { /* ignore */ }
  }
}
