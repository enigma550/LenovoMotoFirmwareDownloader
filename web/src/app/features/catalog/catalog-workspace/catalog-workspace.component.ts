import { Component } from '@angular/core';
import { CatalogModelBrowserComponent } from './components/catalog-model-browser/catalog-model-browser.component';
import { CatalogSelectedModelPanelComponent } from './components/catalog-selected-model-panel/catalog-selected-model-panel.component';

@Component({
  selector: 'app-catalog-workspace',
  standalone: true,
  imports: [CatalogModelBrowserComponent, CatalogSelectedModelPanelComponent],
  templateUrl: './catalog-workspace.component.html',
})
export class CatalogWorkspaceComponent {}
