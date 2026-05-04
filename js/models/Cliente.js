import { Auditoria } from './Auditoria.js';

/**
 * Cliente — Un negocio al que le hacemos auditoría.
 * 
 * Puede tener múltiples auditorías (visitas, revisiones, ampliaciones).
 */
export class Cliente {
  constructor(nombre, contacto = '') {
    this.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    this.nombre = nombre;
    this.contacto = contacto;
    this.fechaCreacion = new Date().toISOString();
    this.auditorias = [];
  }

  nuevaAuditoria() {
    const a = new Auditoria(this.id);
    this.auditorias.push(a);
    return a;
  }

  getAuditoria(auditoriaId) {
    return this.auditorias.find(a => a.id === auditoriaId);
  }

  get ultimaAuditoria() {
    return this.auditorias[this.auditorias.length - 1] || null;
  }

  get totalAuditorias() {
    return this.auditorias.length;
  }

  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      contacto: this.contacto,
      fechaCreacion: this.fechaCreacion,
      auditorias: this.auditorias.map(a => a.toJSON())
    };
  }

  static fromJSON(data) {
    const c = new Cliente(data.nombre, data.contacto);
    c.id = data.id;
    c.fechaCreacion = data.fechaCreacion;
    c.auditorias = data.auditorias.map(a => Auditoria.fromJSON(a));
    return c;
  }
}
