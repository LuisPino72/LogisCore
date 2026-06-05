import { describe, expect, it } from 'vitest';
import { applyIsRawMaterialChange } from '../../features/inventory/hooks/productFormHelpers';

describe('DINERO-005 (C5): applyIsRawMaterialChange fuerza isSellable=false', () => {
  it('Given: formData { isRawMaterial: false, isSellable: true }. When: applyIsRawMaterialChange(true). Then: isSellable=false', () => {
    const result = applyIsRawMaterialChange(
      { isRawMaterial: false, isSellable: true },
      true,
    );
    expect(result.isRawMaterial).toBe(true);
    expect(result.isSellable).toBe(false);
  });

  it('Given: formData { isRawMaterial: true, isSellable: false }. When: applyIsRawMaterialChange(false). Then: productionType=undefined, isSellable se queda en false', () => {
    const result = applyIsRawMaterialChange(
      { isRawMaterial: true, isSellable: false, productionType: 'interno' },
      false,
    );
    expect(result.isRawMaterial).toBe(false);
    expect(result.productionType).toBeUndefined();
    expect(result.isSellable).toBe(false);
  });

  it('Given: formData materia_prima con isSellable=true (estado inconsistente). When: applyIsRawMaterialChange(true). Then: corrige a isSellable=false', () => {
    const result = applyIsRawMaterialChange(
      { isRawMaterial: true, isSellable: true },
      true,
    );
    expect(result.isSellable).toBe(false);
  });
});
