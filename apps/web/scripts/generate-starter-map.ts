import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStarterMap, serializeStarterMap } from '../src/engine/starterMapData.ts';

export { generateStarterMap, serializeStarterMap };

export function writeStarterMap(outputPath?: string): string {
  const json = serializeStarterMap();
  const targetPath =
    outputPath ||
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../public/assets/maps/starter.tmj'
    );
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, json, 'utf-8');
  return targetPath;
}

// When executed directly, write the map
if (
  process.argv[1] &&
  (process.argv[1].endsWith('generate-starter-map.ts') ||
    process.argv[1].endsWith('generate-starter-map.js'))
) {
  const file = writeStarterMap();
  console.log(`[StarterMapGenerator] Wrote starter map to: ${file}`);
}
