/**
 * Nodo — Representa un paso en el proceso del cliente.
 * 
 * Tipos:
 *   - 'disparador': Lo que inicia el proceso (email llega, cliente pide, etc.)
 *   - 'app': Herramienta que usan (Gmail, Excel, Factusol, TPV...)
 *   - 'manual': Cuello de botella humano (donde está el dinero)
 */
export class Nodo {
  constructor(tipo, nombre = '') {
    this.id = Date.now() + Math.random().toString(36).substr(2, 5);
    this.tipo = tipo; // 'disparador' | 'app' | 'manual'
    this.nombre = nombre;

    // Solo relevante para nodos manuales
    this.descripcion = '';
    this.horas = 0;
    this.costePorHora = 14;
    this.frecuencia = 'semanal'; // 'diario' | 'semanal' | 'mensual'
    this.estado = 'pendiente'; // legacy
    this.solucion = 'directo'; // 'directo' | 'conCambio'
    this.sugerencia = ''; // Solo si solucion === 'conCambio'
    this.setupHoras = 0; // Horas para implementar el cambio
    this.setupCostePorHora = 30; // €/h del setup
    this.setupPrecio = null; // null = auto, 0 = gratis, N = precio fijo
    this.setupQuien = 'cliente'; // 'cliente' | 'yo'
  }

  get multiplicador() {
    const mults = { diario: 22, semanal: 4.33, mensual: 1 };
    return mults[this.frecuencia] || 4.33;
  }

  get horasMes() {
    return this.horas * this.multiplicador;
  }

  get costeMes() {
    return this.horasMes * this.costePorHora;
  }

  get esManual() {
    return this.tipo === 'manual';
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

  toJSON() {
    return {
      id: this.id,
      tipo: this.tipo,
      nombre: this.nombre,
      descripcion: this.descripcion,
      horas: this.horas,
      costePorHora: this.costePorHora,
      frecuencia: this.frecuencia,
      solucion: this.solucion,
      sugerencia: this.sugerencia,
      setupHoras: this.setupHoras,
      setupCostePorHora: this.setupCostePorHora,
      setupPrecio: this.setupPrecio,
      setupQuien: this.setupQuien
    };
  }

  static fromJSON(data) {
    const n = new Nodo(data.tipo, data.nombre);
    Object.assign(n, data);
    return n;
  }
}
