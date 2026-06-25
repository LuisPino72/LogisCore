import { memo } from 'react'

const SvgBebidas = memo(function SvgBebidas(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#E0F7FA" />
      <path
        d="M30 18h12v4l3 6v28a4 4 0 01-4 4H31a4 4 0 01-4-4V28l3-6v-4z"
        fill="#00ACC1"
        stroke="#00838F"
        strokeWidth="1.5"
      />
      <rect x="28" y="16" width="16" height="4" rx="1" fill="#00838F" />
      <ellipse cx="36" cy="38" rx="5" ry="3" fill="#B2EBF2" opacity="0.6" />
      <path d="M33 22h6" stroke="#E0F7FA" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
})

const SvgComida = memo(function SvgComida(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#FFF8E1" />
      <ellipse cx="36" cy="42" rx="18" ry="14" fill="#FFB74D" stroke="#F57C00" strokeWidth="1.5" />
      <ellipse cx="36" cy="40" rx="14" ry="10" fill="#FFE0B2" />
      <path
        d="M36 20v8M32 20c0 4 4 8 4 8s4-4 4-8"
        stroke="#8D6E63"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="38" r="2" fill="#F57C00" opacity="0.5" />
    </svg>
  )
})

const SvgLacteos = memo(function SvgLacteos(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#E8EAF6" />
      <rect x="24" y="22" width="24" height="32" rx="3" fill="#5C6BC0" stroke="#3949AB" strokeWidth="1.5" />
      <rect x="24" y="22" width="24" height="8" rx="3" fill="#3949AB" />
      <rect x="28" y="34" width="16" height="10" rx="2" fill="#C5CAE9" />
      <path d="M30 38h12" stroke="#3949AB" strokeWidth="1" strokeLinecap="round" />
      <path d="M33 42h6" stroke="#3949AB" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
})

const SvgLimpieza = memo(function SvgLimpieza(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#E8F5E9" />
      <rect x="30" y="16" width="12" height="20" rx="3" fill="#66BB6A" stroke="#43A047" strokeWidth="1.5" />
      <rect x="28" y="36" width="16" height="4" rx="1" fill="#43A047" />
      <path d="M36 40v14" stroke="#81C784" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 54h8" stroke="#81C784" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="24" r="2" fill="#E8F5E9" opacity="0.8" />
      <circle cx="33" cy="28" r="1.5" fill="#E8F5E9" opacity="0.6" />
    </svg>
  )
})

const SvgGeneral = memo(function SvgGeneral(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#ECEFF1" />
      <rect x="20" y="24" width="32" height="28" rx="3" fill="#90A4AE" stroke="#607D8B" strokeWidth="1.5" />
      <path d="M20 32h32" stroke="#607D8B" strokeWidth="1.5" />
      <path d="M36 24v8" stroke="#607D8B" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M28 44h16" stroke="#B0BEC5" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M28 48h10" stroke="#B0BEC5" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="32" y="20" width="8" height="4" rx="1" fill="#607D8B" />
    </svg>
  )
})

const SvgMascotas = memo(function SvgMascotas(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" {...props}>
      <rect width="72" height="72" rx="12" fill="#F3E5F5" />
      <ellipse cx="36" cy="44" rx="10" ry="8" fill="#AB47BC" stroke="#8E24AA" strokeWidth="1.5" />
      <circle cx="28" cy="30" r="4" fill="#CE93D8" stroke="#8E24AA" strokeWidth="1.5" />
      <circle cx="44" cy="30" r="4" fill="#CE93D8" stroke="#8E24AA" strokeWidth="1.5" />
      <circle cx="22" cy="38" r="3" fill="#CE93D8" stroke="#8E24AA" strokeWidth="1.5" />
      <circle cx="50" cy="38" r="3" fill="#CE93D8" stroke="#8E24AA" strokeWidth="1.5" />
      <circle cx="33" cy="42" r="1.5" fill="#E1BEE7" />
      <circle cx="39" cy="42" r="1.5" fill="#E1BEE7" />
    </svg>
  )
})

export const CATEGORY_SVG_MAP: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'bebidas': SvgBebidas,
  'lacteos': SvgLacteos,
  'carnes': SvgComida,
  'panaderia': SvgComida,
  'frutas y verduras': SvgComida,
  'snacks': SvgGeneral,
  'abarrotes': SvgGeneral,
  'limpieza': SvgLimpieza,
  'higiene': SvgLimpieza,
  'electronica': SvgGeneral,
  'mascotas': SvgMascotas,
  'bebes': SvgGeneral,
  'generico': SvgGeneral,
}

function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function getCategorySvg(categoryName: string | null | undefined): React.FC<React.SVGProps<SVGSVGElement>> | null {
  if (!categoryName) return null
  const normalized = normalizeCategoryName(categoryName)
  const entry = Object.entries(CATEGORY_SVG_MAP).find(
    ([key]) => normalizeCategoryName(key) === normalized
  )
  return entry ? entry[1] : null
}
