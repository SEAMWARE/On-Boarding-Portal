import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { PageQueryFn } from '../../types/pagination';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { ColumnConfig } from '../../types/column-config';
import { FilterConfig } from '../../types/table-filter';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-paginated-table',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './paginated-table.html',
  styleUrl: './paginated-table.scss',
})
export class PaginatedTable<T> implements OnInit {

  @Input() fetchDataFn!: PageQueryFn<T>;
  @Input() columnsConfig: ColumnConfig[] = [];
  @Input() filtersConfig?: FilterConfig[];
  @Input() pageSizeOptions: number[] = [10, 25, 50];
  @Input() emptyMessage: string = "No records found."
  @Output() rowClick = new EventEmitter<T>();

  get displayedColumns(): string[] {
    return this.columnsConfig.map(c => c.key);
  }

  dataSource = new MatTableDataSource<T>([]);

  totalItems = 0;
  pageSize = 10;
  currentPage = 0;
  isLoading = signal(false);
  filterForm = new FormGroup({});

  ngOnInit(): void {
    if (this.filtersConfig) {
      this.filtersConfig.forEach(f => this.filterForm.addControl(f.key, new FormControl(null)));

      this.filterForm.valueChanges.pipe(
        debounceTime(400),
        distinctUntilChanged()
      ).subscribe(() => {
        this.currentPage = 0;
        this.loadData();
      });
    }
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.fetchDataFn(this.currentPage, this.pageSize, this.filterForm.value).subscribe({
      next: (res) => {
        this.dataSource.data = res.items;
        this.totalItems = res.total;
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  onRowClicked(row: T): void {
    this.rowClick.emit(row);
  }
}
