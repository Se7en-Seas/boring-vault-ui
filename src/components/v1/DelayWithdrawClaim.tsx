// src/components/v1/DelayWithdrawClaim.tsx

import React, { useEffect, useState } from "react";
import { Box, Text, VStack, Button } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";

interface DelayWithdrawClaimProps {
  token: Token;
  unixSecondsReadyToClaim: number;
}

const DelayWithdrawClaim: React.FC<DelayWithdrawClaimProps> = ({
  token,
  unixSecondsReadyToClaim,
}) => {
  const { delayWithdrawComplete } = useBoringVaultV1();
  const signer = useEthersSigner();

  // Check if the user can claim the delayed withdraw based on the seconds to claim
  // If the current time is greater than the unixSecondsReadyToClaim, the user can claim
  const canClaim = Date.now() / 1000 > unixSecondsReadyToClaim;

  return (
    <Button
      mt={4}
      onClick={() => delayWithdrawComplete(signer!, token)}
      isDisabled={!signer || !canClaim}
      outline={"1px solid black"}
      colorScheme={"green"}
    >
      Claim
    </Button>
  );
};

export default DelayWithdrawClaim;
