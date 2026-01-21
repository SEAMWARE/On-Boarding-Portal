import { Component, Input } from '@angular/core';
import { RegistrationStatus } from '../../types/registration-status';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Registration } from '../../types/registration';
import { MatButtonModule } from "@angular/material/button";
import { CopyInput } from '../copy-input/copy-input';

@Component({
  selector: 'app-registration-details',
  imports: [CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    CopyInput
  ],
  templateUrl: './registration-details.html',
  styleUrl: './registration-details.scss',
})
export class RegistrationDetails {

  @Input({ required: true }) registration!: Registration;

  // Helper para mostrar colores según el estado
  getStatusColor(status: RegistrationStatus): string {
    const colors: Record<RegistrationStatus, string> = {
      [RegistrationStatus.PENDING]: 'warn',
      [RegistrationStatus.SUBMITTED]: 'accent',
      [RegistrationStatus.UNDER_REVIEW]: 'primary',
      [RegistrationStatus.ACTION_REQUIRED]: 'warn',
      [RegistrationStatus.ACTIVE]: 'success'
    };
    return colors[status] || 'default';
  }
}
