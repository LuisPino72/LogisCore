import { useState, useRef, useCallback } from 'react';
import { Button, Modal, Badge } from '../../../common/components';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { parseCsvFile, validateCsvRows, importProductsFromCsv, type CsvRow, type ImportResult, type ImportSummary } from '../services/csvImportService';

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  userId: string;
  onImported: () => void;
  onEditErrors?: (rows: CsvRow[]) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

export function CSVUploadModal({ isOpen, onClose, tenantId, userId, onImported, onEditErrors }: CSVUploadModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedRows([]);
    setResults([]);
    setSummary(null);
    setLoading(false);
    setError(null);
    setFileName('');
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

    const importSummary = await importProductsFromCsv(validRows, tenantId, userId);
    setSummary(importSummary);
    setLoading(false);
    setStep('result');
    onImported();
  }, [parsedRows, results, tenantId, userId, onImported]);

  const validCount = results.filter((r) => r.status === 'valid').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const duplicateCount = results.filter((r) => r.status === 'duplicate').length;
  const previewRows = parsedRows.slice(0, 5);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar productos CSV" size="lg">
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-primary animate-spin" />
                <p className="text-sm text-gray-500">Procesando archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload size={24} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Arrastra un archivo CSV aquí</p>
                  <p className="text-xs text-gray-500 mt-1">o haz clic para seleccionar</p>
                </div>
                <p className="text-[10px] text-gray-400">Máximo 500 productos por importación</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 rounded-lg text-danger text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Formato esperado del CSV:</p>
            <code className="text-[10px] text-gray-600 block bg-white p-2 rounded border">
              nombre,sku,precio,costo,stock,stock_min,categoria,pesable,unidad
            </code>
            <p className="text-[10px] text-gray-400 mt-1">Campos requeridos: nombre, sku, precio, costo, stock, stock_min</p>
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
                {onEditErrors && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const errorRows = parsedRows.filter((_, i) => results[i]?.status === 'error');
                      onEditErrors(errorRows);
                      handleClose();
                    }}
                  >
                    Corregir
                  </Button>
                )}
              </div>
              {results.filter((r) => r.status === 'error').slice(0, 5).map((r, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className="font-mono text-gray-400">Fila {r.rowIndex}:</span>{' '}
                  {r.errors.map((e) => e.message).join(', ')}
                </div>
              ))}
              {errorCount > 5 && (
                <p className="text-[10px] text-gray-400">... y {errorCount - 5} errores más</p>
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Fila</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">Nombre</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium">SKU</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Precio</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Stock</th>
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
                        <td className="py-2 px-2 text-right">{row.precio || '-'}</td>
                        <td className="py-2 px-2 text-right">{row.stock || '-'}</td>
                        <td className="py-2 px-2 text-center">
                          {result?.status === 'valid' && <CheckCircle2 size={14} className="text-success mx-auto" />}
                          {result?.status === 'error' && <AlertTriangle size={14} className="text-danger mx-auto" />}
                          {result?.status === 'duplicate' && <span className="text-yellow-600 text-[10px]">dup</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedRows.length > 5 && (
                <p className="text-[10px] text-gray-400 text-center mt-2">Mostrando 5 de {parsedRows.length} filas</p>
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

      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 size={32} className="text-primary animate-spin" />
          <p className="text-sm text-gray-600">Importando productos...</p>
          <p className="text-xs text-gray-400">Esto puede tomar unos segundos</p>
        </div>
      )}

      {step === 'result' && summary && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-success" />
            </div>
            <p className="text-lg font-bold text-gray-900">Importación completada</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-success/10 rounded-lg p-3">
              <p className="text-lg font-bold text-success">{summary.imported}</p>
              <p className="text-[10px] text-gray-500">Importados</p>
            </div>
            <div className="bg-warning/10 rounded-lg p-3">
              <p className="text-lg font-bold text-yellow-600">{summary.duplicates}</p>
              <p className="text-[10px] text-gray-500">Duplicados</p>
            </div>
            <div className="bg-danger/10 rounded-lg p-3">
              <p className="text-lg font-bold text-danger">{summary.errors}</p>
              <p className="text-[10px] text-gray-500">Errores</p>
            </div>
          </div>

          {summary.categoriesCreated.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-1">Categorías creadas:</p>
              <div className="flex flex-wrap gap-1">
                {summary.categoriesCreated.map((cat, i) => (
                  <Badge key={i} variant="info" className="text-[10px]">{cat}</Badge>
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
