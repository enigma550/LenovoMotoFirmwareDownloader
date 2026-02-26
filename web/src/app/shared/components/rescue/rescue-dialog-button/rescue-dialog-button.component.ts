import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

type RescueDialogButtonVariant = 'primary' | 'secondary';
type RescueDialogButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'app-rescue-dialog-button',
  standalone: true,
  templateUrl: './rescue-dialog-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescueDialogButtonComponent {
  readonly label = input.required<string>();
  readonly variant = input<RescueDialogButtonVariant>('secondary');
  readonly isDark = input(false);
  readonly buttonType = input<RescueDialogButtonType>('button');
  readonly disabled = input(false);
  readonly clicked = output<void>();

  protected onClick() {
    this.clicked.emit();
  }
}
