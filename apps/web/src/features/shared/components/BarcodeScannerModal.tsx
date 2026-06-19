import { useEffect, useRef, useState } from 'react';
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Button, Tooltip } from '@/common/components';
import { hasCamera } from '@/lib/camera';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function BarcodeScannerModal({ isOpen, onClose, onScan }: BarcodeScannerModalProps) {
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const scanLockRef = useRef(false);

  const stopCameraTracks = () => {
    if (containerRef.current) {
      containerRef.current.querySelectorAll('video').forEach((video) => {
        const src = video.srcObject;
        if (src && 'getTracks' in src) {
          (src as MediaStream).getTracks().forEach((track) => track.stop());
        }
      });
    }
  };

  const startScanner = async (facingMode: 'environment' | 'user') => {
    if (!containerRef.current) return;
    setError(null);
    setScanning(true);
    scanLockRef.current = false;

    const { Html5Qrcode } = await import('html5-qrcode');

    if (!mountedRef.current) return;

    const scanner = new Html5Qrcode('barcode-reader');

    try {
      await scanner.start(
        { facingMode },
        { fps: 15, qrbox: { width: 250, height: 100 } },
        (decodedText) => {
          if (scanLockRef.current) return;
          scanLockRef.current = true;
          onScan(decodedText);
          setTimeout(() => { scanLockRef.current = false; }, 3000);
        },
        () => {}, // no-op for scan failure
      );
      if (!mountedRef.current) {
        stopCameraTracks();
        scannerRef.current = null;
        return;
      }
      scannerRef.current = scanner;
    } catch (err) {
      if (!mountedRef.current) return;
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

  const switchCamera = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
    stopCameraTracks();
    scannerRef.current = null;
    startScanner(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    if (isOpen) {
      hasCamera().then((available) => {
        if (!mountedRef.current) return;
        if (available) {
          startScanner(cameraFacing);
        } else {
          setError('Este dispositivo no tiene cámara disponible.');
          setScanning(false);
        }
      });
    }
    return () => {
      mountedRef.current = false;
      stopCameraTracks();
      scannerRef.current = null;
      setScanning(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" style={{ paddingTop: 'env(safe-area-inset-top, 1rem)', paddingBottom: 'env(safe-area-inset-bottom, 1rem)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Camera size={16} /> Escanear código
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="min-w-[44px] min-h-[44px]" aria-label="Cerrar escáner">
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            id="barcode-reader"
            className="w-full aspect-video bg-gray-900"
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center p-4">
                <CameraOff size={32} className="text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-300">{error}</p>
                <Button variant="primary" size="sm" className="mt-3" onClick={() => startScanner(cameraFacing)}>
                  Reintentar
                </Button>
              </div>
            </div>
          )}
          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-3/4 h-0.5 bg-primary/80 animate-pulse rounded-full" />
            </div>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3 z-10">
            <Tooltip content="Cambiar cámara" variant="help">
              <button
                onClick={switchCamera}
                className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm"
              >
                <RefreshCw size={16} />
              </button>
            </Tooltip>
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
