import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationService } from '../../services/notification';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatFormFieldAppearance, MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-copy-input',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './copy-input.html',
  styleUrl: './copy-input.scss',
})
export class CopyInput {

  @Input() label: string = 'Registration ID';
  @Input() value: string = '';
  @Input() hint: string = '';
  @Input() notificationText: string = 'Copied to clipboard!'
  @Input() tooltipText: string = 'Copy to clipboard';
  @Input() appearance: MatFormFieldAppearance = 'fill'
  @Input() readonly: boolean = true;
  @Input() disabled: boolean = false;
  constructor(private clipboard: Clipboard, private notification: NotificationService) { }

  copy(): void {
    if (this.value) {
      this.clipboard.copy(this.value);
      this.notification.show(this.notificationText);
    }
  }
}
