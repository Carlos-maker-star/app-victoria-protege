/*
 * Clave comun de los usuarios de prueba. No esta en el repositorio: se lee de la variable de entorno SEED_PASSWORD
 * o, si no existe, de `app.seed.password` en backend/src/main/resources/application-local.properties.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function claveDePrueba() {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD;
  const archivo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'src', 'main', 'resources', 'application-local.properties');
  try {
    return readFileSync(archivo, 'utf8').match(/^app\.seed\.password=(.*)$/m)[1].trim();
  } catch {
    throw new Error('No encuentro la clave de prueba: define SEED_PASSWORD o app.seed.password en application-local.properties.');
  }
}
