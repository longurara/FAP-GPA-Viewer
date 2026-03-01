/**
 * Credential Crypto Module
 * AES-GCM encryption for storing credentials securely.
 * 
 * Uses crypto.subtle with a per-installation key stored in chrome.storage.local.
 * Auto-migrates from old Base64 format.
 */
const CredentialCrypto = {
    _KEY_STORAGE: "_crypto_key_jwk",

    /**
     * Get or create the AES-GCM key (cached in memory after first load)
     */
    async _getKey() {
        if (this._cachedKey) return this._cachedKey;

        const stored = await new Promise(r =>
            chrome.storage.local.get(this._KEY_STORAGE, d => r(d[this._KEY_STORAGE]))
        );

        if (stored) {
            this._cachedKey = await crypto.subtle.importKey(
                "jwk", stored, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
            );
        } else {
            // First time — generate new key
            this._cachedKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
            );
            const jwk = await crypto.subtle.exportKey("jwk", this._cachedKey);
            await new Promise(r =>
                chrome.storage.local.set({ [this._KEY_STORAGE]: jwk }, r)
            );
        }
        return this._cachedKey;
    },

    /**
     * Encrypt a string → Base64(iv + ciphertext)
     */
    async encrypt(plaintext) {
        if (!plaintext) return "";
        const key = await this._getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv }, key, encoded
        );
        // Prepend IV to ciphertext, then Base64 encode
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        // Chunk-based conversion to avoid stack overflow with large payloads
        // (spread operator `...combined` would crash with RangeError on large arrays)
        let binary = "";
        const CHUNK = 8192;
        for (let i = 0; i < combined.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, combined.subarray(i, i + CHUNK));
        }
        return "aes:" + btoa(binary);
    },

    /**
     * Decrypt a string from Base64(iv + ciphertext)
     * Also handles legacy Base64 format (auto-migration)
     */
    async decrypt(stored) {
        if (!stored) return "";

        // Legacy Base64 format (no "aes:" prefix) — auto-migration path
        // BUG-10 FIX: Replaced deprecated escape()/unescape() with TextDecoder.
        if (!stored.startsWith("aes:")) {
            try {
                const bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
                return new TextDecoder().decode(bytes);
            } catch { return ""; }
        }

        const key = await this._getKey();
        const raw = stored.slice(4); // Remove "aes:" prefix
        const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv }, key, ciphertext
        );
        return new TextDecoder().decode(decrypted);
    },

    _cachedKey: null,
};

// Expose globally
window.CredentialCrypto = CredentialCrypto;
