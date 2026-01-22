import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-pdf-viewer',
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.scss',
})
export class PdfViewer {
  pdfUrl?: SafeResourceUrl;
  objectUrl?: string;
  constructor(
    private sanitizer: DomSanitizer,
    private dialogRef: MatDialogRef<PdfViewer>,
    @Inject(MAT_DIALOG_DATA) public data: { blob: Blob; title?: string }
  ) { }

  ngOnInit() {
    if (this.data.blob) {
      this.objectUrl = URL.createObjectURL(this.data.blob);
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
    }
  }

  close() {
    this.dialogRef.close();
  }

  openInNewTab(): void {
    if (this.objectUrl) {
      window.open(this.objectUrl, '_blank');
    }
  }
  ngOnDestroy() {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl.toString());
    }
  }


}
