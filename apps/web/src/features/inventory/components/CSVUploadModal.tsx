import { useState, useRef, useCallback } from 'react';
import { Button, Modal, Badge, Input, Select } from '../../../common/components';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Loader2, Download, Plus, Trash2, ArrowLeft, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { parseCsvFile, validateCsvRows, importProductsFromCsv, validateRow, type CsvRow, type ImportResult, type ImportSummary } from '../services/csvImportService';

function downloadCsvTemplate() {
  const headers = 'nombre,sku,tipo,precio,costo,stock,stock_min,categoria,pesable,unidad,iva,vendible,pres_nombre,pres_precio,pres_multiplicador,pres_codigo_barras';
  const example1 = 'Arroz Premium,ARR001,resale,2.00,1.00,100,10,víveres,si,kg,si,si,,,,';
  const example2 = 'Aceite Vegetal,ACE002,resale,3.75,2.10,50,5,víveres,si,lt,si,si,,,,';
  const example3 = 'Leche,LEC001,resale,2.50,1.80,100,10,Lácteos,no,unidad,si,si,250ml,2.50,1,7591234567890';
  const example4 = 'Leche,LEC001,resale,2.50,1.80,100,10,Lácteos,no,unidad,si,si,500ml,4.00,2,7591234567891';
  const example5 = 'Harina,HAR001,materia_prima,,0.80,500,50,Básicos,si,kg,no,no,,,,';
  const csvContent = `${headers}\n${example1}\n${example2}\n${example3}\n${example4}\n${example5}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-productos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  userId: string;
  onImported: () => void;
}

type Step = 'upload' | 'preview' | 'editing' | 'importing' | 'result';

const EMPTY_ROW: CsvRow = {
  nombre: '',
  sku: '',
  tipo: '',
  precio: '',
  costo: '',
  stock: '',
  stock_min: '',
  categoria: '',
  pesable: '',
  unidad: '',
  iva: '',
  vendible: '',
  pres_nombre: '',
  pres_precio: '',
  pres_multiplicador: '',
  pres_codigo_barras: '',
};

export function CSVUploadModal({ isOpen, onClose, tenantId, userId, onImported }: CSVUploadModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColumnGuide, setShowColumnGuide] = useState(false);

  const [editingRows, setEditingRows] = useState<CsvRow[]>([]);
  const [editingOriginalIndices, setEditingOriginalIndices] = useState<Map<number, number>>(new Map());
  const [editingErrors, setEditingErrors] = useState<Record<number, ValidationError[]>>({});

  const reset = useCallback(() => {
    setStep('upload');
    setParsedRows([]);
    setResults([]);
    setSummary(null);
    setLoading(false);
    setError(null);
    setFileName('');
    setEditingRows([]);
    setEditingOriginalIndices(new Map());
    setEditingErrors({});
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileSelect = useCallback(async (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setError(null);

    const result = await parseCsvFile(file);
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    const validationResults = await validateCsvRows(result.data, tenantId);
    setParsedRows(result.data);
    setResults(validationResults);
    setLoading(false);
    setStep('preview');
  }, [tenantId]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    const validRows = parsedRows.filter((_, i) => results[i]?.status === 'valid');
    if (validRows.length === 0) return;

    setStep('importing');
    setLoading(true);
    setImportProgress({ done: 0, total: validRows.length });

    const importSummary = await importProductsFromCsv(validRows, tenantId, userId);
    setImportProgress({ done: validRows.length, total: validRows.length });
    setSummary(importSummary);
    setLoading(false);
    setStep('result');
    onImported();
  }, [parsedRows, results, tenantId, userId, onImported]);

  const handleEditErrors = useCallback(() => {
    const errorIndices: number[] = [];
    results.forEach((r, i) => {
      if (r.status === 'error') errorIndices.push(i);
    });
    const rows = errorIndices.map((i) => ({ ...parsedRows[i] }));
    const indexMap = new Map<number, number>();
    errorIndices.forEach((origIdx, editingIdx) => { indexMap.set(editingIdx, origIdx); });
    setEditingRows(rows);
    setEditingOriginalIndices(indexMap);
    setEditingErrors({});
    setStep('editing');
  }, [parsedRows, results]);

  const validateEditingRow = useCallback((row: CsvRow, index: number) => {
    const errs = validateRow(row, index);
    setEditingErrors((prev) => {
      const next = { ...prev };
      if (errs.length > 0) {
        next[index] = errs;
      } else {
        delete next[index];
      }
      return next;
    });
    return errs;
  }, []);

  const updateEditRow = useCallback((index: number, field: keyof CsvRow, value: string) => {
    setEditingRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleBlurValidate = useCallback((index: number) => {
    setEditingRows((prev) => {
      validateEditingRow(prev[index], index);
      return prev;
    });
  }, [validateEditingRow]);

  const deleteEditRow = useCallback((index: number) => {
    setEditingRows((prev) => prev.filter((_, i) => i !== index));
    setEditingOriginalIndices((prev) => {
      const next = new Map<number, number>();
      prev.forEach((origIdx, editIdx) => {
        if (editIdx < index) next.set(editIdx, origIdx);
        else if (editIdx > index) next.set(editIdx - 1, origIdx);
      });
      return next;
    });
    setEditingErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      const reindexed: Record<number, ValidationError[]> = {};
      Object.keys(next).forEach((key) => {
        const oldIdx = parseInt(key);
        if (oldIdx > index) {
          reindexed[oldIdx - 1] = next[oldIdx];
        } else {
          reindexed[oldIdx] = next[oldIdx];
        }
      });
      return reindexed;
    });
  }, []);

  const addEditRow = useCallback(() => {
    setEditingRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }, []);

  const handleSaveEdits = useCallback(async () => {
    let allValid = true;
    const newErrors: Record<number, ValidationError[]> = {};

    editingRows.forEach((row, i) => {
      const errs = validateEditingRow(row, i);
      if (errs.length > 0) {
        allValid = false;
        newErrors[i] = errs;
      }
    });

    setEditingErrors(newErrors);
    if (!allValid) return;

    const validEditingRows = editingRows.filter((row) => {
      return row.nombre?.trim() && row.sku?.trim() && row.precio?.trim();
    });

    const nonErrorIndices: number[] = [];
    results.forEach((r, i) => {
      if (r.status !== 'error') nonErrorIndices.push(i);
    });

    const keptRows = nonErrorIndices.map((i) => parsedRows[i]);
    const newParsedRows = [...keptRows, ...validEditingRows];

    setParsedRows(newParsedRows);
    const validationResults = await validateCsvRows(newParsedRows, tenantId);
    setResults(validationResults);
    setEditingRows([]);
    setEditingOriginalIndices(new Map());
    setEditingErrors({});
    setStep('preview');
  }, [editingRows, parsedRows, results, tenantId, validateEditingRow]);

  const validCount = results.filter((r) => r.status === 'valid').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const duplicateCount = results.filter((r) => r.status === 'duplicate').length;
  const previewRows = parsedRows.slice(0, 5);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar productos CSV" size="lg">
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="relative border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer overflow-hidden"
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, rgba(13,148,136,0.1) 0px, rgba(13,148,136,0.1) 1px, transparent 1px, transparent 20px)`,
              }}
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-primary animate-spin" />
                <p className="text-sm text-gray-500">Procesando archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 relative">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center pwa-icon-bounce">
                  <Upload size={24} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Arrastra un archivo CSV aquí</p>
                  <p className="text-xs text-gray-500 mt-1">o haz clic para seleccionar</p>
                </div>
                <p className="text-xs text-gray-600">Máximo 500 productos por importación</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 rounded-lg text-danger text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={downloadCsvTemplate}>
                <Download size={16} />
                Descargar plantilla
              </Button>
              <button
                type="button"
                onClick={() => setShowColumnGuide(!showColumnGuide)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Info size={14} />
                {showColumnGuide ? 'Ocultar guía' : 'Ver guía de columnas'}
                {showColumnGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {showColumnGuide && (
              <div className="border-t border-gray-200 pt-3 space-y-3">
                <p className="text-xs font-medium text-gray-700">Guía rápida de columnas:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 px-2 text-gray-500 font-medium">Columna</th>
                        <th className="text-left py-1 px-2 text-gray-500 font-medium">Requerido</th>
                        <th className="text-left py-1 px-2 text-gray-500 font-medium">Formato</th>
                        <th className="text-left py-1 px-2 text-gray-500 font-medium">Ejemplo</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">nombre</td>
                        <td className="py-1 px-2"><span className="text-danger">*</span> Sí</td>
                        <td className="py-1 px-2">Máx. 25 caracteres</td>
                        <td className="py-1 px-2 font-mono">Arroz Premium</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">sku</td>
                        <td className="py-1 px-2"><span className="text-danger">*</span> Sí</td>
                        <td className="py-1 px-2">Máx. 18, único</td>
                        <td className="py-1 px-2 font-mono">ARR001</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">tipo</td>
                        <td className="py-1 px-2"><span className="text-danger">*</span> Sí</td>
                        <td className="py-1 px-2">resale o materia_prima</td>
                        <td className="py-1 px-2 font-mono">resale</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">precio</td>
                        <td className="py-1 px-2"><span className="text-danger">*</span> Sí*</td>
                        <td className="py-1 px-2">Número, mín. $0.05</td>
                        <td className="py-1 px-2 font-mono">2.50</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">costo</td>
                        <td className="py-1 px-2">Sí**</td>
                        <td className="py-1 px-2">Número, no negativo</td>
                        <td className="py-1 px-2 font-mono">1.80</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">stock</td>
                        <td className="py-1 px-2"><span className="text-danger">*</span> Sí</td>
                        <td className="py-1 px-2">Número, no negativo</td>
                        <td className="py-1 px-2 font-mono">100</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">stock_min</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">Si vacío → stock/4</td>
                        <td className="py-1 px-2 font-mono">10</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">categoria</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">Se crea si no existe</td>
                        <td className="py-1 px-2 font-mono">víveres</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">pesable</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">si / no (default: no)</td>
                        <td className="py-1 px-2 font-mono">si</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">unidad</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">kg, gr, lt, m, unidad</td>
                        <td className="py-1 px-2 font-mono">kg</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">iva</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">si / no (default: si)</td>
                        <td className="py-1 px-2 font-mono">si</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1 px-2 font-mono font-medium">vendible</td>
                        <td className="py-1 px-2">No</td>
                        <td className="py-1 px-2">si / no (default: si)</td>
                        <td className="py-1 px-2 font-mono">si</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-2 font-mono font-medium" colSpan={4}>
                          <span className="text-gray-400">+ 4 columnas de presentación (pres_nombre, pres_precio, pres_multiplicador, pres_codigo_barras)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">* precio es requerido para tipo "resale" | ** costo es requerido para tipo "materia_prima"</p>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-gray-500" />
              <span className="text-sm text-gray-700">{fileName}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X size={14} />
            </Button>
          </div>

          <div className="flex gap-3">
            <Badge variant="success">{validCount} válidos</Badge>
            {errorCount > 0 && <Badge variant="danger">{errorCount} errores</Badge>}
            {duplicateCount > 0 && <Badge variant="warning">{duplicateCount} duplicados</Badge>}
          </div>

          {errorCount > 0 && (
            <div className="bg-danger/5 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-danger">Filas con errores:</p>
                <Button variant="ghost" size="sm" onClick={handleEditErrors}>
                  Corregir
                </Button>
              </div>
              {results.filter((r) => r.status === 'error').slice(0, 5).map((r, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className="font-mono text-gray-600">Fila {r.rowIndex}:</span>{' '}
                  {r.errors.map((e) => e.message).join(', ')}
                </div>
              ))}
              {errorCount > 5 && (
                <p className="text-xs text-gray-600">... y {errorCount - 5} errores más</p>
              )}
            </div>
          )}

          {duplicateCount > 0 && (
            <div className="bg-warning/5 rounded-lg p-3">
              <p className="text-xs font-medium text-yellow-700 mb-1">Duplicados (serán ignorados):</p>
              {results.filter((r) => r.status === 'duplicate').slice(0, 3).map((r, i) => (
                <div key={i} className="text-xs text-gray-600">
                  Fila {r.rowIndex}: SKU "{r.sku}" {r.existingProductId ? '(ya existe en sistema)' : '(duplicado en archivo)'}
                </div>
              ))}
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">#</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Nombre</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">SKU</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Tipo</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Precio</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Stock</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Categoría</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Pesable</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Unidad</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">IVA</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const result = results[i];
                    return (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 px-2">{row.nombre || '-'}</td>
                        <td className="py-2 px-2 font-mono">{row.sku || '-'}</td>
                        <td className="py-2 px-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${row.tipo === 'materia_prima' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {row.tipo === 'materia_prima' ? 'Materia Prima' : 'Venta'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">{row.precio || '-'}</td>
                        <td className="py-2 px-2 text-right">{row.stock || '-'}</td>
                        <td className="py-2 px-2">{row.categoria || <span className="text-gray-400">Otros</span>}</td>
                        <td className="py-2 px-2 text-center">{row.pesable === 'si' ? '⚖️' : '📦'}</td>
                        <td className="py-2 px-2 text-center font-mono text-xs">{row.unidad || 'unidad'}</td>
                        <td className="py-2 px-2 text-center">{row.iva === 'no' ? 'No' : 'Sí'}</td>
                        <td className="py-2 px-2 text-center">
                          {result?.status === 'valid' && <CheckCircle2 size={14} className="text-success mx-auto" />}
                          {result?.status === 'error' && <AlertTriangle size={14} className="text-danger mx-auto" />}
                          {result?.status === 'duplicate' && <span className="text-yellow-600 text-xs">dup</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedRows.length > 5 && (
                <p className="text-xs text-gray-600 text-center mt-2">Mostrando 5 de {parsedRows.length} filas</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={reset}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleImport}
              disabled={validCount === 0}
              loading={loading}
            >
              Importar {validCount} producto{validCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {step === 'editing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('preview')}>
                <ArrowLeft size={14} />
              </Button>
              <span className="text-sm font-medium text-gray-700">
                Corregir errores ({editingRows.length} fila{editingRows.length !== 1 ? 's' : ''})
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={addEditRow}>
              <Plus size={14} />
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-3">
            {editingRows.map((row, i) => {
              const rowErrs = editingErrors[i] || [];
              const getFieldError = (field: string) => rowErrs.find((e) => e.field === field)?.message;

              return (
                <div key={i} className="border border-gray-200 rounded-xl p-3 sm:p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">
                      Fila {editingOriginalIndices.get(i) !== undefined ? editingOriginalIndices.get(i)! + 1 : i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteEditRow(i)}
                      className="min-w-11 min-h-11 p-2.5 rounded-lg hover:bg-danger/10 text-gray-400 hover:text-danger transition-colors flex items-center justify-center"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 sm:col-span-1">
                      <Input
                        label="Nombre *"
                        placeholder="Nombre del producto"
                        value={row.nombre || ''}
                        onChange={(e) => updateEditRow(i, 'nombre', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('nombre')}
                        validation={{ required: true, maxLength: 25 }}
                        inputClassName="text-xs"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <Input
                        label="SKU *"
                        placeholder="Ej: ARR001"
                        value={row.sku || ''}
                        onChange={(e) => updateEditRow(i, 'sku', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('sku')}
                        validation={{ required: true, maxLength: 18 }}
                        inputClassName="text-xs font-mono"
                      />
                    </div>

                    <div>
                      <Input
                        label="Precio ($) *"
                        sanitize="currency"
                        step="0.01"
                        placeholder="2.50"
                        value={row.precio || ''}
                        onChange={(e) => updateEditRow(i, 'precio', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('precio')}
                        validation={{ required: true, min: 0.05, max: 9999 }}
                        inputClassName="text-xs"
                        inputMode="decimal"
                      />
                    </div>

                    <div>
                      <Input
                        label="Costo ($)"
                        sanitize="currency"
                        step="0.01"
                        placeholder="0.00"
                        value={row.costo || ''}
                        onChange={(e) => updateEditRow(i, 'costo', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('costo')}
                        validation={{ min: 0 }}
                        inputClassName="text-xs"
                        inputMode="decimal"
                      />
                    </div>

                    <div>
                      <Input
                        label="Stock *"
                        sanitize="number"
                        decimals={row.pesable === 'si' || row.pesable === 'true' ? 2 : 0}
                        step={row.pesable === 'si' || row.pesable === 'true' ? '0.01' : '1'}
                        placeholder="0"
                        value={row.stock || ''}
                        onChange={(e) => updateEditRow(i, 'stock', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('stock')}
                        validation={{ required: true, min: 0 }}
                        inputClassName="text-xs"
                        inputMode="decimal"
                      />
                    </div>

                    <div>
                      <Input
                        label="Stock mínimo"
                        sanitize="number"
                        decimals={0}
                        placeholder="0"
                        value={row.stock_min || ''}
                        onChange={(e) => updateEditRow(i, 'stock_min', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('stock_min')}
                        validation={{ min: 0, max: 999 }}
                        inputClassName="text-xs"
                        inputMode="numeric"
                      />
                    </div>

                    <div>
                      <Input
                        label="Categoría"
                        placeholder="Otros"
                        value={row.categoria || ''}
                        onChange={(e) => updateEditRow(i, 'categoria', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('categoria')}
                        validation={{ maxLength: 25 }}
                        inputClassName="text-xs"
                      />
                    </div>

                    <div>
                      <Select
                        label="Pesable"
                        value={row.pesable || 'no'}
                        onChange={(e) => {
                          updateEditRow(i, 'pesable', e.target.value);
                          if (e.target.value === 'si' && (row.unidad === 'unidad' || !row.unidad)) {
                            updateEditRow(i, 'unidad', 'kg');
                          } else if (e.target.value === 'no') {
                            updateEditRow(i, 'unidad', 'unidad');
                          }
                          handleBlurValidate(i);
                        }}
                        className="text-xs"
                      >
                        <option value="no">No</option>
                        <option value="si">Sí</option>
                      </Select>
                    </div>

                    <div>
                      <Select
                        label="Unidad"
                        value={row.unidad || (row.pesable === 'si' ? 'kg' : 'unidad')}
                        onChange={(e) => {
                          updateEditRow(i, 'unidad', e.target.value);
                          const weightUnits = ['kg', 'gr', 'lt', 'm'];
                          if (weightUnits.includes(e.target.value)) {
                            updateEditRow(i, 'pesable', 'si');
                          } else {
                            updateEditRow(i, 'pesable', 'no');
                          }
                          handleBlurValidate(i);
                        }}
                        className="text-xs"
                      >
                        <option value="unidad">Unidad</option>
                        <option value="kg">Kg</option>
                        <option value="gr">Gramos</option>
                        <option value="lt">Litros</option>
                        <option value="m">Metros</option>
                      </Select>
                    </div>

                    <div>
                      <Select
                        label="IVA"
                        value={row.iva || 'si'}
                        onChange={(e) => { updateEditRow(i, 'iva', e.target.value); handleBlurValidate(i); }}
                        className="text-xs"
                      >
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                      </Select>
                    </div>

                    <div>
                      <Select
                        label="Vendible"
                        value={row.vendible || 'si'}
                        onChange={(e) => { updateEditRow(i, 'vendible', e.target.value); handleBlurValidate(i); }}
                        className="text-xs"
                      >
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                      </Select>
                    </div>

                    <div>
                      <Select
                        label="Tipo"
                        value={row.tipo || 'resale'}
                        onChange={(e) => {
                          updateEditRow(i, 'tipo', e.target.value);
                          if (e.target.value === 'materia_prima') {
                            updateEditRow(i, 'vendible', 'no');
                            updateEditRow(i, 'iva', 'no');
                          }
                          handleBlurValidate(i);
                        }}
                        className="text-xs"
                      >
                        <option value="resale">Venta</option>
                        <option value="materia_prima">Materia Prima</option>
                      </Select>
                    </div>

                    <div className="col-span-2 border-t border-gray-100 pt-2 mt-1">
                      <p className="text-xs text-gray-400 mb-2 font-medium">PRESENTACIÓN (opcional)</p>
                    </div>

                    <div>
                      <Input
                        label="Nombre variante"
                        placeholder="Ej: 250ml"
                        value={row.pres_nombre || ''}
                        onChange={(e) => updateEditRow(i, 'pres_nombre', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('pres_nombre')}
                        validation={{ maxLength: 100 }}
                        inputClassName="text-xs"
                      />
                    </div>

                    <div>
                      <Input
                        label="Precio variante ($)"
                        sanitize="currency"
                        step="0.01"
                        placeholder="0.00"
                        value={row.pres_precio || ''}
                        onChange={(e) => updateEditRow(i, 'pres_precio', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('pres_precio')}
                        validation={{ min: 0.01 }}
                        inputClassName="text-xs"
                      />
                    </div>

                    <div>
                      <Input
                        label="Multiplicador"
                        sanitize="number"
                        decimals={0}
                        placeholder="1"
                        value={row.pres_multiplicador || ''}
                        onChange={(e) => updateEditRow(i, 'pres_multiplicador', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('pres_multiplicador')}
                        validation={{ min: 1 }}
                        inputClassName="text-xs"
                      />
                    </div>

                    <div>
                      <Input
                        label="Barcode variante"
                        placeholder="Ej: 7591234567890"
                        value={row.pres_codigo_barras || ''}
                        onChange={(e) => updateEditRow(i, 'pres_codigo_barras', e.target.value)}
                        onBlur={() => handleBlurValidate(i)}
                        error={getFieldError('pres_codigo_barras')}
                        validation={{ maxLength: 50 }}
                        inputClassName="text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setStep('preview')}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleSaveEdits}
              disabled={editingRows.length === 0}
            >
              Confirmar cambios
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 size={32} className="text-primary animate-spin" />
          <p className="text-sm text-gray-600">Importando productos...</p>
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progreso</span>
                <span>{importProgress.done} / {importProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 progress-bar-shimmer">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">Esto puede tomar unos segundos</p>
        </div>
      )}

      {step === 'result' && summary && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={24} className="text-success" />
            </div>
            <p className="text-lg font-bold text-gray-900">Importación completada</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-success/10 rounded-lg p-3">
              <p className="text-lg font-bold text-success">{summary.imported}</p>
              <p className="text-xs text-gray-500">Importados</p>
            </div>
            <div className="bg-warning/10 rounded-lg p-3">
              <p className="text-lg font-bold text-yellow-600">{summary.duplicates}</p>
              <p className="text-xs text-gray-500">Duplicados</p>
            </div>
            <div className="bg-danger/10 rounded-lg p-3">
              <p className="text-lg font-bold text-danger">{summary.errors}</p>
              <p className="text-xs text-gray-500">Errores</p>
            </div>
          </div>

          {summary.categoriesCreated.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-1">Categorías creadas:</p>
              <div className="flex flex-wrap gap-1">
                {summary.categoriesCreated.map((cat, i) => (
                  <Badge key={i} variant="info" className="text-xs">{cat}</Badge>
                ))}
              </div>
            </div>
          )}

          <Button variant="primary" fullWidth onClick={handleClose}>
            Cerrar
          </Button>
        </div>
      )}
    </Modal>
  );
}

interface ValidationError {
  field: string;
  message: string;
}
