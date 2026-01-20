import { Injectable } from "@angular/core";
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor(private snackBar: MatSnackBar) { }

  private getDefaultConfig(type: NotificationType): MatSnackBarConfig {
    return {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: [`snackbar-${type}`],
    };
  }
  show(
    message: string,
    type: NotificationType = 'info',
    config?: MatSnackBarConfig
  ): void {
    const mergedConfig: MatSnackBarConfig = { ...this.getDefaultConfig(type), ...config };
    this.snackBar.open(message, 'Close', mergedConfig);
  }

  success(message: string, config?: MatSnackBarConfig): void {
    this.show(message, 'success', config);
  }

  error(message: string, config?: MatSnackBarConfig): void {
    this.show(message, 'error', config);
  }

  warning(message: string, config?: MatSnackBarConfig): void {
    this.show(message, 'warning', config);
  }

  info(message: string, config?: MatSnackBarConfig): void {
    this.show(message, 'info', config);
  }
}
