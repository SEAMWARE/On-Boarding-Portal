import { Component } from '@angular/core';
import { PaginatedTable } from '../../../core/components/paginated-table/paginated-table';
import { PageQueryFn } from '../../../core/types/pagination';
import { Registration } from '../../../core/types/registration';
import { OnBoardingService } from '../../../core/services/onboarding.service';
import { ColumnConfig } from '../../../core/types/column-config';
import { Toolbar } from "../../../core/components/toolbar/toolbar";
import { FilterConfig } from '../../../core/types/table-filter';
import { RegistrationStatus } from '../../../core/types/registration-status';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialog } from '../../../core/components/confirm-dialog/confirm-dialog';
import { NotificationService } from '../../../core/services/notification';

@Component({
  selector: 'app-dashboard',
  imports: [PaginatedTable, Toolbar, MatCardModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {

  constructor(
    private onBoardingService: OnBoardingService,
    private readonly router: Router,
    private readonly dialog: MatDialog,
    private readonly notificationService: NotificationService
  ) { }
  readonly columns: ColumnConfig[] = [
    {
      key: 'email',
      label: 'Email Address',
      type: 'text',
    },
    {
      key: 'status',
      label: 'Current Status',
      type: 'text',
      uppercase: true,
      getValue: (row) => row.status.split("_").join(" ")
    },
    {
      key: 'createdAt',
      label: 'Registration Date',
      type: 'date',
      dateFormat: 'dd/MM/yyyy HH:mm'
    },
    {
      key: 'updatedAt',
      label: 'Last Update',
      type: 'date',
      dateFormat: 'dd/MM/yyyy HH:mm:ss'
    },
    {
      key: 'files',
      label: '# Files',
      type: 'number',
      getValue: (row) => row.files ? row.files?.length : 0
    },
    {
      key: 'delete',
      label: '',
      type: 'action',
      icon: 'delete',
      action: (row: Registration, reload) => {
        this.dialog.open(ConfirmDialog, {
          data: { title: 'Delete registration', message: `Are you sure you want to delete the registration for ${row.email}? This action cannot be undone.` }
        }).afterClosed().subscribe(confirmed => {
          if (confirmed) {
            this.onBoardingService.deleteAdminRegistration(row.id).subscribe({
              next: () => {
                this.notificationService.info('Registration deleted successfully'),
                  reload()
              },
              error: (error) => {
                console.error("Error deleting registration", error);
                this.notificationService.error('Failed to delete registration');
              }
            });
          }
        });
      }
    }
  ];
  readonly filters: FilterConfig[] = [{
    key: 'status',
    label: 'Status',
    type: 'enum',
    multiple: true,
    options: Object.keys(RegistrationStatus).map(key => ({
      label: key.split("_").join(" "),
      value: String(RegistrationStatus[key as keyof typeof RegistrationStatus])
    }))
  }];

  fetchRegistrations: PageQueryFn<Registration> = (page: number, limit: number, filter: { [key: string]: any }) => {
    const { status } = filter
    return this.onBoardingService.getAdminRegistrations({ page, limit, status: status });
  };

  goToReview(event: Registration) {
    this.router.navigate([`/admin/${event.id}`])
  }
}
