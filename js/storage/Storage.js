import { Cliente } from '../models/Cliente.js';

/**
 * Storage — Persistencia remota vía Nexo API.
 *
 * Guarda y recupera clientes del servidor Hetzner.
 * Sin localStorage, sin fallback.
 */
const API_BASE = '/api/auditorias';

export class Storage {

  // ── Cargar todos los clientes ──
  static async getClientes() {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const lista = await res.json();
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
    return clientes;
  }

  // ── Guardar un cliente ──
  static async guardarCliente(cliente) {
    const json = cliente.toJSON();
    const res = await fetch(`${API_BASE}/${cliente.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  }

  // ── Guardar todos ──
  static async guardar(clientes) {
    for (const c of clientes) {
      await this.guardarCliente(c);
    }
  }

  // ── Obtener cliente por ID ──
  static async getClienteById(id) {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Cliente.fromJSON(data);
  }

  // ── Eliminar cliente ──
  static async eliminarCliente(id) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  }
}
