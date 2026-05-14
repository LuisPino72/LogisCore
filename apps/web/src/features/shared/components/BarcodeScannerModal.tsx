import { useEffect, useRef, useState } from 'react';
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Button } from '@/common/components';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function BarcodeScannerModal({ isOpen, onClose, onScan }: BarcodeScannerModalProps) {
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const scanLockRef = useRef(false);

  const startScanner = async (facingMode: 'environment' | 'user') => {
    if (!containerRef.current) return;
    setError(null);
    setScanning(true);
    scanLockRef.current = false;

    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode('barcode-reader');

    try {
      await scanner.start(
        { facingMode },
        { fps: 15, qrbox: { width: 250, height: 100 } },
        (decodedText) => {
          if (scanLockRef.current) return;
          scanLockRef.current = true;
          onScan(decodedText);
          scanner.stop().catch(() => {});
          setScanning(false);
          scannerRef.current = null;
        },
        () => {}, // no-op for scan failure
      );
      scannerRef.current = scanner;
    } catch (err) {
      console.error('[BarcodeScanner] Error starting camera:', err);
      setError(
        err instanceof Error
          ? err.message.includes('Permission') || err.message.includes('NotAllowed')
            ? 'Permiso de cámara denegado. Permite el acceso en los ajustes del navegador.'
            : 'No se pudo acceder a la cámara. Verifica que ningún otra app la esté usando.'
          : 'Error al iniciar la cámara.',
      );
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        console.warn('[BarcodeScanner] stop error (non-fatal)');
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const switchCamera = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
    stopScanner().then(() => startScanner(next));
  };

  useEffect(() => {
    if (isOpen) {
      startScanner(cameraFacing);
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Camera size={16} /> Escanear código
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            id="barcode-reader"
            className="w-full aspect-video bg-gray-900 flex items-center justify-center"
          >
            {error && (
              <div className="text-center p-4">
                <CameraOff size={32} className="text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-300">{error}</p>
                <Button variant="primary" size="sm" className="mt-3" onClick={() => startScanner(cameraFacing)}>
                  Reintentar
                </Button>
              </div>
            )}
            {scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-0.5 bg-primary/80 animate-pulse rounded-full" />
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3">
            <button
              onClick={switchCamera}
              className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm"
              title="Cambiar cámara"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 text-center">
          <p className="text-[11px] text-gray-500">
            Coloca el código de barras dentro del recuadro. Se escaneará automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
