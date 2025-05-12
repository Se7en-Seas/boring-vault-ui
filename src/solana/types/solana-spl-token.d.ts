declare module '@solana/spl-token' {
  import { PublicKey, Connection, Transaction, TransactionInstruction } from '@solana/web3.js';
  
  export const TOKEN_PROGRAM_ID: PublicKey;
  export const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
  
  export function getAssociatedTokenAddress(
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve?: boolean,
    programId?: PublicKey,
    associatedTokenProgramId?: PublicKey
  ): Promise<PublicKey>;
  
  export const AccountLayout: {
    decode: (buffer: Buffer) => any;
    encode: (account: any) => Buffer;
  };
} 