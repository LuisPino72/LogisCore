#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function toUpperSnakeCase(name) {
  return name.replace(/-/g, '_').toUpperCase();
}

function toTitleCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Uso: node scripts/new-module.mjs <nombre-modulo>');
    console.error('Ejemplo: node scripts/new-module.mjs clientes');
    process.exit(1);
  }

  const moduleName = args[0].toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(moduleName)) {
    console.error('Error: El nombre del módulo solo puede contener minúsculas, números y guiones. Debe empezar con letra.');
    process.exit(1);
  }

  const upperName = toUpperSnakeCase(moduleName);
  const titleName = toTitleCase(moduleName);

  const specDir = path.join(ROOT, 'apps', 'web', 'src', 'specs', moduleName);
  const testFile = path.join(ROOT, 'tests', 'specs', `${moduleName}.spec.ts`);

  if (fs.existsSync(specDir)) {
    console.error(`Error: Ya existe ${specDir}`);
    process.exit(1);
  }
  if (fs.existsSync(testFile)) {
    console.error(`Error: Ya existe ${testFile}`);
    process.exit(1);
  }

  fs.mkdirSync(specDir, { recursive: true });

  const errorsContent = `export const ${upperName}Errors = {\n  ${upperName}_ERROR_EXAMPLE: '${upperName}_ERROR_EXAMPLE',\n} as const;\n`;
  fs.writeFileSync(path.join(specDir, 'errors.ts'), errorsContent);

  const indexContent = `// ${titleName} Spec - ${upperName}-001..N
import { z } from 'zod';

// export const EjemploSchema = z.object({
//   id: z.string().uuid(),
//   tenantId: z.string().uuid(),
//   createdAt: z.string().datetime(),
// });
// export type Ejemplo = z.infer<typeof EjemploSchema>;
`;
  fs.writeFileSync(path.join(specDir, 'index.ts'), indexContent);

  const schemaContent = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "${titleName} Schema",
  "definitions": {}
}
`;
  fs.writeFileSync(path.join(specDir, 'schema.json'), schemaContent);

  const testContent = `/**
 * ${titleName} BDD Tests - ${upperName}-001..N
 */

import { describe, it, expect } from 'vitest';

describe('${upperName}-001: Descripción del primer comportamiento', () => {
  describe('Caso exitoso', () => {
    it('Given: <condición inicial>, When: <acción>, Then: <resultado esperado>', () => {
      expect(true).toBe(true);
    });
  });

  describe('Caso de error', () => {
    it('Given: <condición inicial>, When: <acción>, Then: <código de error esperado>', () => {
      expect(true).toBe(true);
    });
  });
});
`;
  fs.writeFileSync(testFile, testContent);

  console.log(`✅ Módulo "${moduleName}" creado exitosamente.`);
  console.log(`📁 ${specDir}`);
  console.log(`📁 ${testFile}`);
  console.log('');
  console.log('📝 Recuerda:');
  console.log(`  1. Agregar los códigos de error en ${specDir}/errors.ts`);
  console.log(`  2. Definir schemas Zod en ${specDir}/index.ts`);
  console.log(`  3. Registrar en Memoria/PROYECTO/Reglas/Validaciones.md`);
  console.log(`  4. Escribir los tests BDD en ${testFile}`);
}

main();
