// src/components/v1/PendingDelayedWithdraws.tsx

import React from "react";

import { Box, Text, VStack } from "@chakra-ui/react";

import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";
import { erc20Abi } from "viem";
import { useEthersSigner } from "../../hooks/ethers";

interface PendingDelayedWithdrawsProps {
  title?: string; // Optional title
}

// TODO Abstract away style into props above same as DepositButton
const PendingDelayedWithdraws: React.FC<PendingDelayedWithdrawsProps> = ({
  title,
  ...pendingDelayWithdrawProps
}) => {
  const { isConnected, userAddress, ethersProvider } = useBoringVaultV1();

  return (
    <Box outline={"1px solid black"} borderRadius={"5em"} padding={"1em"}>
      {title && <Text>{title}</Text>}
      
    </Box>
  );
};

export default PendingDelayedWithdraws;
