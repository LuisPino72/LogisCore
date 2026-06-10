# RecipeForm Wizard — Diseño

> **Fecha:** 2026-06-09
> **Estado:** Aprobado por Luis
> **Módulo:** Production — RecipeForm.tsx + useRecipeForm.ts

---

## 1. Problema

El formulario de creación de recetas (`RecipeForm.tsx`, 464 líneas) muestra todos los campos simultáneamente: nombre, selector de producto (con mini-form de creación), modo Lote/Ensamblaje, merma %, cantidad producida, unidad, lista de ingredientes con add/remove, notas, y preview de desglose. Esto genera:

- **Sobrecarga cognitiva** para el bodeguero (8+ campos visibles a la vez)
- **Experiencia móvil deficiente** — el modal es largo y requiere scroll excesivo
- **Confusión** sobre qué campos son obligatorios vs opcionales

## 2. Solución

Convertir el `RecipeForm` en un **wizard de 3 pasos** con progreso visual, validación por paso, y navegación Atrás/Siguiente.

## 3. Diseño por Paso

### Paso 1 — Info Básica

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| Nombre de receta | Input text | Sí | max 25 chars, placeholder "Ej: Pan de Molde" |
| Producto que se crea | SearchableSelect | Sí | Opción "+ Crear nuevo producto terminado" como primera opción |
| Mini-form "Crear nuevo" | Card desplegable | Condicional | Solo si elige "Crear nuevo": nombre, SKU, precio, categoría |
| Modo | Toggle button | Sí | Lote (default) / Ensamblaje |

**Validaciones del Paso 1:**
- Nombre: requerido, máx 25 chars
- Producto: requerido (o campos del mini-form si "Crear nuevo")
- Si "Crear nuevo": nombre producto (req, máx 25), SKU (req, máx 18), precio (> 0)

### Paso 2 — Ingredientes

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| Lista de ingredientes | Card[] | Sí | Mínimo 1 ingrediente |
| Ingrediente | SearchableSelect | Sí | Filtrado por materia_prima / both |
| Sub-receta badge | Badge | Auto | Si el ingrediente es producto_terminado |
| Cantidad | Input number | Sí | > 0, máx 99999, step 0.01 |
| Unidad | Select | Sí | g / ml / unidad |
| Botón eliminar | Trash icon | — | Por cada ingrediente |
| Botón "+ Agregar" | Button ghost | — | Agrega nueva línea |
| Preview desglose | Collapsable | — | Botón "Ver desglose" si hay ingredientes |

**Validaciones del Paso 2:**
- Al menos 1 ingrediente
- Cada ingrediente: productId requerido, quantity > 0
- Sin duplicados (mismo productId)
- Sin ciclos (validateCycles)

### Paso 3 — Configuración + Confirmar

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| Merma % | Input number | No | Default 0, rango 0-100 |
| Cantidad producida | Input number | Sí | Default 1, > 0 |
| Unidad | Select | Sí | unidad / kg / lt |
| Notas | Input text | No | máx 25 chars, placeholder "Instrucciones..." |
| Resumen | Card informativo | — | Nombre, modo, # ingredientes, rendimiento |

**Validaciones del Paso 3:**
- Cantidad producida > 0
- Merma entre 0 y 100
- Si modo = Ensamblaje: cantidad producida forzada a 1, unidad forzada a "unidad"

## 4. UX Details

### Progress Bar
- Barra visual en la parte superior del modal: `● ─── ○ ─── ○` (3 puntos conectados)
- Paso actual en color primario, pasos completados en gris, pendientes en outline
- Texto debajo: "Paso 1 de 3 — Info básica"

### Navegación
- **Footer del modal**: Botón "Atrás" (ghost, solo pasos 2-3) + Botón "Siguiente" (primary) / "Crear Receta" (paso 3)
- **Escape key**: cierra el modal (comportamiento actual del Modal)
- **Click fuera**: no cierra (por seguridad, ya hay botón Cancelar)

### Validación por Paso
- Al tocar "Siguiente", se validan SOLO los campos del paso actual
- Si hay errores, se muestran inline y NO se avanza
- Los errores se limpian al corregir el campo

### Responsive
- **Mobile (< 640px)**: cada paso ocupa el 100% del modal body, inputs a ancho completo
- **Desktop (≥ 640px)**: mismo layout pero con más padding y campos lado a lado donde aplique

### Comportamiento Especial
- **Modo Ensamblaje**: en Paso 3, ocultar "Cantidad producida" y "Unidad" (siempre es 1 unidad)
- **Editar receta**: wizard inicia en Paso 1 con datos precargados
- **Crear nuevo producto**: mini-form inline en Paso 1, no afecta pasos siguientes

## 5. Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `RecipeForm.tsx` | Reescritura completa: wizard de 3 pasos con progress bar |
| `useRecipeForm.ts` | Agregar estado `currentStep`, funciones `nextStep()`, `prevStep()`, validación por paso |

**NO se modifican:**
- `productionService.ts` — lógica de guardado sin cambios
- `productionStore.ts` — store sin cambios
- `ProductionPage.tsx` — PAGE sin cambios
- Validaciones existentes — se preservan todas

## 6. Validaciones Existentes que se Preservan

Todas las validaciones de `useRecipeForm.ts` línea 104-156 se mantienen:
- Nombre: requerido, máx 25
- Producto: requerido (o mini-form completo)
- Yield: > 0
- Merma: 0-100
- Líneas: mínimo 1, sin duplicados, sin ciclos
- Cada línea: productId requerido, quantity > 0, máx 99999

**Validación adicional:**
- Se valida por paso (no al final), dando feedback inmediato al bodeguero

## 7. No Hacer

- ❌ No agregar pasos extra (mantener en 3)
- ❌ No cambiar la lógica de guardado (createRecipe/updateRecipe)
- ❌ No modificar otros componentes de producción
- ❌ No agregar nuevos campos al formulario
- ❌ No eliminar validaciones existentes
