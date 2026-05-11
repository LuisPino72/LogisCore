#!/usr/bin/env node
// Crea un nuevo PLAN-{ID} a partir de la plantilla en Memoria/PROYECTO/Temp/PLAN-TEMPLATE
// Uso: node scripts/create-plan.mjs <PLAN-ID>
import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const templateDir = path.join(root, 'Memoria', 'PROYECTO', 'Temp', 'PLAN-TEMPLATE');
const tempDir = path.join(root, 'Memoria', 'PROYECTO', 'Temp');

function usage(){
  console.log('Uso: node scripts/create-plan.mjs <PLAN-ID>');
  console.log('Ej: node scripts/create-plan.mjs PLAN-20260510-001');
}

async function exists(p){
  try{ await fs.access(p); return true;}catch(e){return false}
}

async function copyRecursive(src, dest, replacements){
  const stat = await fs.stat(src);
  if(stat.isDirectory()){
    await fs.mkdir(dest, { recursive: true });
    const items = await fs.readdir(src);
    for(const it of items){
      await copyRecursive(path.join(src,it), path.join(dest,it), replacements);
    }
  } else {
    let content = await fs.readFile(src, 'utf8');
    // Replace placeholders in file content
    for(const [k,v] of Object.entries(replacements)){
      content = content.split(k).join(v);
    }
    await fs.writeFile(dest, content, 'utf8');
  }
}

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length < 1){ usage(); process.exit(1); }
  const planId = argv[0];
  if(!/^PLAN-/i.test(planId)){
    console.error('El PLAN-ID debe comenzar con "PLAN-"');
    process.exit(1);
  }

  const targetDir = path.join(tempDir, planId);
  if(await exists(targetDir)){
    console.error('Ya existe el directorio', targetDir);
    process.exit(1);
  }
  if(!(await exists(templateDir))){
    console.error('Plantilla no encontrada en', templateDir);
    process.exit(1);
  }

  const replacements = {
    'PLAN-{ID}': planId,
    'PLAN-{id}': planId,
  };

  await copyRecursive(templateDir, targetDir, replacements);
  console.log('Plan creado en:', targetDir);
  console.log('Recuerde editar {SPEC-ID} y otros placeholders dentro del plan.');
}

main().catch(err=>{ console.error(err); process.exit(2); });
