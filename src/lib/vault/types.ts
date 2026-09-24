export type EncryptedVaultItem = {
  id: string;
  ciphertext: string;
  iv: string;
  keyVersion: number;
  updatedAt: number;
};
