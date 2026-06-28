interface CashStatusBadgeProps {
  isOpen: boolean;
  onClick: () => void;
  role: string | null;
  disabled?: boolean;
  canInteract?: boolean;
}

export function CashStatusBadge({ isOpen, onClick, role, disabled, canInteract: canInteractProp }: CashStatusBadgeProps) {
  const canInteract = canInteractProp ?? (role === 'owner' || role === 'admin');
  const classes = isOpen
    ? 'bg-gradient-to-r from-primary to-primary-light text-white shadow-xs'
    : 'bg-gradient-to-r from-danger to-red-400 text-white shadow-xs';
  const dot = isOpen ? 'bg-green-200' : 'bg-red-200';

  if (canInteract) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`text-left px-3 py-1.5 min-h-11 rounded-full text-xs font-semibold ${classes} hover:opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
        {isOpen ? 'Caja Abierta' : 'Caja Cerrada'}
      </button>
    );
  }

  return (
    <div className={`text-left px-3 py-1.5 rounded-full text-xs font-semibold ${classes} flex items-center gap-1.5 shrink-0`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
      {isOpen ? 'Caja Abierta' : 'Caja Cerrada'}
    </div>
  );
}
