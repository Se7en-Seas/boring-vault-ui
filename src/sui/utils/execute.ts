import { fromBase64 } from "@mysten/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { readFileSync } from "fs";
import path from "path";
import { homedir } from "os";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

export type Network = "mainnet" | "testnet" | "devnet" | "localnet";

export const getSigner = (sender: string) => {
  const keystore = JSON.parse(
    readFileSync(
      path.join(homedir(), ".sui", "sui_config", "sui.keystore"),
      "utf8"
    )
  );

  for (const priv of keystore) {
    const raw = fromBase64(priv);
    if (raw[0] !== 0) {
      continue;
    }

    const pair = Ed25519Keypair.fromSecretKey(raw.slice(1));
    if (pair.getPublicKey().toSuiAddress() === sender) {
      return pair;
    }
  }

  throw new Error(`keypair not found for sender: ${sender}`);
};

/** Get the client for the specified network. */
export const getClient = (network: Network) => {
  return new SuiClient({ url: getFullnodeUrl(network) });
};

export const signAndExecute = async (
  tx: Transaction,
  network: Network,
  publisher: string
) => {
  const client = getClient(network);
  const signer = getSigner(publisher);

  let result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  await client.waitForTransaction({ digest: result.digest });

  return result;
};

export const devInspect = async (
  tx: Transaction,
  network: Network,
  publisher: string
) => {
  const client = getClient(network);

  let result = await client.devInspectTransactionBlock({
    sender: publisher,
    transactionBlock: tx,
  });

  return result;
}