import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type UiActionButtonVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type UiActionButtonAppearance = 'outline' | 'solid';
type UiActionButtonSize = 'xs' | 'sm';
type UiActionButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'app-ui-action-button',
  standalone: true,
  templateUrl: './ui-action-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiActionButtonComponent {
  readonly label = input.required<string>();
  readonly isDark = input(false);
  readonly variant = input<UiActionButtonVariant>('neutral');
  readonly appearance = input<UiActionButtonAppearance>('outline');
  readonly size = input<UiActionButtonSize>('xs');
  readonly buttonType = input<UiActionButtonType>('button');
  readonly active = input(false);
  readonly activeVariant = input<UiActionButtonVariant>('primary');
  readonly disabled = input(false);

  readonly clicked = output<void>();

  protected readonly className = computed(() => {
    const sizeClass = this.size() === 'sm' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs';
    const baseClass =
      `rounded-lg border font-medium transition-colors duration-200 ${sizeClass} ` +
      'disabled:cursor-not-allowed disabled:opacity-50';

    const effectiveVariant = this.active() ? this.activeVariant() : this.variant();
    const effectiveAppearance = this.active() ? 'solid' : this.appearance();
    return `${baseClass} ${this.resolveToneClasses(effectiveVariant, effectiveAppearance)}`.trim();
  });

  protected onClick() {
    this.clicked.emit();
  }

  private resolveToneClasses(
    variant: UiActionButtonVariant,
    appearance: UiActionButtonAppearance,
  ): string {
    if (appearance === 'solid') {
      if (variant === 'primary') {
        return 'border-accent bg-accent text-white hover:bg-accent-hover';
      }
      if (variant === 'success') {
        return 'border-success bg-success text-white hover:bg-success/90';
      }
      if (variant === 'warning') {
        return 'border-warning bg-warning text-white hover:bg-warning/90';
      }
      if (variant === 'danger') {
        return 'border-danger bg-danger text-white hover:bg-danger/90';
      }
      return this.isDark()
        ? 'border-dark-border bg-dark-elevated text-dark-text hover:border-accent hover:text-accent'
        : 'border-light-border bg-light-surface text-light-text hover:border-accent';
    }

    // Outline appearance
    if (variant === 'primary') {
      return this.isDark()
        ? 'border-accent/50 text-accent hover:border-accent hover:bg-accent/10'
        : 'border-accent/50 text-accent hover:border-accent hover:bg-accent-subtle';
    }
    if (variant === 'success') {
      return this.isDark()
        ? 'border-success/50 text-success hover:border-success hover:bg-success/10'
        : 'border-success/50 text-success hover:border-success hover:bg-success-light';
    }
    if (variant === 'warning') {
      return this.isDark()
        ? 'border-warning/50 text-warning hover:border-warning hover:bg-warning/10'
        : 'border-warning/50 text-warning hover:border-warning hover:bg-warning-light';
    }
    if (variant === 'danger') {
      return this.isDark()
        ? 'border-danger/50 text-danger hover:border-danger hover:bg-danger/10'
        : 'border-danger/50 text-danger hover:border-danger hover:bg-danger-light';
    }

    return this.isDark()
      ? 'border-dark-border text-dark-text hover:border-accent hover:text-accent'
      : 'border-light-border text-light-text hover:border-accent hover:text-accent';
  }
}
