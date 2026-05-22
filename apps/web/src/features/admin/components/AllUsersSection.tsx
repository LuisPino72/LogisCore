import { Card, DataTable, Pagination } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import type { GlobalUser } from '../types';
import { UsersRound } from 'lucide-react';

interface AllUsersSectionProps {
  allUsers: GlobalUser[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AllUsersSection({ allUsers, page, totalPages, onPageChange }: AllUsersSectionProps) {
  const columns: Column<GlobalUser>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (u: GlobalUser) => (
        <span className="wrap-break-word block" title={u.email}>{u.email}</span>
      ),
    },
    { key: 'name', header: 'Nombre' },
    { key: 'role', header: 'Rol' },
    { key: 'tenantName', header: 'Local' },
  ];

  return (
    <Card>
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <UsersRound size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-title font-bold text-gray-900">Todos los Usuarios</h2>
            <p className="text-xs text-text-secondary">{allUsers.length} usuario{allUsers.length !== 1 ? 's' : ''} registrados</p>
          </div>
        </div>
      </div>
      <div className="p-4 pt-0">
        <DataTable
          columns={columns}
          data={allUsers}
          emptyMessage="No hay usuarios registrados."
          keyExtractor={(u: GlobalUser) => u.id}
          renderCardOnMobile
        />
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        )}
      </div>
    </Card>
  );
}
