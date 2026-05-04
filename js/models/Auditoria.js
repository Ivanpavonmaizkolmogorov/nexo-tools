import { Nodo } from './Nodo.js';

/**
 * Auditoria — Una sesión de auditoría vinculada a un cliente.
 * 
 * Contiene los nodos del canvas, sus conexiones,
 * y los datos exportados de Drawflow para restaurar el lienzo.
 */
export class Auditoria {
  constructor(clienteId) {
    this.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    this.clienteId = clienteId;
    this.fecha = new Date().toISOString();
    this.nodos = [];
    this.canvasData = null; // Drawflow export JSON
    this.notas = '';
    // Instalación general del proyecto
    this.setupHoras = 0;
    this.setupCostePorHora = 30;
    this.setupPrecio = null; // null = auto, 0 = gratis, N = fijo
  }

  addNodo(nodo) {
    this.nodos.push(nodo);
    return nodo;
  }

  removeNodo(nodoId) {
    this.nodos = this.nodos.filter(n => n.id !== nodoId);
  }

  getNodo(nodoId) {
    return this.nodos.find(n => n.id === nodoId);
  }

  get nodosManules() {
    return this.nodos.filter(n => n.esManual);
  }

  get totalHorasMes() {
    return this.nodosManules.reduce((sum, n) => sum + n.horasMes, 0);
  }

  get totalCosteMes() {
    return this.nodosManules.reduce((sum, n) => sum + n.costeMes, 0);
  }

  get cuota() {
    return Math.round(this.totalCosteMes * 0.33 / 10) * 10;
  }

  get compensa() {
    return this.cuota >= 99 || this.totalCosteMes === 0;
  }

  get ahorro() {
    return this.totalCosteMes - this.cuota;
  }

  get roi() {
    return this.cuota > 0 ? Math.round(this.totalCosteMes / this.cuota) : 0;
  }

  get setupCosteCalculado() {
    return this.setupHoras * this.setupCostePorHora;
  }

  get setupCosteFinal() {
    if (this.setupPrecio !== null && this.setupPrecio !== '') return parseFloat(this.setupPrecio) || 0;
    return this.setupCosteCalculado;
  }

  get setupDescuento() {
    const calc = this.setupCosteCalculado;
    const final = this.setupCosteFinal;
    if (calc > 0 && final < calc) return Math.round((1 - final / calc) * 100);
    return 0;
  }

  generarPitch() {
    if (this.totalCosteMes === 0) return '';

    const tareas = this.nodosManules.filter(n => n.horas > 0);
    let desglose = tareas.map((n, i) => {
      const hm = Math.round(n.horasMes);
      const cm = Math.round(n.costeMes);
      const freq = n.frecuencia === 'diario' ? 'día' : n.frecuencia === 'mensual' ? 'mes' : 'semana';
      const freqTxt = n.frecuencia === 'semanal' ? '×4 semanas' : n.frecuencia === 'diario' ? '×22 días' : '';
      const nombre = n.nombre ? `Tarea ${i + 1}: ${n.nombre}` : `Tarea ${i + 1}`;
      return `• ${nombre}: ${n.horas}h/${freq} ${freqTxt} = ${hm}h/mes × ${n.costePorHora}€ = ${cm}€`;
    }).join('\n');

    if (!this.compensa) {
      return `${desglose}\n\n⛔ No compensa. El ahorro total es ${Math.round(this.totalCosteMes)}€/mes. El 33% son ${this.cuota}€, por debajo del mínimo de 99€.\n\nOpciones:\n• Busca más tareas para sumar ahorro\n• Rechaza con honestidad`;
    }

    return `${desglose}\n\n"Dedicáis ${Math.round(this.totalHorasMes)} horas/mes a esto. Os cuesta ${Math.round(this.totalCosteMes)}€/mes en nómina. Son horas que podríais usar para atender mejor a clientes, captar nuevos o simplemente no quedaros hasta las mil. Yo os lo quito de encima por ${this.cuota}€/mes."`;
  }

  toJSON() {
    return {
      id: this.id,
      clienteId: this.clienteId,
      fecha: this.fecha,
      nodos: this.nodos.map(n => n.toJSON()),
      canvasData: this.canvasData,
      notas: this.notas,
      setupHoras: this.setupHoras,
      setupCostePorHora: this.setupCostePorHora,
      setupPrecio: this.setupPrecio
    };
  }

  static fromJSON(data) {
    const a = new Auditoria(data.clienteId);
    a.id = data.id;
    a.fecha = data.fecha;
    a.nodos = data.nodos.map(n => Nodo.fromJSON(n));
    a.canvasData = data.canvasData;
    a.notas = data.notas || '';
    a.setupHoras = data.setupHoras || 0;
    a.setupCostePorHora = data.setupCostePorHora || 30;
    a.setupPrecio = data.setupPrecio !== undefined ? data.setupPrecio : null;
    return a;
  }
}
