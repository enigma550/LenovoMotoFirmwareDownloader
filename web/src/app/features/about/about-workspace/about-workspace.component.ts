import { Component, inject, OnInit, signal } from '@angular/core';
import { WorkflowStore } from '../../../core/state/workflow/workflow.store';
import { WorkflowUiService } from '../../../core/state/workflow/workflow-ui.service';
import type { FrameworkUpdateInfo } from '../../../core/models/desktop-api';

@Component({
    selector: 'app-about-workspace',
    standalone: true,
    templateUrl: './about-workspace.component.html',
})
export class AboutWorkspaceComponent implements OnInit {
    protected readonly store = inject(WorkflowStore);
    protected readonly ui = inject(WorkflowUiService);
    protected desktopStatus = signal<'checking' | 'ok' | 'missing' | 'wrong_wmclass' | 'not_linux' | 'creating'>('checking');
    protected checkingUpdate = signal(false);
    protected downloadingUpdate = signal(false);
    protected showUpdateModal = signal(false);
    protected isAutomatedUpdate = signal(false);
    protected frameworkUpdateInfo = signal<FrameworkUpdateInfo | null>(null);
    protected releasePageUrl = signal("https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases");

    ngOnInit() {
        this.store.loadAppInfo();
        this.checkIntegration();
    }

    async checkIntegration() {
        this.desktopStatus.set('checking');
        const res = await this.store.checkDesktopIntegration();
        this.desktopStatus.set(res.status);
    }

    async createIntegration() {
        this.desktopStatus.set('creating');
        const res = await this.store.createDesktopIntegration();
        if (res.ok) {
            this.desktopStatus.set('ok');
        } else {
            this.desktopStatus.set('missing');
            // In a real app we'd dispatch a toast from the store, but here we'll just fall back to missing.
            console.error("Failed to create shortcut:", res.error);
        }
    }

    async openRepo() {
        await this.store.openUrl("https://github.com/enigma550/LenovoMotoFirmwareDownloader");
    }

    async openReleasePage() {
        await this.store.openUrl(this.releasePageUrl());
    }

    async checkUpdates() {
        if (this.checkingUpdate()) return;
        this.checkingUpdate.set(true);
        try {
            const info = this.store.appInfo();
            const channel = info?.channel || 'stable';

            // Skip update check for local dev builds
            if (channel === 'dev') {
                this.ui.showToast('Update checks are disabled for local development.', 'info');
                return;
            }

            // Always check via Electrobun Updater first (supports delta updates on Win/Mac)
            const fwInfo = await this.store.checkFrameworkUpdate();
            if (fwInfo?.updateAvailable) {
                this.frameworkUpdateInfo.set(fwInfo);
                this.isAutomatedUpdate.set(true);

                // Try to find the specific release URL from GitHub for the "Release page" button
                try {
                    const res = await fetch('https://api.github.com/repos/enigma550/LenovoMotoFirmwareDownloader/releases?per_page=10');
                    if (res.ok) {
                        const releases = await res.json();
                        const targetRelease = releases.find((r: any) => {
                            if (channel === 'stable') return !r.prerelease;
                            if (channel === 'canary') return r.prerelease;
                            return false;
                        });
                        if (targetRelease) {
                            this.releasePageUrl.set(targetRelease.html_url);
                        }
                    }
                } catch (e) {
                    // Fallback to general releases page
                    this.releasePageUrl.set("https://github.com/enigma550/LenovoMotoFirmwareDownloader/releases");
                }

                this.showUpdateModal.set(true);
                return;
            }

            // Fallback for Linux or if update.json check fails/is empty
            const res = await fetch('https://api.github.com/repos/enigma550/LenovoMotoFirmwareDownloader/releases?per_page=10');
            if (res.ok) {
                const releases = await res.json();
                const targetRelease = releases.find((r: any) => {
                    if (channel === 'stable') return !r.prerelease;
                    if (channel === 'canary') return r.prerelease;
                    return false;
                });

                if (targetRelease) {
                    const currentVersion = info?.version?.replace(/^v/, '');
                    const latestVersion = targetRelease.tag_name?.replace(/^v/, '');

                    if (latestVersion && currentVersion && this.compareVersions(latestVersion, currentVersion)) {
                        this.releasePageUrl.set(targetRelease.html_url);
                        this.isAutomatedUpdate.set(false);
                        this.frameworkUpdateInfo.set({
                            version: latestVersion,
                            hash: '',
                            updateAvailable: true,
                            updateReady: false,
                            error: ''
                        });
                        this.showUpdateModal.set(true);
                    } else {
                        this.ui.showToast(`You are on the latest ${channel} version.`, 'info');
                    }
                }
            } else {
                this.ui.showToast(`You are on the latest ${channel} version.`, 'info');
            }
        } finally {
            this.checkingUpdate.set(false);
        }
    }

    async downloadAndApplyUpdate() {
        if (this.downloadingUpdate()) return;

        if (!this.isAutomatedUpdate()) {
            this.showUpdateModal.set(false);
            this.ui.showToast('Automatic update unavailable for this build. Opening download page...', 'info');
            await this.openReleasePage();
            return;
        }

        this.downloadingUpdate.set(true);
        const toastId = this.ui.showToast('Downloading update...', 'info', 0);
        try {
            await this.store.downloadFrameworkUpdate();
            this.ui.dismissToast(toastId);
            this.ui.showToast('Update downloaded. Applying...', 'success');
            await this.store.applyFrameworkUpdate();
        } catch (e: any) {
            this.ui.dismissToast(toastId);
            const errMsg = e?.message || String(e);
            this.ui.showToast(`Update failed: ${errMsg}`, 'error', 10000);
            console.error("Update applying error:", e);
        } finally {
            this.downloadingUpdate.set(false);
        }
    }

    private compareVersions(latest: string, current: string): boolean {
        const [lBase, lSuffix] = latest.split('-');
        const [cBase, cSuffix] = current.split('-');

        if (lBase !== cBase) {
            const lParts = lBase.split('.').map(Number);
            const cParts = cBase.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
                if ((lParts[i] || 0) > (cParts[i] || 0)) return true;
                if ((lParts[i] || 0) < (cParts[i] || 0)) return false;
            }
        }

        // Semver: X.Y.Z is newer than X.Y.Z-suffix
        if (!cSuffix && lSuffix) return false;
        if (cSuffix && !lSuffix) return true;

        if (lSuffix && cSuffix) {
            return lSuffix !== cSuffix;
        }

        return false;
    }
}
