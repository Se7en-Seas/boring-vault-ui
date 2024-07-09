import React, { useEffect, useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { useEthersSigner } from "../../hooks/ethers";
import { WithdrawQueueStatus } from "../../types";
import WithdrawQueueCancelButton from "./WithdrawQueueCancelButton";

interface PendingWithdrawQueueStatusesProps {
  title?: string; // Optional title
}

// TODO Abstract away style into props above same as DepositButton
const PendingWithdrawQueueStatuses: React.FC<
  PendingWithdrawQueueStatusesProps
> = ({ title, ...pendingWithdrawQueueProps }) => {
  const { ethersProvider, withdrawQueueStatuses } = useBoringVaultV1();
  const [statuses, setStatuses] = useState<any[]>([]); // State to store fetched statuses
  const signer = useEthersSigner();

  useEffect(() => {
    const fetchStatuses = async () => {
      if (!signer) return;

      const fetchedStatuses: WithdrawQueueStatus[] =
        await withdrawQueueStatuses(signer!);
      setStatuses(fetchedStatuses);
    };

    fetchStatuses();
    console.log("withdrawQueueStatuses", withdrawQueueStatuses);
  }, [withdrawQueueStatuses, signer]);

  return (
    <Box outline={"5px solid black"} borderRadius={"1em"} padding={"1em"}>
      {title && (
        <Text fontSize={"md"} fontWeight={"bold"}>
          {title}
        </Text>
      )}
      <VStack>
        {statuses.map((withdrawStatus: WithdrawQueueStatus, index) => {
          return (
            <Box
              key={index}
              padding={"1em"}
              outline={"1px solid black"}
              borderRadius={"1em"}
            >
              <HStack key={index} alignItems={"flex-start"}>
                <VStack alignItems={"flex-start"}>
                  <Text>
                    <strong>Shares Withdrawing:</strong>{" "}
                    {withdrawStatus.sharesWithdrawing}
                  </Text>
                  <Text>
                    <strong>Token Out:</strong>{" "}
                    {withdrawStatus.tokenOut.displayName}
                  </Text>
                  <Text>
                    <strong>Expiration (unix seconds):</strong>{" "}
                    {withdrawStatus.deadlineUnixSeconds}
                  </Text>
                  <Text>
                    <strong>Target Token Price:</strong>{" "}
                    {withdrawStatus.minSharePrice}
                  </Text>
                </VStack>
                <VStack paddingLeft="1em">
                  <WithdrawQueueCancelButton token={withdrawStatus.tokenOut} />
                </VStack>
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
};

export default PendingWithdrawQueueStatuses;
