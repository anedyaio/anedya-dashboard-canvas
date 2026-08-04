const ZSTD_LEVEL = 19;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface ZstdSignalingHelpers {
  sdpCompress: (jsonStr: string) => string;
  sdpDecompress: (b64Str: string) => string;
}

let zstdInitPromise: Promise<ZstdSignalingHelpers> | null = null;

const bytesToB64 = (u8: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

export async function getZstdSignaling(): Promise<ZstdSignalingHelpers> {
  if (!zstdInitPromise) {
    zstdInitPromise = (async () => {
      // Import zstd module from src vendor directory
      const zstdModule = await import('../vendor/zstd/index.web.js');
      await zstdModule.init();

      const dictResp = await fetch('/vendor/zstd-dict.bin');
      if (!dictResp.ok) {
        throw new Error(`Failed to load zstd-dict.bin (HTTP ${dictResp.status})`);
      }
      const dictBuffer = await dictResp.arrayBuffer();
      const dict = new Uint8Array(dictBuffer);

      const cctx = zstdModule.createCCtx();
      const dctx = zstdModule.createDCtx();

      const sdpCompress = (jsonStr: string): string => {
        const inputBytes = encoder.encode(jsonStr);
        const compressed = zstdModule.compressUsingDict(cctx, inputBytes, dict, ZSTD_LEVEL);
        return bytesToB64(compressed);
      };

      const sdpDecompress = (b64Str: string): string => {
        const compressedBytes = b64ToBytes(b64Str);
        const decompressed = zstdModule.decompressUsingDict(dctx, compressedBytes, dict);
        return decoder.decode(decompressed);
      };

      return { sdpCompress, sdpDecompress };
    })();
  }

  return zstdInitPromise;
}

export async function compressSdpZstd(jsonStr: string): Promise<string> {
  const { sdpCompress } = await getZstdSignaling();
  return sdpCompress(jsonStr);
}

export async function decompressSdpZstd(b64Str: string): Promise<string> {
  const { sdpDecompress } = await getZstdSignaling();
  return sdpDecompress(b64Str);
}
