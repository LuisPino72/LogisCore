import { useState, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Upload, X } from 'lucide-react';

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  error?: string;
  onFilesSelected: (files: File[]) => void;
  className?: string;
  preview?: boolean;
  children?: ReactNode;
}

export function FileUpload({
  accept,
  multiple,
  maxSize = 5 * 1024 * 1024,
  error,
  onFilesSelected,
  className,
  preview = true,
  children,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList: FileList) => {
    const files = Array.from(fileList);
    const valid = files.filter((f) => f.size <= maxSize);
    if (valid.length === 0) return;

    if (preview) {
      const urls = valid.map((f) => URL.createObjectURL(f));
      setPreviews((prev) => [...prev, ...urls]);
    }

    onFilesSelected(valid);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const clearPreviews = () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews([]);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400',
          error && 'border-red-400',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        {children ?? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload size={32} />
            <p className="text-sm">Arrastra archivos aquí o haz clic para seleccionar</p>
            <p className="text-xs text-gray-400">Máx. {Math.round(maxSize / 1024 / 1024)} MB{accept ? ` · ${accept}` : ''}</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
      />

      {error && <span className="input-error-text">{error}</span>}

      {preview && previews.length > 0 && (
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
          {previews.map((url, i) => (
            <div key={i} className="relative w-16 h-16 shrink-0">
              <img src={url} alt={`Preview ${i}`} className="w-full h-full object-cover rounded border" />
              <button
                onClick={() => {
                  URL.revokeObjectURL(url);
                  setPreviews((p) => p.filter((_, j) => j !== i));
                }}
                className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm min-w-[44px] min-h-[44px]"
                aria-label="Eliminar"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {previews.length > 1 && (
            <button onClick={clearPreviews} className="text-xs text-red-600 hover:underline self-center">
              Limpiar todo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
