import { webcrypto } from 'crypto';
import type { PeachifyApiResponse } from './peachify.types.js';

const { subtle } = webcrypto;

// If decryption logs failures after step 1, this key needs updating from the source client
const ENCRYPTION_KEY_HEX =
    'a8f2a1b5e9c470814f6b2c3a5d8e7f9c1a2b3c4d5e3f7a8b8cad1e2d0a4d5c5d';

type EncryptedPayload = {
    iv: Uint8Array;
    ciphertext: Uint8Array;
    authTag: Uint8Array;
};

function base64UrlToBytes(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = Buffer.from(padded, 'base64');
    return new Uint8Array(binary);
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error('Invalid hex string length');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

async function importDecryptionKey(): Promise<webcrypto.CryptoKey> {
    return subtle.importKey(
        'raw',
        hexToBytes(ENCRYPTION_KEY_HEX), // No longer decoding from base64, reading raw hex directly
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );
}

function parsePayload(payload: string): EncryptedPayload {
    const parts = payload.split('.');
    if (parts.length !== 3) {
        throw new Error(
            'Invalid payload format. Expected: iv.ciphertext.authTag'
        );
    }
    const [ivPart, ciphertextPart, authTagPart] = parts;
    return {
        iv: base64UrlToBytes(ivPart),
        ciphertext: base64UrlToBytes(ciphertextPart),
        authTag: base64UrlToBytes(authTagPart)
    };
}

export default async function decryptPayload(
    payload: string
): Promise<PeachifyApiResponse | null> {
    try {
        const { iv, ciphertext, authTag } = parsePayload(payload);

        const encryptedData = new Uint8Array(
            ciphertext.length + authTag.length
        );
        encryptedData.set(ciphertext);
        encryptedData.set(authTag, ciphertext.length);

        const key = await importDecryptionKey();

        const decryptedBuffer = await subtle.decrypt(
            {
                name: 'AES-GCM',
                iv
            },
            key,
            encryptedData
        );

        const decryptedJson = new TextDecoder().decode(decryptedBuffer);
        return JSON.parse(decryptedJson) as PeachifyApiResponse;
    } catch (error) {
        // Output clear diagnostics to local terminal
        console.error('[Peachify Decrypt Engine Error]:', error instanceof Error ? error.message : error);
        return null;
    }
}