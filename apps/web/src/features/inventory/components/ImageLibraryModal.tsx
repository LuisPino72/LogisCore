import { useState, useEffect, useMemo, useCallback, memo, startTransition } from 'react';
import { Modal } from '@/common/components/Modal';
import { SearchInput } from '@/common/components/SearchInput';
import { Spinner } from '@/common/components/Loading';
import { getLibraryImages } from '../services/imageLibraryService';
import { useAuthStore } from '../../auth/stores/authStore';
import type { ImageLibrary } from '../../../specs/image-library';

interface ImageLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
  currentCategoryId?: string | null;
}

export function ImageLibraryModal({
  isOpen,
  onClose,
  onSelect,
  currentCategoryId,
}: ImageLibraryModalProps) {
  const [images, setImages] = useState<ImageLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const tenantId = useAuthStore((s) => s.session?.tenantId);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSearch('');
      if (!tenantId) {
        setLoading(false);
        return;
      }
      startTransition(() => {
        getLibraryImages(tenantId, currentCategoryId ?? undefined).then((result) => {
          if (result.ok) {
            setImages(result.data);
          }
          setLoading(false);
        });
      });
    }
  }, [isOpen, currentCategoryId, tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return images;
    const q = search.toLowerCase();
    return images.filter((img) => img.name.toLowerCase().includes(q));
  }, [images, search]);

  const handleSelect = useCallback(
    (img: ImageLibrary) => {
      onSelect(img.imageUrl);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Biblioteca de Imagenes" size="lg">
      <SearchInput
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Buscar imagen..."
      />

      {loading && (
        <div className="flex justify-center py-8">
          <Spinner size="md" />
        </div>
      )}

      {!loading && (
        <div
          className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 mt-4"
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}
        >
          {filtered.map((img) => (
            <ImageCard key={img.id} image={img} onSelect={handleSelect} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-4xl mb-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No hay imagenes en la biblioteca</p>
        </div>
      )}
    </Modal>
  );
}

const ImageCard = memo(function ImageCard({
  image,
  onSelect,
}: {
  image: ImageLibrary;
  onSelect: (img: ImageLibrary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(image)}
      className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary hover:shadow-md active:scale-95 transition-all min-h-[44px] min-w-[44px]"
    >
      <img
        src={image.imageUrl}
        alt={image.name}
        loading="lazy"
        className="w-full h-full object-cover"
      />
      {image.isDefault && (
        <span className="absolute top-1 right-1 bg-yellow-500 text-white text-[10px] px-1 rounded">
          Default
        </span>
      )}
      <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[11px] py-0.5 px-1 truncate">
        {image.name}
      </span>
    </button>
  );
});
