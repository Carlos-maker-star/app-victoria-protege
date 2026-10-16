package pe.gob.lavictoria.protege.monitoreo;

/** Zona operativa para dibujar en el mapa. geojson es el poligono como texto GeoJSON. */
public record ZonaResponse(Long id, String nombre, String tipo, String geojson) {
}
