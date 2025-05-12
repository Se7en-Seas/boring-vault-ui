import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';

/**
 * Get the address of the associated token account for a given mint and owner
 */
export async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  tokenProgramId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error('Owner is not on curve');
  }

  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  );

  return address;
}

/**
 * A simplified version of AccountLayout for decoding token accounts
 */
export const AccountLayout = {
  decode(data: Buffer) {
    // SPL Token Account Layout:
    // Offset 0: Mint (32 bytes)
    // Offset 32: Owner (32 bytes)
    // Offset 64: Amount (8 bytes)
    // ... other fields ...
    
    // Extract the amount (U64 LE)
    const amount = new BN(data.slice(64, 72), 'le');
    
    return {
      mint: new PublicKey(data.slice(0, 32)),
      owner: new PublicKey(data.slice(32, 64)),
      amount: amount.toString()
    };
  }
}; 