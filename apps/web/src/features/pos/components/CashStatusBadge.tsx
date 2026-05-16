import { Badge } from '../../../common/components';

interface CashStatusBadgeProps {
  isOpen: boolean;
  onClick: () => void;
  role: string | null;
}

export function CashStatusBadge({ isOpen, onClick, role }: CashStatusBadgeProps) {
  if (role !== 'owner' && role !== 'admin') return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
    >
      <Badge variant={isOpen ? 'success' : 'danger'} dot>
        {isOpen ? 'Caja Abierta' : 'Caja Cerrada'}
      </Badge>
    </button>
  );
}
