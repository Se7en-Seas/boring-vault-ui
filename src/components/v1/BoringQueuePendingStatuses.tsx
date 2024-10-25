import React, { useEffect, useState } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { useEthersSigner } from "../../hooks/ethers";
import { BoringQueueStatus, WithdrawQueueStatus } from "../../types";
import BoringQueueCancelButton from "./BoringQueueCancelButton";

interface PendingBoringQueueStatusesProps {
    title?: string; // Optional title
}

// TODO Abstract away style into props above same as DepositButton
const PendingBoringQueueStatuses: React.FC<
    PendingBoringQueueStatusesProps
> = ({ title, ...pendingBoringQueueProps }) => {
    const { ethersProvider, boringQueueStatuses } = useBoringVaultV1();
    const [statuses, setStatuses] = useState<any[]>([]); // State to store fetched statuses
    const signer = useEthersSigner();

    useEffect(() => {
        const fetchStatuses = async () => {
            if (!signer) return;

            const fetchedStatuses: BoringQueueStatus[] =
                await boringQueueStatuses(signer!);
            setStatuses(fetchedStatuses);
        };

        fetchStatuses();
        console.log("boringQueueStatuses", boringQueueStatuses);
    }, [boringQueueStatuses, signer]);

    return (
        <Box outline={"5px solid black"} borderRadius={"1em"} padding={"1em"}>
            {title && (
                <Text fontSize={"md"} fontWeight={"bold"}>
                    {title}
                </Text>
            )}
            <VStack>
                {statuses.map((withdrawStatus: BoringQueueStatus, index) => {
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
                                        <strong>Tokens Out:</strong>{" "}
                                        {withdrawStatus.tokenOut.displayName}
                                    </Text>
                                    <Text>
                                        <strong>Expiration (unix seconds):</strong>{" "}
                                        {withdrawStatus.secondsToDeadline}
                                    </Text>
                                </VStack>
                                <VStack paddingLeft="1em">
                                    <BoringQueueCancelButton
                                        token={withdrawStatus.tokenOut}
                                    />
                                </VStack>
                            </HStack>
                        </Box>
                    );
                })}
            </VStack>
        </Box>
    );
};

export default PendingBoringQueueStatuses;
