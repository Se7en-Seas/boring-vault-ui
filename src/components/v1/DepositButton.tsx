// src/components/v1/DepositButton.tsx
import React, { useEffect } from "react";
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  ButtonProps,
  ModalProps,
  ModalOverlayProps,
  ModalContentProps,
  ModalBodyProps,
  ModalCloseButtonProps,
  Text,
  HStack,
  VStack,
  Box,
  Image,
  Select,
  InputGroup,
  Input,
  InputRightElement,
  FormControl,
  Flex,
  FormHelperText,
  FormLabel,
  InputProps,
  ButtonGroup,
  ModalHeader,
  ModalFooter,
  Avatar,
  useToast,
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";
import { erc20Abi } from "viem";
import { useEthersSigner } from "../../hooks/ethers";
import { useAccount } from "wagmi";

interface DepositButtonProps {
  buttonText: string;
  popupText: string;
  title?: string; // Optional title
  bottomText?: string; // Optional bottom text (e.g. disclaimer, etc.)
  buttonProps?: ButtonProps;
  modalProps?: ModalProps;
  modalOverlayProps?: ModalOverlayProps;
  modalContentProps?: ModalContentProps;
  modalBodyProps?: ModalBodyProps;
  modalCloseButtonProps?: ModalCloseButtonProps;
  inputProps?: any;
}

const DepositButton: React.FC<DepositButtonProps> = ({
  buttonText,
  buttonProps,
  modalProps,
  modalOverlayProps,
  modalContentProps,
  modalBodyProps,
  modalCloseButtonProps,
  inputProps,
  title,
  bottomText,
  ...depositButtonProps
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    depositTokens,
    ethersProvider,
    deposit,
    depositStatus,
    depositWithPermit
  } = useBoringVaultV1();

  const [selectedToken, setSelectedToken] = React.useState<Token>(
    depositTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);
  const [depositAmount, setDepositAmount] = React.useState("");
  const signer = useEthersSigner();

  useEffect(() => {
    async function fetchBalance() {
      console.log("Token:", selectedToken);

      if (!signer || !selectedToken || !ethersProvider) return;

      try {
        const tokenContract = new Contract(
          selectedToken.address,
          erc20Abi,
          ethersProvider
        );

        const tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
        const formattedBalance = parseFloat(
          formatUnits(tokenBalance, selectedToken.decimals)
        );
        setBalance(formattedBalance);
      } catch (error) {
        console.error("Failed to fetch token balance:", error);
        setBalance(0); // Optionally reset balance on error
      }
    }

    fetchBalance();
  }, [signer, selectedToken, ethersProvider]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTokenAddress = event.target.value;
    console.log("New token address:", newTokenAddress);
    console.log("Deposit tokens:", depositTokens);
    const newSelectedToken = depositTokens.find(
      (token) => token.address === newTokenAddress
    );
    setSelectedToken(newSelectedToken || depositTokens[0]);
  };

  // TODO: Allow people to pass in a toast to allow for custom toast branding
  const toast = useToast();
  useEffect(() => {
    if (depositStatus.loading) {
      toast({
        title: "Processing deposit...",
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    } else if (depositStatus.success) {
      toast({
        title: "Deposit successful",
        // Add link to etherscan
        description: `Transaction hash: ${depositStatus.tx_hash}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } else if (depositStatus.error) {
      toast({
        title: "Failed to deposit",
        description: depositStatus.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [depositStatus, toast]);
  const isButtonDisabled = !signer ||
    !depositAmount ||
    parseFloat(depositAmount || "0") <= 0 ||
    parseFloat(depositAmount || "0") > balance ||
    depositStatus.loading;

  return (
    <>
      <Button onClick={onOpen} isDisabled={!useAccount().isConnected} {...buttonProps}>
        {buttonText}
      </Button>
      <Modal isOpen={isOpen} onClose={onClose} isCentered {...modalProps}>
        <ModalOverlay {...modalOverlayProps} />
        <ModalContent {...modalContentProps}>
          {title && <ModalHeader>{title}</ModalHeader>}
          <ModalCloseButton {...modalCloseButtonProps} />
          <ModalBody {...modalBodyProps}>
            <Flex
              alignItems="center"
              justifyContent="space-between"
              width={"100%"}
            >
              <Select
                onChange={handleSelectChange}
                value={selectedToken.address}
                icon={
                  <Avatar
                    size="lg"
                    src={selectedToken.image}
                    onChange={handleSelectChange}
                  />
                }
              >
                {depositTokens.map((token) => (
                  <>
                    <Avatar size="l" src={token.image} />
                    <option key={token.address} value={token.address}>
                      {token.displayName}
                    </option>
                  </>
                ))}
              </Select>
              <FormControl>
                {/* TODO: Sterilize input to only allow positive numbers */}
                <Input
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  {...inputProps}
                />
                <FormHelperText textAlign="right">
                  Balance: {balance.toFixed(6)} {selectedToken.displayName}
                  <Button
                    size="xs"
                    ml={2}
                    onClick={() => setDepositAmount(balance.toString())}
                  >
                    MAX
                  </Button>
                </FormHelperText>
              </FormControl>
            </Flex>
            <Flex justifyContent="space-between" mt={2}>
              <Text>${0.0}</Text>{" "}
              {/* Example static value, replace with actual conversion */}
              <Button
                mt={4}
                onClick={() => deposit(signer!, depositAmount, selectedToken)}
                isDisabled={isButtonDisabled}
                isLoading={depositStatus.loading}
                loadingText="Depositing..."
                colorScheme="blue"
                {...depositButtonProps}
              >
                Deposit
              </Button>

              <Button
                mt={4}
                onClick={() => depositWithPermit(signer!, depositAmount, selectedToken)}
                isDisabled={
                  !signer ||
                  !depositAmount ||
                  parseFloat(depositAmount || "0") <= 0 ||
                  parseFloat(depositAmount || "0") > balance ||
                  depositStatus.loading
                }
                isLoading={depositStatus.loading}
                loadingText="Depositing..."
                colorScheme="green"
                {...depositButtonProps}
              >
                Deposit with Permit
              </Button>
            </Flex>
          </ModalBody>
          {bottomText && (
            <ModalFooter justifyContent="center">
              <Text fontSize="sm">{bottomText}</Text>
            </ModalFooter>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default DepositButton;
