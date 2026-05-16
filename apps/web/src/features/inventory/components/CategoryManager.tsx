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
          <div className="flex-1">
            <Input
              placeholder="Nueva categoría..."
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(''); }}
              error={error}
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={creating} className="shrink-0">
            <Plus size={16} />
          </Button>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState icon={<ListTree size={32} />} title="Sin categorías" description="Crea tu primera categoría" />
      ) : (
        <div className="space-y-1">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between gap-1 px-2 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
              {editingId === cat.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Edit3 size={14} className="text-accent" />
                  </div>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    inputClassName="text-sm"
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" onClick={saveEdit} className="shrink-0">
                    <Check size={16} className="text-success" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="shrink-0">
                    <X size={16} className="text-danger" />
                  </Button>
                </div>
              ) : (
                <>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="hidden sm:flex w-8 h-8 rounded-lg bg-primary/10 items-center justify-center shrink-0">
                        <ListTree size={14} className="text-primary" />
                      </div>
                      <span className="text-sm font-medium truncate">{cat.name}</span>
                    </div>
                  {isOwner && (
                    <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(cat)} className="p-1.5 min-w-[32px] min-h-[32px]">
                        <Edit3 size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id, cat.name)} className="p-1.5 min-w-[32px] min-h-[32px]">
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
