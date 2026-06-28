export const PermissionMessages: Record<string, string> = {
  'inventory:create': 'No tienes permiso para crear productos.',
  'inventory:read': 'No tienes permiso para ver el inventario.',
  'inventory:update': 'No tienes permiso para editar productos.',
  'inventory:delete': 'No tienes permiso para eliminar productos.',
  'inventory:adjust_stock': 'No tienes permiso para ajustar el stock.',
  'inventory:import_csv': 'No tienes permiso para importar productos.',
  'inventory:manage_categories': 'No tienes permiso para gestionar categorías.',
  'inventory:manage_library': 'No tienes permiso para gestionar la biblioteca de imágenes.',

  'production:create': 'No tienes permiso para crear recetas.',
  'production:read': 'No tienes permiso para ver la producción.',
  'production:update': 'No tienes permiso para editar recetas.',
  'production:delete': 'No tienes permiso para eliminar recetas.',
  'production:produce_batch': 'No tienes permiso para producir lotes.',

  'purchases:create': 'No tienes permiso para crear órdenes de compra.',
  'purchases:read': 'No tienes permiso para ver las compras.',
  'purchases:update': 'No tienes permiso para editar órdenes de compra.',
  'purchases:delete': 'No tienes permiso para eliminar órdenes de compra.',
  'purchases:receive_order': 'No tienes permiso para recibir órdenes.',
  'purchases:pay_debt': 'No tienes permiso para pagar deudas a proveedores.',

  'pos:create': 'No tienes permiso para crear ventas.',
  'pos:read': 'No tienes permiso para ver el historial de ventas.',
  'pos:update': 'No tienes permiso para editar ventas.',
  'pos:delete': 'No tienes permiso para eliminar ventas.',
  'pos:void_sale': 'No tienes permiso para anular ventas.',
  'pos:open_box': 'No tienes permiso para abrir caja.',
  'pos:close_box': 'No tienes permiso para cerrar caja.',
  'pos:apply_discount': 'No tienes permiso para aplicar descuentos.',
  'pos:manager_close': 'No tienes permiso para cierre gerencial de caja.',
  'pos:manage_registers': 'No tienes permiso para gestionar cajas registradoras.',

  'customers:create': 'No tienes permiso para crear clientes.',
  'customers:read': 'No tienes permiso para ver clientes.',
  'customers:update': 'No tienes permiso para editar clientes.',
  'customers:delete': 'No tienes permiso para eliminar clientes.',
  'customers:collect_debt': 'No tienes permiso para cobrar créditos.',

  'gastos:create': 'No tienes permiso para crear gastos.',
  'gastos:read': 'No tienes permiso para ver gastos.',
  'gastos:update': 'No tienes permiso para editar gastos.',
  'gastos:delete': 'No tienes permiso para eliminar gastos.',

  'reports:read': 'No tienes permiso para ver reportes.',
  'reports:export': 'No tienes permiso para exportar reportes.',
  'reports:view_financials': 'No tienes permiso para ver información financiera.',

  'exchange:update': 'No tienes permiso para cambiar la tasa de cambio.',

  'settings:manage': 'No tienes permiso para modificar la configuración del negocio.',

  'dashboard:read': 'No tienes permiso para ver el dashboard.',
} as const;

export function getPermissionMessage(module: string, action: string): string {
  return PermissionMessages[`${module}:${action}`]
    || `No tienes permiso para realizar esta acción (${module}:${action}).`;
}
