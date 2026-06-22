export const SettingsErrors = {
  SETTINGS_SCOPE_DENIED: 'No tienes los permisos requeridos para modificar la configuración de este local.',
  SETTINGS_FISCAL_BLOCKED: 'No se pueden modificar las tasas fiscales mientras exista una sesión de caja abierta el día de hoy. Debes cerrar la caja primero.',
  SETTINGS_PASSWORD_INVALID: 'La contraseña actual suministrada es incorrecta.',
  SETTINGS_PASSWORD_WEAK: 'La nueva contraseña no cumple con las políticas de seguridad mínimas (min 8, máx 14, mayúscula, minúscula, número y símbolo).',
  SETTINGS_UPDATE_FAILED: 'Ocurrió un error al actualizar los datos en el servidor.',
  SETTINGS_LOAD_FAILED: 'Error al cargar los datos de configuración. Verifique su conexión.',
} as const;
