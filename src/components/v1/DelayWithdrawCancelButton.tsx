// src/components/v1/DelayWithdrawCancelButton.tsx

import React, { useEffect, useState } from "react";
import { Box, Text, VStack, Button } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";

interface DelayWithdrawCancelButtonProps {
  token: Token;
}

const DelayWithdrawCancelButton: React.FC<DelayWithdrawCancelButtonProps> = ({
  token,
}) => {
  const { delayWithdrawCancel } = useBoringVaultV1();
  const signer = useEthersSigner();

  return (
    <Button
      mt={4}
      onClick={() => delayWithdrawCancel(
        signer!,
        token
      )}
      isDisabled={!signer}
      outline={"1px solid black"}
      colorScheme={"blue"}
    >
      Cancel
    </Button>
  );
};

export default DelayWithdrawCancelButton;
