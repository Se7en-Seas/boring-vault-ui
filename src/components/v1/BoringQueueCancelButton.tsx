// src/components/v1/BoringQueueCancelButton.tsx

import React, { useEffect, useState } from "react";
import { Box, Text, VStack, Button } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";

interface BoringQueueCancelButtonProps {
    token: Token;
}

const BoringQueueCancelButton: React.FC<BoringQueueCancelButtonProps> = ({
    token,
}) => {
    const { boringQueueCancel } = useBoringVaultV1();
    const signer = useEthersSigner();

    return (
        <Button
            mt={4}
            onClick={() => boringQueueCancel(signer!, token)}
            isDisabled={!signer}
            outline={"1px solid black"}
            colorScheme={"blue"}
        >
            Cancel
        </Button>
    );
};

export default BoringQueueCancelButton;
