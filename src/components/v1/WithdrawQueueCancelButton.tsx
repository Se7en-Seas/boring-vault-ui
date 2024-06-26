// src/components/v1/WithdrawQueueCancelButton.tsx

import React, { useEffect, useState } from "react";
import { Box, Text, VStack, Button } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";

interface WithdrawQueueCancelButtonProps {
  token: Token;
}

const WithdrawQueueCancelButton: React.FC<WithdrawQueueCancelButtonProps> = ({
  token,
}) => {
  const { withdrawQueueCancel } = useBoringVaultV1();
  const signer = useEthersSigner();

  return (
    <Button
      mt={4}
      onClick={() => withdrawQueueCancel(signer!, token)}
      isDisabled={!signer}
      outline={"1px solid black"}
      colorScheme={"blue"}
    >
      Cancel
    </Button>
  );
};

export default WithdrawQueueCancelButton;
