#!/usr/bin/env node
/*
 * Descarga los contratos OpenAPI del backend en marcha y los guarda en docs/api/.
 *   node docs/api/exportar-openapi.mjs [urlBase]      (por defecto http://localhost:8080)
 * Genera openapi-movil.json (apps) y openapi-web.json (central y administración).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:8080';
const carpeta = dirname(fileURLToPath(import.meta.url));

for (const grupo of ['movil', 'web']) {
  const r = await fetch(`${base}/v3/api-docs/${grupo}`);
  if (!r.ok) {
    console.error(`No pude descargar el grupo "${grupo}" (HTTP ${r.status}). ¿Está el backend en marcha y con APP_DOCS=true?`);
    process.exit(1);
  }
  const doc = await r.json();
  doc.servers = [{ url: 'http://localhost:8080', description: 'Desarrollo local' }];
  const ruta = join(carpeta, `openapi-${grupo}.json`);
  writeFileSync(ruta, JSON.stringify(doc, null, 2) + '\n');
  console.log(`openapi-${grupo}.json: ${Object.keys(doc.paths).length} rutas`);
}
