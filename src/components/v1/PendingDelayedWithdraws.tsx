import React, { useEffect, useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import DelayWithdrawCancelButton from "./DelayWithdrawCancelButton";
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
      {title && (
        <Text fontSize={"md"} fontWeight={"bold"}>
          {title}
        </Text>
      )}
      <VStack>
        {statuses.map((delayWithdrawStatus, index) => {
          return (
            <Box
              key={index}
              padding={"1em"}
              outline={"1px solid black"}
              borderRadius={"1em"}
            >
              <HStack
                key={index}
                alignItems={"flex-start"}
              >
                <VStack
                  alignItems={"flex-start"}
                >
                  <Text>
                    <strong>Shares:</strong> {delayWithdrawStatus.shares}
                  </Text>
                  <Text>
                    <strong>Max Loss:</strong> {delayWithdrawStatus.maxLoss}%
                  </Text>
                  <Text>
                    <strong>Maturity (unix seconds):</strong>{" "}
                    {delayWithdrawStatus.maturity}
                  </Text>
                  <Text>
                    <strong>Exchange Rate @ Request:</strong>{" "}
                    {delayWithdrawStatus.exchangeRateAtTimeOfRequest}
                  </Text>
                  <Text>
                    <strong>Allow Third Party to Complete:</strong>{" "}
                    {delayWithdrawStatus.allowThirdPartyToComplete
                      ? "Yes"
                      : "No"}
                  </Text>
                  <Text>
                    <strong>Token Out:</strong>{" "}
                    {delayWithdrawStatus.token.displayName}
                  </Text>
                </VStack>
                <DelayWithdrawCancelButton token={delayWithdrawStatus.token} />
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
};

export default PendingDelayedWithdraws;
