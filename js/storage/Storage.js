import { Cliente } from '../models/Cliente.js';

/**
 * Storage — Gestiona la persistencia en localStorage.
 * 
 * Guarda y recupera clientes con todas sus auditorías.
 * Clave: 'nexo_clientes'
 */
const STORAGE_KEY = 'nexo_clientes';

export class Storage {

  static getClientes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw).map(c => Cliente.fromJSON(c));
    } catch (e) {
      console.error('Error leyendo clientes:', e);
      return [];
    }
  }

  static guardar(clientes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes.map(c => c.toJSON())));
    } catch (e) {
      console.error('Error guardando clientes:', e);
    }
  }

  static guardarCliente(cliente) {
    const clientes = this.getClientes();
    const idx = clientes.findIndex(c => c.id === cliente.id);
    if (idx >= 0) {
      clientes[idx] = cliente;
    } else {
      clientes.push(cliente);
    }
    this.guardar(clientes);
  }

  static getClienteById(id) {
    return this.getClientes().find(c => c.id === id) || null;
  }

  static eliminarCliente(id) {
    const clientes = this.getClientes().filter(c => c.id !== id);
    this.guardar(clientes);
  }
}
