import { TestBed } from '@angular/core/testing';
import { BarrasHorizontales, BarrasVerticales, Linea } from './graficos';

describe('gráficos', () => {
  it('barras verticales: la mayor llena el espacio y las demás son proporcionales', () => {
    const f = TestBed.createComponent(BarrasVerticales);
    f.componentRef.setInput('puntos', [
      { etiqueta: 'L', valor: 10 },
      { etiqueta: 'M', valor: 5 },
      { etiqueta: 'X', valor: 0 },
    ]);
    f.detectChanges();
    const barras = [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.bg-primary')];
    expect(barras).toHaveLength(3);
    expect(parseFloat(barras[0].style.height)).toBeCloseTo(82, 0);
    expect(parseFloat(barras[1].style.height)).toBeCloseTo(41, 0);
    expect(parseFloat(barras[2].style.height)).toBe(0);
  });

  it('barras verticales: con todo en cero no divide por cero', () => {
    const f = TestBed.createComponent(BarrasVerticales);
    f.componentRef.setInput('puntos', [{ etiqueta: 'L', valor: 0 }]);
    expect(() => f.detectChanges()).not.toThrow();
  });

  it('barras verticales: etiqueta solo cada N barras y resalta la destacada', () => {
    const f = TestBed.createComponent(BarrasVerticales);
    f.componentRef.setInput('puntos', [0, 1, 2, 3, 4, 5].map((i) => ({ etiqueta: `h${i}`, valor: i, destacado: i === 5 })));
    f.componentRef.setInput('cadaEtiqueta', 3);
    f.detectChanges();
    const etiquetas = [...(f.nativeElement as HTMLElement).querySelectorAll('[aria-hidden="true"] span')].map((e) => e.textContent?.trim());
    expect(etiquetas).toEqual(['h0', '', '', 'h3', '', '']);
    const atenuadas = (f.nativeElement as HTMLElement).querySelectorAll('.opacity-55');
    expect(atenuadas).toHaveLength(5);
  });

  it('barras horizontales: ancho relativo al máximo y mensaje si no hay datos', () => {
    const f = TestBed.createComponent(BarrasHorizontales);
    f.componentRef.setInput('filas', [{ nombre: 'Robo', total: 8 }, { nombre: 'Accidente', total: 2 }]);
    f.detectChanges();
    const anchos = [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.rounded-full > span')].map((s) => parseFloat(s.style.width));
    expect(anchos).toEqual([100, 25]);

    f.componentRef.setInput('filas', []);
    f.componentRef.setInput('vacio', 'Nada que mostrar');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Nada que mostrar');
  });

  it('línea: corta el trazo donde no hay dato y marca solo los días con valor', () => {
    const f = TestBed.createComponent(Linea);
    f.componentRef.setInput('puntos', [
      { etiqueta: '1', valor: 10 },
      { etiqueta: '2', valor: 20 },
      { etiqueta: '3', valor: null },
      { etiqueta: '4', valor: 30 },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('polyline')).toHaveLength(1); // el tramo de 1 punto (día 4) no se dibuja como línea
    expect(el.querySelectorAll('circle')).toHaveLength(3);
  });
});
