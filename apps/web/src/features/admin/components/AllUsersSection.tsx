import { Card, DataTable, Pagination } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import type { GlobalUser } from '../types';
import { UsersRound } from 'lucide-react';
import { SectionHeader } from './SectionHeader';

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
    <Card className="admin-card-hover">
      <div className="p-4 pb-0">
        <SectionHeader
          icon={<UsersRound size={20} className="text-primary" />}
          title="Todos los Usuarios"
          subtitle={`${allUsers.length} usuario${allUsers.length !== 1 ? 's' : ''} registrados`}
        />
      </div>
      <div className="p-4 pt-0">
        <DataTable
          columns={columns}
          data={allUsers}
          emptyMessage="No hay usuarios registrados. Crea un local con empleados primero."
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
