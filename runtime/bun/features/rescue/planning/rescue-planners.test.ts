import { describe, expect, it } from 'bun:test';
import { getStorageUsage } from '../../../features/downloads/storage-management.ts';
import { checkLinuxUdevRules } from '../../../features/system/udev-rules.ts';
import { mediatekScriptPlannerStrategy } from './strategies/mediatek-script-planner.ts';
import { xmlFastbootPlannerStrategy } from './strategies/xml-fastboot-planner.ts';

describe('Rescue Command Planners', () => {
  it('xml-fastboot-planner should soft-fail preloader and append reboot', async () => {
    const mockXml = `<?xml version="1.0" ?>
<flashing>
  <steps>
    <step operation="getvar" var="max-sparse-size"/>
    <step operation="flash" partition="preloader" filename="preloader.img"/>
    <step operation="flash" partition="boot_a" filename="boot.img"/>
    <step operation="erase" partition="userdata"/>
    <step operation="oem" var="fb_mode_clear"/>
  </steps>
</flashing>`;

    const tempDir = `/tmp/test_fb_xml_${Date.now()}`;
    await Bun.write(`${tempDir}/flashfile.xml`, mockXml);
    await Bun.write(`${tempDir}/preloader.img`, 'fake-preloader');
    await Bun.write(`${tempDir}/boot.img`, 'fake-boot');

    // 1. Test dataReset = 'yes'
    const planYes = await xmlFastbootPlannerStrategy.plan({
      workDir: tempDir,
      dataReset: 'yes',
      qdlStorage: 'auto',
      extractedFiles: [
        `${tempDir}/flashfile.xml`,
        `${tempDir}/preloader.img`,
        `${tempDir}/boot.img`,
      ],
      fileIndex: new Map([
        ['flashfile.xml', [`${tempDir}/flashfile.xml`]],
        ['preloader.img', [`${tempDir}/preloader.img`]],
        ['boot.img', [`${tempDir}/boot.img`]],
      ]),
    });

    expect(planYes).not.toBeNull();
    expect(planYes?.plannerId).toBe('fastboot-xml');

    // Verify softFail on preloader
    const preloaderCmd = planYes?.commands.find((c) => 'args' in c && c.args.includes('preloader'));
    expect(preloaderCmd).toBeDefined();
    expect(preloaderCmd && 'softFail' in preloaderCmd ? preloaderCmd.softFail : false).toBe(true);

    // Verify reboot is automatically appended
    const lastCmd = planYes?.commands[planYes.commands.length - 1];
    expect(lastCmd && 'args' in lastCmd ? lastCmd.args : []).toEqual(['reboot']);

    // Verify userdata erase is present in dataReset = 'yes'
    const hasUserdata = planYes?.commands.some((c) => 'args' in c && c.args.includes('userdata'));
    expect(hasUserdata).toBe(true);

    // 2. Test dataReset = 'no' (preserve data)
    const planNo = await xmlFastbootPlannerStrategy.plan({
      workDir: tempDir,
      dataReset: 'no',
      qdlStorage: 'auto',
      extractedFiles: [
        `${tempDir}/flashfile.xml`,
        `${tempDir}/preloader.img`,
        `${tempDir}/boot.img`,
      ],
      fileIndex: new Map([
        ['flashfile.xml', [`${tempDir}/flashfile.xml`]],
        ['preloader.img', [`${tempDir}/preloader.img`]],
        ['boot.img', [`${tempDir}/boot.img`]],
      ]),
    });

    const hasUserdataNo = planNo?.commands.some((c) => 'args' in c && c.args.includes('userdata'));
    expect(hasUserdataNo).toBe(false);
  });

  it('mediatek-script-planner should soft-fail boot0 and filter erase userdata when dataReset is no', async () => {
    const mockSh = `#!/bin/sh
fastboot flash boot0 preloader.img
fastboot flash boot1 preloader.img
fastboot flash boot_a boot.img
fastboot erase userdata
fastboot reboot
`;

    const tempDir = `/tmp/test_mtk_sh_${Date.now()}`;
    await Bun.write(`${tempDir}/flashall.sh`, mockSh);
    await Bun.write(`${tempDir}/preloader.img`, 'fake-preloader');
    await Bun.write(`${tempDir}/boot.img`, 'fake-boot');

    const plan = await mediatekScriptPlannerStrategy.plan({
      workDir: tempDir,
      dataReset: 'no',
      qdlStorage: 'auto',
      extractedFiles: [`${tempDir}/flashall.sh`, `${tempDir}/preloader.img`, `${tempDir}/boot.img`],
      fileIndex: new Map([
        ['flashall.sh', [`${tempDir}/flashall.sh`]],
        ['preloader.img', [`${tempDir}/preloader.img`]],
        ['boot.img', [`${tempDir}/boot.img`]],
      ]),
    });

    expect(plan).not.toBeNull();
    expect(plan?.plannerId).toBe('mediatek-script');

    const boot0Cmd = plan?.commands.find((c) => 'args' in c && c.args.includes('boot0'));
    expect(boot0Cmd && 'softFail' in boot0Cmd ? boot0Cmd.softFail : false).toBe(true);

    const hasUserdata = plan?.commands.some((c) => 'args' in c && c.args.includes('userdata'));
    expect(hasUserdata).toBe(false);
  });
});

describe('System & Storage Helpers', () => {
  it('getStorageUsage should return numeric disk metrics', async () => {
    const storage = await getStorageUsage();
    expect(storage.ok).toBe(true);
    expect(typeof storage.freeBytes).toBe('number');
    expect(typeof storage.totalPackageBytes).toBe('number');
    expect(typeof storage.totalExtractedBytes).toBe('number');
  });

  it('checkLinuxUdevRules should report system status without crashing', async () => {
    const status = await checkLinuxUdevRules();
    expect(typeof status.isLinux).toBe('boolean');
    expect(typeof status.installed).toBe('boolean');
  });
});
