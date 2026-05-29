# Branching Strategy — LogisCore ERP

## Ramas

| Rama | Propósito | Se despliega en |
|------|-----------|-----------------|
| `main` | Versión estable, producción | Vercel (producción) |
| `develop` | Desarrollo activo, integración | Vercel (preview) |
| `feature/*` | Features nuevas | PR → develop |
| `fix/*` | Bugs fixes | PR → develop o main (hotfix) |

## Flujo

```
main (producción estable)
  │
  ├── develop (desarrollo activo)
  │     │
  │     ├── feature/nombre-feature
  │     │     └── PR → develop
  │     │
  │     └── fix/nombre-bug
  │           └── PR → develop
  │
  └── fix/hotfix-critico
        └── PR → main + develop
```

## Reglas

1. **Nunca hacer commit directo en `main`** — siempre pasar por PR
2. **`develop` es la rama de integración** — todo feature pasa por aquí primero
3. **Hotfixes** se ramifican de `main`, se mergean a ambos (`main` y `develop`)
4. **Feature branches** se ramifican de `develop` y se mergean de vuelta a `develop`
5. **Antes de mergear** — verificar que TypeScript compile y no hay errores de lint

## Vercel

- **Production Branch:** `main`
- **Preview Branch:** `develop`
- Cada PR a `develop` genera un deploy de preview automáticamente
- Cada merge a `main` genera un deploy a producción

## Versionado

- Usar [Conventional Commits](https://www.conventionalcommits.org/) para mensajes de commit:
  - `feat:` nueva feature
  - `fix:` bug fix
  - `chore:` tareas de mantenimiento
  - `docs:` documentación
  - `refactor:` refactoring sin cambio de comportamiento
