# Spec: Mobile Keyboard Fix + Dashboard Responsive Redesign

**Fecha:** 2026-06-15
**Estado:** Aprobado por Luis
**Sesión:** 133

## Resumen

Tres partes: (1) Sistema global de teclado virtual para que el contenido suba cuando se abra el teclado, (2) inputMode/autocomplete/enterKeyHint universal en todos los formularios, (3) Rediseño completo del Dashboard con grid adaptativo y container queries.

## Parte 1: Sistema Global de Teclado Virtual

### 1.1 Meta tag `interactive-widget`

**Archivo:** `apps/web/index.html`

Cambiar el viewport meta tag a:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />
```

Chrome 108+ (Android) reduce el viewport cuando el teclado se abre. iOS lo ignora (se maneja por JS).

### 1.2 Hook `useKeyboardLayout`

**Archivo nuevo:** `apps/web/src/hooks/useKeyboardLayout.ts`

- Detecta mobile: `window.innerWidth < 768 || navigator.maxTouchPoints > 0`
- Escucha `visualViewport.resize` y `visualViewport.scroll`
- Calcula `keyboardHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop`
- Si `keyboardHeight > 150px` → teclado abierto
- Actualiza CSS variable `--kb-height` en `document.documentElement`
- Retorna `{ isKeyboardOpen, keyboardHeight, contentStyle }`
- En desktop, retorna valores por defecto (0, false)

### 1.3 Integración en AppShell

**Archivo:** `apps/web/src/common/components/AppShell.tsx`

El div de contenido principal aplicará:
```css
padding-bottom: calc(var(--kb-height, 0px) + env(safe-area-inset-bottom, 0px))
```

### 1.4 Simplificar Modal.tsx

**Archivo:** `apps/web/src/common/components/Modal.tsx`

Reemplazar la lógica manual de `useVisualViewport` con `useKeyboardLayout` para consistencia.

## Parte 2: InputMode Universal

### Campos que necesitan `inputMode="decimal"`
- `ProductForm.tsx`: priceUsd, costPrice, priceBs
- `RecipeForm.tsx`: costos de ingredientes
- `PurchasePage.tsx`: cantidades, precios

### Campos que necesitan `inputMode="tel"`
- `CustomerForm.tsx`: teléfono
- `EmployeeForm.tsx`: teléfono
- `SupplierForm.tsx`: teléfono

### Campos que necesitan `inputMode="numeric"`
- `SupplierForm.tsx`: RIF dígitos

### Campos que necesitan `inputMode="search"`
- `SearchInput.tsx`: búsqueda general

### `enterKeyHint` universal
- SearchInput: `"search"`
- Último campo de form: `"done"`
- Campos con siguiente campo: `"next"`

### `autocomplete` en formularios
- CustomerForm/EmployeeForm nombre: `"name"`
- Teléfono: `"tel"`
- Dirección: `"street-address"`

## Parte 3: Dashboard Responsive

### 3.1 Grid con Container Queries

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(1rem, 0.8rem + 1vw, 1.5rem);
}

@container (min-width: 640px) {
  .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
}

@container (min-width: 1024px) {
  .dashboard-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### 3.2 Layout propuesto

```
Mobile (<640px):
[WelcomeBanner]
[PwaInstallBanner]
[Ganancias Hoy]
[Top Productos]
[Stock Bajo]

Tablet (640-1023px):
[WelcomeBanner]
[PwaInstallBanner]
[Ganancias Hoy | Top Productos]
[Stock Bajo]

Desktop (>1024px):
[WelcomeBanner]
[PwaInstallBanner]
[Ganancias Hoy | Top Productos | Stock Bajo]
```

### 3.3 Fluid typography
- Título welcome: `clamp(1.25rem, 1rem + 2vw, 2rem)`
- Monto KPI: `clamp(1.5rem, 1rem + 3vw, 2.5rem)`

### 3.4 Touch targets
- Todos los botones interactivos: `min-height: 44px; min-width: 44px`
- Botón compra en low stock: usar clase `btn-icon` o padding explícito

### 3.5 Overflow fixes
- Low stock card: `flex-wrap: nowrap` en mobile
- Nombres: `truncate` con `min-w-0` (ya existe)

## Verificación

1. Android Chrome: input numérico muestra teclado numérico
2. Android Chrome: modal contenido sube con teclado
3. iOS Safari: mismo test via useKeyboardLayout
4. Dashboard desktop: grid 3 cols >1024px
5. Dashboard tablet: grid 2 cols 640-1023px
6. Dashboard mobile: single-column, touch targets 44px
7. Lint + tsc sin errores
