import { useState } from 'react';
import { ListTree, Trash2, Plus, Edit3, Check, X } from 'lucide-react';
import { Button, Input, Modal, EmptyState } from '../../../common/components';
import type { Category } from '../types';

interface CategoryManagerProps {
  categories: Category[];
  isOwner: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onRequestDelete: (id: string, name: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function CategoryManager({ categories, isOwner, onCreate, onUpdate, onRequestDelete, isOpen, onClose }: CategoryManagerProps) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError('Ingresa un nombre');
      return;
    }
    setCreating(true);
    setError('');
    const ok = await onCreate(newName.trim());
    setCreating(false);
    if (ok) setNewName('');
  };

  const handleDelete = (id: string, name: string) => {
    onRequestDelete(id, name);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdate(editingId, editName.trim());
    setEditingId(null);
    setEditName('');
  };

  const content = (
    <div className="space-y-3">
      {isOwner && (
        <div className="flex gap-2">
          <Input
            placeholder="Nueva categoría..."
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(''); }}
            error={error}
          />
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={creating}>
            <Plus size={14} />
          </Button>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState icon={<ListTree size={32} />} title="Sin categorías" description="Crea tu primera categoría" />
      ) : (
        <div className="space-y-1">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
              {editingId === cat.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-sm!"
                  />
                  <Button variant="ghost" size="sm" onClick={saveEdit}>
                    <Check size={14} className="text-success" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    <X size={14} className="text-danger" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <ListTree size={14} className="text-gray-400" />
                    <span className="text-sm">{cat.name}</span>
                    <span className="text-[10px] text-gray-400">({cat.slug})</span>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(cat)}>
                        <Edit3 size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id, cat.name)}>
                        <Trash2 size={14} className="text-danger" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (onClose !== undefined) {
    return (
      <Modal isOpen={isOpen ?? false} onClose={onClose} title="Gestionar categorías">
        {content}
      </Modal>
    );
  }

  return content;
}
