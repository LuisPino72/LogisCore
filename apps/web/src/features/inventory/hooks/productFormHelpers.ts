/**
 * DINERO-005 (C5): Helpers puros para useProductForm.
 * Materia prima fuerza isSellable=false (no se vende directo, solo se usa en producción).
 */

export interface IsRawMaterialFormData {
  isRawMaterial: boolean;
  isSellable: boolean;
  productionType?: string;
}

export function applyIsRawMaterialChange(
  formData: IsRawMaterialFormData,
  value: boolean,
): IsRawMaterialFormData {
  if (value === true) {
    return { ...formData, isRawMaterial: true, isSellable: false };
  }
  return { ...formData, isRawMaterial: false, productionType: undefined };
}
