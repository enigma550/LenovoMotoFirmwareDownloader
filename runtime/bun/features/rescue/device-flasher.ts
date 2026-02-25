


export async function runCommandWithAbort(options: {
    command: string;
    args: string[];
    cwd: string;
    signal: AbortSignal;
    onProcess: (process: Bun.Subprocess | null) => void;
}) {
    const proc = Bun.spawn([options.command, ...options.args], {
        cwd: options.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: {
            ...process.env,
            LD_PRELOAD: "",
        },
    });
    options.onProcess(proc);

    const abortListener = () => {
        try {
            proc.kill();
        } catch {
            // Ignore kill race conditions.
        }
    };
    options.signal.addEventListener("abort", abortListener, { once: true });

    try {
        const [stdoutText, stderrText, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
        ]);

        if (options.signal.aborted) {
            const abortError = new Error("Operation aborted.");
            abortError.name = "AbortError";
            throw abortError;
        }

        if (exitCode !== 0) {
            const errorOutput = [stderrText.trim(), stdoutText.trim()]
                .filter(Boolean)
                .join("\n");
            throw new Error(
                errorOutput || `${options.command} exited with code ${exitCode}.`,
            );
        }

        return {
            stdoutText,
            stderrText,
        };
    } finally {
        options.signal.removeEventListener("abort", abortListener);
        options.onProcess(null);
    }
}

export async function hasFastbootDevice(
    signal: AbortSignal,
    cwd: string,
    setProcess: (process: Bun.Subprocess | null) => void,
) {
    try {
        const result = await runCommandWithAbort({
            command: "fastboot",
            args: ["devices"],
            cwd,
            signal,
            onProcess: setProcess,
        });
        const output = `${result.stdoutText}\n${result.stderrText}`;
        return /\S+\s+fastboot/i.test(output);
    } catch {
        return false;
    }
}

export async function tryAdbRebootBootloader(
    signal: AbortSignal,
    cwd: string,
    setProcess: (process: Bun.Subprocess | null) => void,
) {
    try {
        const state = await runCommandWithAbort({
            command: "adb",
            args: ["get-state"],
            cwd,
            signal,
            onProcess: setProcess,
        });
        const output = `${state.stdoutText}\n${state.stderrText}`.toLowerCase();
        if (!output.includes("device")) {
            return false;
        }

        await runCommandWithAbort({
            command: "adb",
            args: ["reboot", "bootloader"],
            cwd,
            signal,
            onProcess: setProcess,
        });
        return true;
    } catch {
        return false;
    }
}
