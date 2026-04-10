let writableStreamCompatibilityChecked = false;
let tangoAdbModulePromise: Promise<typeof import('@yume-chan/adb')> | null = null;
let tangoUsbDaemonBridgeModulePromise: Promise<
  typeof import('@yume-chan/adb-daemon-webusb')
> | null = null;
let tangoServerNodeTcpModulePromise: Promise<
  typeof import('@yume-chan/adb-server-node-tcp')
> | null = null;
let usbTransferAsyncCompatibilityChecked = false;

function controllerHasAbortSignal() {
  let hasAbortSignal = false;

  try {
    const ProbeWritableStream = globalThis.WritableStream;
    new ProbeWritableStream({
      start(controller) {
        hasAbortSignal =
          typeof (controller as { signal?: AbortSignal }).signal?.addEventListener === 'function';
      },
    });
  } catch {
    return true;
  }

  return hasAbortSignal;
}

function attachAbortSignal(
  controller: unknown,
  abortController: AbortController,
): asserts controller is { signal: AbortSignal } {
  if (!controller || typeof controller !== 'object') {
    return;
  }

  const candidate = controller as { signal?: AbortSignal };
  if (typeof candidate.signal?.addEventListener === 'function') {
    return;
  }

  try {
    Object.defineProperty(candidate, 'signal', {
      configurable: true,
      enumerable: false,
      get: () => abortController.signal,
    });
  } catch {
    try {
      (candidate as Record<string, unknown>).signal = abortController.signal;
    } catch {
      // Ignore immutable controller objects.
    }
  }
}

function patchWritableStreamForBun() {
  if (writableStreamCompatibilityChecked) {
    return;
  }
  writableStreamCompatibilityChecked = true;

  if (
    typeof Bun === 'undefined' ||
    typeof globalThis.WritableStream !== 'function' ||
    typeof globalThis.AbortController !== 'function'
  ) {
    return;
  }

  if (controllerHasAbortSignal()) {
    return;
  }

  const NativeWritableStream = globalThis.WritableStream;

  class CompatibleWritableStream<W = unknown> extends NativeWritableStream<W> {
    constructor(underlyingSink?: UnderlyingSink<W>, strategy?: QueuingStrategy<W>) {
      if (!underlyingSink) {
        super(undefined, strategy);
        return;
      }

      const sinkAbortController = new AbortController();
      const wrappedSink: UnderlyingSink<W> = {};

      if (underlyingSink.start) {
        wrappedSink.start = (controller) => {
          attachAbortSignal(controller, sinkAbortController);
          return underlyingSink.start?.(controller);
        };
      }

      if (underlyingSink.write) {
        wrappedSink.write = (chunk, controller) => {
          attachAbortSignal(controller, sinkAbortController);
          return underlyingSink.write?.(chunk, controller);
        };
      }

      if (underlyingSink.close) {
        wrappedSink.close = () => {
          if (!sinkAbortController.signal.aborted) {
            sinkAbortController.abort();
          }
          return underlyingSink.close?.();
        };
      }

      if (underlyingSink.abort) {
        wrappedSink.abort = (reason) => {
          if (!sinkAbortController.signal.aborted) {
            sinkAbortController.abort(reason);
          }
          return underlyingSink.abort?.(reason);
        };
      }

      super(wrappedSink, strategy);
    }
  }

  globalThis.WritableStream = CompatibleWritableStream as typeof WritableStream;
}

function patchUsbTransferAsyncForBun(usbModule: Record<string, unknown>) {
  if (usbTransferAsyncCompatibilityChecked || typeof Bun === 'undefined') {
    return;
  }
  usbTransferAsyncCompatibilityChecked = true;

  const outEndpoint = usbModule['OutEndpoint'] as
    | { prototype?: { transferAsync?: unknown; transfer?: unknown } }
    | undefined;
  if (outEndpoint?.prototype && typeof outEndpoint.prototype.transfer === 'function') {
    outEndpoint.prototype.transferAsync = function transferAsync(
      this: {
        transfer(
          buffer: Buffer | Uint8Array,
          callback: (error: unknown, actual?: number) => void,
        ): void;
      },
      buffer: Buffer | Uint8Array,
    ) {
      return new Promise<number>((resolve, reject) => {
        this.transfer(buffer, (error: unknown, actual?: number) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(actual ?? 0);
        });
      });
    };
  }

  const inEndpoint = usbModule['InEndpoint'] as
    | { prototype?: { transferAsync?: unknown; transfer?: unknown } }
    | undefined;
  if (inEndpoint?.prototype && typeof inEndpoint.prototype.transfer === 'function') {
    inEndpoint.prototype.transferAsync = function transferAsync(
      this: {
        transfer(length: number, callback: (error: unknown, data?: Buffer) => void): void;
      },
      length: number,
    ) {
      return new Promise<Buffer>((resolve, reject) => {
        this.transfer(length, (error: unknown, data?: Buffer) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(data ?? Buffer.alloc(0));
        });
      });
    };
  }
}

export async function importTangoAdb() {
  patchWritableStreamForBun();
  tangoAdbModulePromise ??= import('@yume-chan/adb');
  return tangoAdbModulePromise;
}

export async function importTangoUsbDaemonBridge() {
  patchWritableStreamForBun();
  tangoUsbDaemonBridgeModulePromise ??= import('@yume-chan/adb-daemon-webusb');
  return tangoUsbDaemonBridgeModulePromise;
}

export async function importTangoServerNodeTcp() {
  patchWritableStreamForBun();
  tangoServerNodeTcpModulePromise ??= import('@yume-chan/adb-server-node-tcp');
  return tangoServerNodeTcpModulePromise;
}

export async function importUsbModule() {
  patchWritableStreamForBun();
  const usbModule = (await import('usb')) as Record<string, unknown>;
  patchUsbTransferAsyncForBun(usbModule);
  return usbModule;
}
