import React, { useEffect, useState } from "react";
import { Box, Text, VStack } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { useEthersSigner } from "../../hooks/ethers";

interface PendingDelayedWithdrawsProps {
  title?: string; // Optional title
}

// TODO Abstract away style into props above same as DepositButton
const PendingDelayedWithdraws: React.FC<PendingDelayedWithdrawsProps> = ({
  title,
  ...pendingDelayWithdrawProps
}) => {
  const { isConnected, userAddress, ethersProvider, delayWithdrawStatuses } =
    useBoringVaultV1();
  const [statuses, setStatuses] = useState<any[]>([]); // State to store fetched statuses
  const signer = useEthersSigner();

  useEffect(() => {
    const fetchStatuses = async () => {
      const fetchedStatuses = await delayWithdrawStatuses(signer!);
      setStatuses(fetchedStatuses);
    };

    fetchStatuses();
  }, [delayWithdrawStatuses, signer]);

  return (
    <Box outline={"5px solid black"} borderRadius={"1em"} padding={"1em"}>
      {title && <Text>{title}</Text>}
      <VStack>
        {statuses.map((delayWithdrawStatus, index) => {
          return (
            <Box
              key={index}
              padding={"1em"}
              outline={"1px solid black"}
              borderRadius={"1em"}
            >
              <Text>Shares {delayWithdrawStatus.shares} shares</Text>
              <Text>Max Loss: {delayWithdrawStatus.maxLoss}%</Text>
              <Text>
                Maturity (unix seconds): {delayWithdrawStatus.maturity}
              </Text>
              <Text>
                Exchange Rate @ Request:{" "}
                {delayWithdrawStatus.exchangeRateAtTimeOfRequest}
              </Text>
              <Text>
                Allow Third Party to Complete:{" "}
                {delayWithdrawStatus.allowThirdPartyToComplete ? "Yes" : "No"}
              </Text>
              <Text>Token Out: {delayWithdrawStatus.token.displayName}</Text>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
};

export default PendingDelayedWithdraws;
