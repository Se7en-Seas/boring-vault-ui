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
} from "@chakra-ui/react";
import { useBoringVaultV1 } from "../../contexts/v1/BoringVaultContextV1";
import { Token } from "../../types";
import { Contract, formatUnits } from "ethers";

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
// src/components/v1/DepositButton.tsx
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
  const { depositTokens, isConnected, userAddress, ethersProvider } =
    useBoringVaultV1();

  const [selectedToken, setSelectedToken] = React.useState<Token>(
    depositTokens[0]
  );
  const [balance, setBalance] = React.useState(0.0);

  useEffect(() => {
    async function fetchBalance() {
      console.log("Token:", selectedToken);

      if (!userAddress || !selectedToken || !ethersProvider) return;

      try {
        const tokenContract = new Contract(
          selectedToken.address,
          selectedToken.abi,
          ethersProvider
        );

        const tokenBalance = await tokenContract.balanceOf(userAddress);
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
  }, [userAddress, selectedToken, ethersProvider]);

 const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
   const newTokenAddress = event.target.value;
   console.log("New token address:", newTokenAddress)
   console.log("Deposit tokens:", depositTokens)
   const newSelectedToken = depositTokens.find(
     (token) => token.address === newTokenAddress
   );
   setSelectedToken(newSelectedToken || depositTokens[0]);
 };

  return (
    <>
      <Button onClick={onOpen} isDisabled={!isConnected} {...buttonProps}>
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
                <Input placeholder="0.00" {...inputProps} />
                <FormHelperText textAlign="right">
                  Balance: {balance} <Button size="xs">MAX</Button>
                </FormHelperText>
              </FormControl>
            </Flex>
            <Flex justifyContent="space-between" mt={2}>
              <Text>${0.0}</Text>{" "}
              {/* Example static value, replace with actual conversion */}
              <Button {...depositButtonProps}>Deposit</Button>
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
